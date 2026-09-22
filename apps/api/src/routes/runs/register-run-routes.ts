// Registers run endpoints and delegates lifecycle work to pipelines and record stores.
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  apiErrorResponseSchema,
  codeRunSnapshotSchema,
  documentRunSnapshotSchema,
  designRunSnapshotSchema,
  queuedRunEventSchema,
  runSnapshotSchema,
  repairRequirementRulesRequestSchema,
  repairRequirementRuleRequestSchema,
  startCodeRunRequestSchema,
  startCodeRunResponseSchema,
  startDesignRunRequestSchema,
  startDesignRunResponseSchema,
  startDocumentRunRequestSchema,
  startDocumentRunResponseSchema,
  startRunRequestSchema,
  startRunResponseSchema,
  type CodeRunSnapshot,
  type DocumentLibraryItem,
  type ProviderSettings,
  type RunStage,
  type StartCodeRunRequest,
  type StartDesignRunRequest,
  type StartDocumentRunRequest,
  type StartRunRequest,
} from "@uml-platform/contracts";
import type { LlmTransport } from "../../llm.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import type { LlmScheduler } from "../../adapters/llm/llm-scheduler.js";
import { projectDocumentWorkspaceId } from "../../documents/library/project-document-workspace.js";
import {
  createEmptyCodeSnapshot,
  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptySnapshot,
} from "../../runs/records/snapshots.js";
import {
  emitEvent,
  refreshProjectRunRecordsIfAvailable,
  refreshRunRecordIfAvailable,
  type RunRecord,
  type RunRecordMetadata,
  type RunRecordStore,
} from "../../runs/records/run-record-store.js";
import { cancelRunRecord } from "../../runs/records/run-actions.js";
import {
  projectRecordMatchesFilters,
  queryValue,
  summarizeRunRecord,
} from "../../runs/records/run-record-summaries.js";
import { registerRunEventsRoute } from "../../runs/records/run-events.js";
import { assertRequirementBaselineAllowsDownstream } from "../../runs/baselines/requirement-baseline.js";
import { stageProgressValue } from "../../runs/pipelines/shared/pipeline-events.js";
import { normalizeRunError } from "../../runs/pipelines/shared/errors.js";
import {
  handleRunPipelineError,
  startRunRecordPipeline,
} from "../../runs/pipelines/run-record-pipeline-starter.js";
import {
  checkGenerationUsageLimit,
  checkProviderUsageLimit,
  recordGenerationUsage,
  recordProviderUsage,
  rememberProviderSettings,
  resolveProviderConfigIdForRun,
  resolveProviderSettingsForRun,
} from "../../runs/providers/run-provider-gates.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import type {
  ProviderTaskType,
  ProviderRateLimitPolicy,
  ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import { resolveProviderRateLimitPolicy } from "../../provider-configs/provider-usage-tracker.js";
import type { GenerationUsageService } from "../../generation/generation-usage.js";
import type { BillingService } from "../../billing/billing-service.js";
import { reserveBillingRunUsage } from "../../runs/billing/run-billing-gates.js";
import { RUN_ROUTE_CONFIG } from "./run-route-config.js";
import type { AdminAnalyticsStore } from "../../admin/admin-analytics-store.js";
import {
  resolveCodeRunInput,
  resolveDesignRunInput,
  resolveDocumentRunInput,
  resolveRequirementRunInput,
  type LoadProjectWorkspaceForRun,
} from "./run-input-resolution.js";
import {
  applyBatchRequirementRepairSuggestions,
  applyRequirementRepairSuggestion,
  buildRequirementRuleRepairMessages,
  buildRequirementRulesRepairMessages,
} from "../../runs/repairs/requirement-rule-repair.js";
import { collectTextResult } from "../../runs/pipelines/shared/structured-output.js";
import {
  getRepairRequirementRuleResponseFormat,
  getRepairRequirementRulesResponseFormat,
} from "../../adapters/llm/response-formats/index.js";
import {
  canReadProjectRuns,
  canReadRunRecord,
  defaultRunAccessGuard,
  metadataForStartedRun,
  resolveProjectRunPermission,
  runAccessDeniedMessage,
  type RunAccessGuard,
} from "./run-access.js";
import { createProjectRunAction } from "../../runs/actions/project-run-actions.js";
import {
  completeOfflineDemoCodeRun,
  completeOfflineDemoDesignRun,
  completeOfflineDemoRequirementRun,
  createOfflineDemoDocumentInput,
  createOfflineDemoRequirementRuleRepair,
  createOfflineDemoRequirementRulesRepair,
  isOfflineDemoProject,
  offlineDemoLlmTransport,
  offlineDemoProviderSettings,
} from "../../runs/demo/offline-demo-runs.js";
import { emitOfflineDemoActivity } from "../../runs/demo/offline-demo-activity.js";
import {
  attachProjectWorkspaceSync,
  type ProjectWorkspaceSync,
} from "./project-workspace-sync.js";
import {
  flushRunStoreIfAvailable,
  type RunQueue,
} from "../../runs/queue/run-queue.js";

export type { RunAccessContext, RunAccessGuard } from "./run-access.js";

function isActiveRunRecord(record: RunRecord) {
  return (
    !record.terminal &&
    (record.snapshot.status === "running" || record.snapshot.status === "queued")
  );
}

function documentWorkspaceIdForRun(record: RunRecord) {
  const projectId = record.metadata?.projectId;
  return projectId ? projectDocumentWorkspaceId(projectId) : null;
}

function unresolvedProviderSettingsResponse(reply: FastifyReply) {
  const statusCode = reply.statusCode;
  const code = statusCode === 401
    ? "AUTHENTICATION_REQUIRED"
    : statusCode === 503
      ? "PROVIDER_CIRCUIT_OPEN"
      : statusCode >= 500
        ? "INTERNAL_ERROR"
        : "PROVIDER_CONFIG_INVALID";
  return apiErrorResponseSchema.parse({
    error: {
      code,
      category: statusCode === 401
        ? "authentication"
        : statusCode >= 500 && statusCode !== 503
          ? "internal"
          : "provider",
      retryable: statusCode >= 500 && statusCode !== 503,
    },
  });
}

function requirementRepairFailure(error: unknown) {
  const runError = normalizeRunError(error);
  const statusCode = runError.code === "PLATFORM_PROVIDER_RATE_LIMITED"
    ? 429
    : runError.code === "PLATFORM_PROVIDER_TIMEOUT"
      ? 504
      : runError.category === "platform_provider"
        ? 502
        : runError.code === "RUN_STRUCTURED_OUTPUT_INVALID" || runError.code === "RUN_MODEL_OUTPUT_EMPTY"
          ? 422
          : 500;
  return {
    code: runError.code,
    safeMessage: runError.code === "PLATFORM_PROVIDER_AUTH_FAILED"
      ? "模型供应商鉴权失败，无法完成当前规则修复。"
      : runError.code === "PLATFORM_PROVIDER_RATE_LIMITED"
        ? "模型供应商请求过于频繁，请稍后重新修复。"
        : runError.code === "PLATFORM_PROVIDER_TIMEOUT"
          ? "模型供应商响应超时，请稍后重新修复。"
          : runError.code === "PLATFORM_PROVIDER_UNAVAILABLE"
            ? "模型供应商暂时不可用，请稍后重新修复。"
            : "模型返回的修复结果不完整或格式无效，请重新修复。",
    statusCode,
    response: apiErrorResponseSchema.parse({
      error: {
        code: runError.code,
        category: runError.category === "platform_provider" ? "provider" : "internal",
        retryable: runError.retryable,
      },
    }),
  };
}

async function currentDocumentForRun(
  record: RunRecord,
  documentLibrary: DocumentLibrary,
): Promise<DocumentLibraryItem | null> {
  if (!("documentKind" in record.snapshot)) return null;
  const workspaceId = documentWorkspaceIdForRun(record);
  if (!workspaceId || !record.snapshot.documentId) return null;
  if (typeof documentLibrary.getDocument !== "function") return null;
  return documentLibrary.getDocument(workspaceId, record.snapshot.documentId, {
    includeDeleted: true,
  });
}

async function summarizeRunRecordWithCurrentDocument(
  record: RunRecord,
  documentLibrary: DocumentLibrary,
) {
  const summary = summarizeRunRecord(record);
  const document = await currentDocumentForRun(record, documentLibrary);
  if (!document) return summary;
  return {
    ...summary,
    documentDownloadAvailable:
      summary.documentDownloadAvailable && document.status === "active",
    documentId: document.id,
    documentFileName: document.fileName,
    documentVersion: document.version,
    documentStatus: document.status,
    documentRestoreAvailable: document.status === "deleted",
    documentByteLength: document.byteLength,
  };
}

type RequirementPipeline = (
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) => Promise<void>;

type DesignPipeline = (
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) => Promise<void>;

type CodePipeline = (
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
) => Promise<void>;

type DocumentPipeline = (
  record: RunRecord,
  input: StartDocumentRunRequest,
  documentLibrary: DocumentLibrary,
  workspaceId: string,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  pngRenderClient: PngRenderClient,
  onPreparedStage?: (stage: RunStage) => Promise<void>,
) => Promise<void>;

type RunBillingEntitlements = Pick<
  BillingService,
  "reserveRunUsage" | "confirmRunUsage" | "releaseRunUsage" | "compensateRunUsage"
>;

export function registerRunRoutes({
  app,
  runs,
  documentLibrary,
  llmTransport,
  renderClient,
  pngRenderClient,
  defaultSseAllowOrigin,
  runStagePipeline,
  runDesignStagePipeline,
  runCodeStagePipeline,
  runDocumentStagePipeline,
  addCodeDiagnostic,
  runAccessGuard = defaultRunAccessGuard,
  providerConfigs,
  resolveProjectName,
  providerUsageTracker,
  generationUsage,
  billingEntitlements,
  providerRateLimitPolicy = resolveProviderRateLimitPolicy(),
  llmScheduler,
  loadProjectWorkspace,
  syncProjectWorkspace,
  runQueue,
  analyticsStore,
}: {
  app: FastifyInstance;
  runs: RunRecordStore;
  documentLibrary: DocumentLibrary;
  llmTransport: LlmTransport;
  renderClient: RenderClient;
  pngRenderClient: PngRenderClient;
  defaultSseAllowOrigin: string;
  runStagePipeline: RequirementPipeline;
  runDesignStagePipeline: DesignPipeline;
  runCodeStagePipeline: CodePipeline;
  runDocumentStagePipeline: DocumentPipeline;
  addCodeDiagnostic: (
    snapshot: CodeRunSnapshot,
    stage: RunStage,
    message: string,
  ) => void;
  runAccessGuard?: RunAccessGuard;
  providerConfigs?: ProviderConfigStore;
  resolveProjectName?: (projectId: string) => Promise<string | null | undefined>;
  providerUsageTracker?: ProviderUsageTracker;
  generationUsage?: GenerationUsageService;
  billingEntitlements?: Pick<
    BillingService,
    "reserveRunUsage" | "confirmRunUsage" | "releaseRunUsage" | "compensateRunUsage"
  >;
  providerRateLimitPolicy?: ProviderRateLimitPolicy;
  llmScheduler?: LlmScheduler;
  loadProjectWorkspace?: LoadProjectWorkspaceForRun;
  syncProjectWorkspace?: ProjectWorkspaceSync;
  runQueue?: RunQueue;
  analyticsStore?: Pick<AdminAnalyticsStore, "recordTelemetry">;
}) {
  const sideEffectRecords = new WeakSet<RunRecord>();
  const attachRunSideEffects = (record: RunRecord) => {
    if (sideEffectRecords.has(record)) return;
    sideEffectRecords.add(record);
    attachProjectWorkspaceSync(record, syncProjectWorkspace);
    runQueue?.attachEventPublisher(record);
  };

  const startRecordPipeline = async ({
    record,
    providerSettings,
    providerConfigId,
    billingEntitlements: runBillingEntitlements,
    documentInput,
  }: {
    record: RunRecord;
    providerSettings: ProviderSettings;
    providerConfigId: string | null;
    billingEntitlements?: RunBillingEntitlements;
    documentInput?: StartDocumentRunRequest;
  }) => {
    attachRunSideEffects(record);
    if (runQueue?.enabled) {
      await flushRunStoreIfAvailable(runs);
      await runQueue.enqueueRun({ record, documentInput });
      return;
    }
    startRunRecordPipeline({
      record,
      providerSettings,
      providerConfigId,
      llmTransport,
      llmScheduler,
      renderClient,
      pngRenderClient,
      documentLibrary,
      runStagePipeline,
      runDesignStagePipeline,
      runCodeStagePipeline,
      runDocumentStagePipeline,
      addCodeDiagnostic,
      documentInput,
      billingEntitlements: runBillingEntitlements,
      analyticsStore,
    });
  };

  const billingEntitlementsForProvider = async ({
    providerConfigId,
    metadata,
  }: {
    providerConfigId: string | null;
    metadata?: RunRecordMetadata;
  }): Promise<RunBillingEntitlements | undefined> => {
    if (!billingEntitlements) return undefined;
    if (!providerConfigId || !providerConfigs) return billingEntitlements;
    const providerConfig = await providerConfigs.get(providerConfigId);
    if (
      providerConfig?.scopeType === "user" &&
      metadata?.userId &&
      providerConfig.scopeId === metadata.userId
    ) {
      return undefined;
    }
    return billingEntitlements;
  };

  const isOfflineDemoRun = async (projectId: string | null | undefined) => {
    if (!projectId) return false;
    if (isOfflineDemoProject(projectId)) return true;
    if (!resolveProjectName) return false;
    return isOfflineDemoProject(projectId, await resolveProjectName(projectId));
  };

  const handleOfflineDemoError = (record: RunRecord, error: unknown) => {
    handleRunPipelineError(record, error, addCodeDiagnostic);
  };

  const rejectBlockedRequirementBaseline = (
    reply: FastifyReply,
    baseline: StartDesignRunRequest["requirementBaseline"] | StartDocumentRunRequest["requirementBaseline"],
  ) => {
    if (!baseline) return null;
    try {
      assertRequirementBaselineAllowsDownstream(baseline);
      return null;
    } catch {
      reply.code(409);
      return apiErrorResponseSchema.parse({
        error: {
          code: "REQUIREMENT_BASELINE_BLOCKED",
          category: "conflict",
          retryable: false,
        },
      });
    }
  };

  app.post("/api/runs/requirement-rule-repair", async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "start_runs",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    const input = repairRequirementRuleRequestSchema.parse(request.body);
    if (await isOfflineDemoRun(input.projectId ?? metadata?.projectId)) {
      return createOfflineDemoRequirementRuleRepair(input);
    }
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      request,
      reply,
    });
    if (!providerSettings) {
      return unresolvedProviderSettingsResponse(reply);
    }
    const providerConfigId = await resolveProviderConfigIdForRun({
      providerSettings: input.providerSettings,
    });
    const limitCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "requirements_to_uml",
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;

    let rawOutput = "";
    try {
      rawOutput = await collectTextResult(
        llmTransport,
        providerSettings,
        buildRequirementRuleRepairMessages(input),
        () => undefined,
        getRepairRequirementRuleResponseFormat(providerSettings),
      );
      const result = applyRequirementRepairSuggestion(input, rawOutput);
      await recordProviderUsage({
        usageTracker: providerUsageTracker,
        providerConfigId,
        metadata,
        request,
        taskType: "requirements_to_uml",
      });
      return result;
    } catch (error) {
      const failure = requirementRepairFailure(error);
      request.log.warn(
        { errorCode: failure.code },
        "Requirement rule repair failed",
      );
      reply.code(failure.statusCode);
      return failure.response;
    }
  });

  app.post("/api/runs/requirement-rule-repairs", async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "start_runs",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    const input = repairRequirementRulesRequestSchema.parse(request.body);
    if (await isOfflineDemoRun(input.projectId ?? metadata?.projectId)) {
      return createOfflineDemoRequirementRulesRepair(input);
    }
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      request,
      reply,
    });
    if (!providerSettings) {
      return unresolvedProviderSettingsResponse(reply);
    }
    const providerConfigId = await resolveProviderConfigIdForRun({
      providerSettings: input.providerSettings,
    });
    const limitCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "requirements_to_uml",
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;

    let rawOutput = "";
    try {
      rawOutput = await collectTextResult(
        llmTransport,
        providerSettings,
        buildRequirementRulesRepairMessages(input),
        () => undefined,
        getRepairRequirementRulesResponseFormat(providerSettings),
      );
      const result = applyBatchRequirementRepairSuggestions(input, rawOutput);
      const remainingFailures = [];
      for (const failure of result.failures) {
        if (!failure.errorMessage.includes("未返回当前规则")) {
          remainingFailures.push(failure);
          continue;
        }
        const rule = input.rules.find((item) => item.id === failure.ruleId);
        if (!rule) {
          remainingFailures.push(failure);
          continue;
        }
        try {
          // Retry only omitted batch items so one truncated provider response
          // does not discard valid candidates or rerun already repaired rules.
          const singleInput = repairRequirementRuleRequestSchema.parse({
            projectId: input.projectId,
            requirementText: input.requirementText,
            rule,
            baseline: input.baseline,
            providerSettings: input.providerSettings,
          });
          const singleRawOutput = await collectTextResult(
            llmTransport,
            providerSettings,
            buildRequirementRuleRepairMessages(singleInput),
            () => undefined,
            getRepairRequirementRuleResponseFormat(providerSettings),
          );
          const singleResult = applyRequirementRepairSuggestion(
            singleInput,
            singleRawOutput,
          );
          const beforeRequirement = input.baseline.requirements.find(
            (requirement) => requirement.sourceRuleId === failure.ruleId,
          );
          if (
            !beforeRequirement ||
            JSON.stringify(beforeRequirement) ===
              JSON.stringify(singleResult.requirement)
          ) {
            throw new Error("模型未返回当前规则的有效修复字段");
          }
          result.candidates.push({
            ruleId: failure.ruleId,
            ...singleResult,
          });
        } catch (error) {
          const repairFailure = requirementRepairFailure(error);
          request.log.warn(
            { errorCode: repairFailure.code, ruleId: failure.ruleId },
            "Single-rule repair fallback failed",
          );
          remainingFailures.push({
            ruleId: failure.ruleId,
            errorMessage: repairFailure.safeMessage,
          });
        }
      }
      result.failures = remainingFailures;
      await recordProviderUsage({
        usageTracker: providerUsageTracker,
        providerConfigId,
        metadata,
        request,
        taskType: "requirements_to_uml",
      });
      return result;
    } catch (error) {
      const failure = requirementRepairFailure(error);
      request.log.warn(
        { errorCode: failure.code },
        "Requirement rule batch repair failed",
      );
      reply.code(failure.statusCode);
      return failure.response;
    }
  });

  app.post(RUN_ROUTE_CONFIG.requirements.startPath, async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "start_runs",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    const resolvedInput = await resolveRequirementRunInput(
      request.body,
      metadata,
      loadProjectWorkspace,
    );
    if (!resolvedInput.ok) {
      reply.code(resolvedInput.statusCode);
      return resolvedInput.body;
    }
    const input = resolvedInput.input;
    if (await isOfflineDemoRun(input.projectId ?? metadata?.projectId)) {
      const runId = randomUUID();
      const record: RunRecord = {
        snapshot: createEmptySnapshot(
          runId,
          input.requirementText,
          input.selectedDiagrams,
          input.rules,
          {
            models: input.contextModels,
            requirementModelTraceability: input.contextRequirementModelTraceability,
            analysisTargetUseCaseIds: input.analysisTargetUseCaseIds,
            requestedDiagrams: input.requestedDiagrams,
            dependencyDiagrams: input.dependencyDiagrams,
          },
        ),
        events: [],
        listeners: new Set(),
        terminal: false,
        metadata,
      };
      runs.set(runId, record);
      attachRunSideEffects(record);
      emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));
      void completeOfflineDemoRequirementRun(record, input).catch((error) =>
        handleOfflineDemoError(record, error),
      );
      reply.code(202);
      return startRunResponseSchema.parse({ runId });
    }
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      request,
      reply,
    });
    if (!providerSettings) {
      return unresolvedProviderSettingsResponse(reply);
    }
    const providerConfigId = await resolveProviderConfigIdForRun({
      providerSettings: input.providerSettings,
    });
    const generationLimitCheck = await checkGenerationUsageLimit({
      generationUsage,
      runAccessGuard,
      request,
      reply,
    });
    if (generationLimitCheck !== true) return generationLimitCheck;
    const limitCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "requirements_to_uml",
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;
    const runId = randomUUID();
    const runBillingEntitlements = await billingEntitlementsForProvider({
      providerConfigId,
      metadata,
    });
    const billingCheck = await reserveBillingRunUsage({
      billingEntitlements: runBillingEntitlements,
      metadata,
      runId,
      taskType: "requirements_to_uml",
      reply,
    });
    if (billingCheck !== true) return billingCheck;
    await recordProviderUsage({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "requirements_to_uml",
    });
    await recordGenerationUsage({
      generationUsage,
      runAccessGuard,
      request,
      taskType: "requirements_to_uml",
      providerConfigId,
    });
    const record: RunRecord = {
      snapshot: createEmptySnapshot(
        runId,
        input.requirementText,
        input.selectedDiagrams,
        input.rules,
        {
          models: input.contextModels,
          requirementModelTraceability: input.contextRequirementModelTraceability,
          analysisTargetUseCaseIds: input.analysisTargetUseCaseIds,
          requestedDiagrams: input.requestedDiagrams,
          dependencyDiagrams: input.dependencyDiagrams,
        },
      ),
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata,
    };
    rememberProviderSettings(record, input.providerSettings, {
      providerConfigId,
      model: providerSettings.model,
    });
    runs.set(runId, record);
    attachRunSideEffects(record);

    // Routes create queued records; pipelines advance them to running/completed/failed.
    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    await startRecordPipeline({
      record,
      providerSettings,
      providerConfigId,
      billingEntitlements: runBillingEntitlements,
    });

    reply.code(202);
    return startRunResponseSchema.parse({ runId });
  });

  app.post(RUN_ROUTE_CONFIG.design.startPath, async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "start_runs",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    const resolvedInput = await resolveDesignRunInput(
      request.body,
      metadata,
      loadProjectWorkspace,
    );
    if (!resolvedInput.ok) {
      reply.code(resolvedInput.statusCode);
      return resolvedInput.body;
    }
    const input = resolvedInput.input;
    if (await isOfflineDemoRun(input.projectId ?? metadata?.projectId)) {
      const runId = randomUUID();
      const record: RunRecord = {
        snapshot: createEmptyDesignSnapshot(runId, input),
        events: [],
        listeners: new Set(),
        terminal: false,
        metadata,
      };
      runs.set(runId, record);
      attachRunSideEffects(record);
      emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));
      void completeOfflineDemoDesignRun(record, input).catch((error) =>
        handleOfflineDemoError(record, error),
      );
      reply.code(202);
      return startDesignRunResponseSchema.parse({ runId });
    }
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      request,
      reply,
    });
    if (!providerSettings) {
      return unresolvedProviderSettingsResponse(reply);
    }
    const providerConfigId = await resolveProviderConfigIdForRun({
      providerSettings: input.providerSettings,
    });
    const generationLimitCheck = await checkGenerationUsageLimit({
      generationUsage,
      runAccessGuard,
      request,
      reply,
    });
    if (generationLimitCheck !== true) return generationLimitCheck;
    const limitCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "design_modeling",
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;
    const runId = randomUUID();
    const runBillingEntitlements = await billingEntitlementsForProvider({
      providerConfigId,
      metadata,
    });
    const billingCheck = await reserveBillingRunUsage({
      billingEntitlements: runBillingEntitlements,
      metadata,
      runId,
      taskType: "design_modeling",
      reply,
    });
    if (billingCheck !== true) return billingCheck;
    await recordProviderUsage({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "design_modeling",
    });
    await recordGenerationUsage({
      generationUsage,
      runAccessGuard,
      request,
      taskType: "design_modeling",
      providerConfigId,
    });
    const record: RunRecord = {
      snapshot: createEmptyDesignSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata,
    };
    rememberProviderSettings(record, input.providerSettings, {
      providerConfigId,
      model: providerSettings.model,
    });
    runs.set(runId, record);
    attachRunSideEffects(record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    await startRecordPipeline({
      record,
      providerSettings,
      providerConfigId,
      billingEntitlements: runBillingEntitlements,
    });

    reply.code(202);
    return startDesignRunResponseSchema.parse({ runId });
  });

  app.post(RUN_ROUTE_CONFIG.code.startPath, async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "start_runs",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    const resolvedInput = await resolveCodeRunInput(
      request.body,
      metadata,
      loadProjectWorkspace,
    );
    if (!resolvedInput.ok) {
      reply.code(resolvedInput.statusCode);
      return resolvedInput.body;
    }
    const input = resolvedInput.input;
    if (await isOfflineDemoRun(input.projectId ?? metadata?.projectId)) {
      const runId = randomUUID();
      const record: RunRecord = {
        snapshot: createEmptyCodeSnapshot(runId, input),
        events: [],
        listeners: new Set(),
        terminal: false,
        metadata,
      };
      runs.set(runId, record);
      attachRunSideEffects(record);
      emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));
      void completeOfflineDemoCodeRun(record, input).catch((error) =>
        handleOfflineDemoError(record, error),
      );
      reply.code(202);
      return startCodeRunResponseSchema.parse({ runId });
    }
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      request,
      reply,
    });
    if (!providerSettings) {
      return unresolvedProviderSettingsResponse(reply);
    }
    const providerConfigId = await resolveProviderConfigIdForRun({
      providerSettings: input.providerSettings,
    });
    const generationLimitCheck = await checkGenerationUsageLimit({
      generationUsage,
      runAccessGuard,
      request,
      reply,
    });
    if (generationLimitCheck !== true) return generationLimitCheck;
    const limitCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "code_generation",
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;
    const runId = randomUUID();
    const runBillingEntitlements = await billingEntitlementsForProvider({
      providerConfigId,
      metadata,
    });
    const billingCheck = await reserveBillingRunUsage({
      billingEntitlements: runBillingEntitlements,
      metadata,
      runId,
      taskType: "code_generation",
      reply,
    });
    if (billingCheck !== true) return billingCheck;
    await recordProviderUsage({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "code_generation",
    });
    await recordGenerationUsage({
      generationUsage,
      runAccessGuard,
      request,
      taskType: "code_generation",
      providerConfigId,
    });
    const record: RunRecord = {
      snapshot: createEmptyCodeSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata,
    };
    rememberProviderSettings(record, input.providerSettings, {
      providerConfigId,
      model: providerSettings.model,
    });
    runs.set(runId, record);
    attachRunSideEffects(record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    await startRecordPipeline({
      record,
      providerSettings,
      providerConfigId,
      billingEntitlements: runBillingEntitlements,
    });

    reply.code(202);
    return startCodeRunResponseSchema.parse({ runId });
  });

  app.post(RUN_ROUTE_CONFIG.document.startPath, async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "manage_documents",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    if (!metadata?.projectId) {
      reply.code(401);
      return { error: { message: "请先登录并进入项目" } };
    }
    const resolvedInput = await resolveDocumentRunInput(
      request.body,
      metadata,
      loadProjectWorkspace,
    );
    if (!resolvedInput.ok) {
      reply.code(resolvedInput.statusCode);
      return resolvedInput.body;
    }
    const input = resolvedInput.input;
    if (
      input.documentKind !== "feasibilityStudy" &&
      resolveProjectName &&
      metadata.projectId
    ) {
      const projectName = (await resolveProjectName(metadata.projectId))?.trim();
      if (projectName) {
        // The project record is authoritative for exported document identity.
        input.feasibilityInputs = {
          ...input.feasibilityInputs,
          projectName,
        };
      }
    }
    const blockedBaseline = rejectBlockedRequirementBaseline(
      reply,
      input.requirementBaseline,
    );
    if (blockedBaseline) return blockedBaseline;
    if (await isOfflineDemoRun(input.projectId ?? metadata.projectId)) {
      const demoInput = createOfflineDemoDocumentInput(input);
      const runId = randomUUID();
      const record: RunRecord = {
        snapshot: createEmptyDocumentSnapshot(runId, demoInput),
        events: [],
        listeners: new Set(),
        terminal: false,
        metadata,
      };
      runs.set(runId, record);
      attachRunSideEffects(record);
      emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));
      // Demo documents use the normal DOCX assembly boundary with AI text disabled.
      void runDocumentStagePipeline(
        record,
        demoInput,
        documentLibrary,
        projectDocumentWorkspaceId(metadata.projectId),
        offlineDemoProviderSettings,
        offlineDemoLlmTransport,
        pngRenderClient,
        (stage) => emitOfflineDemoActivity(record, stage),
      ).catch((error) => {
        handleRunPipelineError(record, error, addCodeDiagnostic);
      });
      reply.code(202);
      return startDocumentRunResponseSchema.parse({ runId });
    }
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      request,
      reply,
    });
    if (!providerSettings) {
      return unresolvedProviderSettingsResponse(reply);
    }
    const providerConfigId = await resolveProviderConfigIdForRun({
      providerSettings: input.providerSettings,
    });
    const generationLimitCheck = await checkGenerationUsageLimit({
      generationUsage,
      runAccessGuard,
      request,
      reply,
    });
    if (generationLimitCheck !== true) return generationLimitCheck;
    const limitCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "document_generation",
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;
    await recordProviderUsage({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "document_generation",
    });
    if (input.documentKind === "requirementsSpec" && input.requirementModels.length === 0) {
      reply.code(400);
      return apiErrorResponseSchema.parse({
        error: { code: "REQUIREMENT_MODELS_MISSING", category: "conflict", retryable: false },
      });
    }
    if (input.documentKind === "softwareDesignSpec" && input.designModels.length === 0) {
      reply.code(400);
      return apiErrorResponseSchema.parse({
        error: { code: "DESIGN_MODELS_MISSING", category: "conflict", retryable: false },
      });
    }
    const runId = randomUUID();
    const runBillingEntitlements = await billingEntitlementsForProvider({
      providerConfigId,
      metadata,
    });
    const billingCheck = await reserveBillingRunUsage({
      billingEntitlements: runBillingEntitlements,
      metadata,
      runId,
      taskType: "document_generation",
      reply,
    });
    if (billingCheck !== true) return billingCheck;
    await recordGenerationUsage({
      generationUsage,
      runAccessGuard,
      request,
      taskType: "document_generation",
      providerConfigId,
    });

    const record: RunRecord = {
      snapshot: createEmptyDocumentSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata,
    };
    rememberProviderSettings(record, input.providerSettings, {
      providerConfigId,
      model: providerSettings.model,
    });
    runs.set(runId, record);
    attachRunSideEffects(record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    await startRecordPipeline({
      record,
      providerSettings,
      providerConfigId,
      billingEntitlements: runBillingEntitlements,
      documentInput: input,
    });

    reply.code(202);
    return startDocumentRunResponseSchema.parse({ runId });
  });

  app.get("/api/projects/:projectId/runs", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await canReadProjectRuns(request, reply, projectId, runAccessGuard))) {
      return runAccessDeniedMessage(reply);
    }

    await refreshProjectRunRecordsIfAvailable(runs, projectId);
    const projectRunRecords = Array.from(runs.values())
      .filter((record) => record.metadata?.projectId === projectId)
      .filter((record) => projectRecordMatchesFilters(record, request.query))
      .sort((left, right) =>
        (right.metadata?.createdAt ?? "").localeCompare(
          left.metadata?.createdAt ?? "",
        ),
      );
    const projectRuns = await Promise.all(
      projectRunRecords.map((record) =>
        summarizeRunRecordWithCurrentDocument(record, documentLibrary),
      ),
    );

    return {
      generatedAt: new Date().toISOString(),
      projectId,
      runs: projectRuns,
    };
  });

  app.get("/api/projects/:projectId/runs/:runId", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    if (!(await canReadProjectRuns(request, reply, projectId, runAccessGuard))) {
      return runAccessDeniedMessage(reply);
    }

    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record || record.metadata?.projectId !== projectId) {
      reply.code(404);
      return apiErrorResponseSchema.parse({
        error: { code: "RUN_NOT_FOUND", category: "not_found", retryable: false },
      });
    }

    const includeEvents = queryValue(request.query, "includeEvents") === "true";
    return {
      projectId,
      run: await summarizeRunRecordWithCurrentDocument(record, documentLibrary),
      snapshot: record.snapshot,
      ...(includeEvents ? { events: record.events.map((event, index) => ({
        ...event,
        eventId: event.eventId ?? `${runId}:legacy:${index}`,
        createdAt: event.createdAt ?? record.eventCreatedAt?.[index],
      })) } : {}),
    };
  });

  app.delete("/api/projects/:projectId/runs", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const access = await resolveProjectRunPermission(
      request,
      reply,
      projectId,
      "start_runs",
      runAccessGuard,
    );
    if (!access) return runAccessDeniedMessage(reply);

    await refreshProjectRunRecordsIfAvailable(runs, projectId);
    const projectRecords = Array.from(runs.entries()).filter(
      ([, record]) => record.metadata?.projectId === projectId,
    );
    const activeRunIds = projectRecords
      .filter(([, record]) => isActiveRunRecord(record))
      .map(([runId]) => runId);
    if (activeRunIds.length > 0) {
      reply.code(409);
      return apiErrorResponseSchema.parse({
        error: {
          code: "RUN_ACTIVE_DELETE_CONFLICT",
          category: "conflict",
          retryable: false,
          params: { count: activeRunIds.length },
          details: { activeRunIds },
        },
      });
    }

    const deletedRunIds = projectRecords.map(([runId]) => runId);
    for (const runId of deletedRunIds) {
      runs.delete(runId);
    }

    return {
      projectId,
      deletedRunIds,
    };
  });

  app.delete("/api/projects/:projectId/runs/:runId", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    const access = await resolveProjectRunPermission(
      request,
      reply,
      projectId,
      "start_runs",
      runAccessGuard,
    );
    if (!access) return runAccessDeniedMessage(reply);

    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record || record.metadata?.projectId !== projectId) {
      reply.code(404);
      return apiErrorResponseSchema.parse({
        error: { code: "RUN_NOT_FOUND", category: "not_found", retryable: false },
      });
    }
    if (isActiveRunRecord(record)) {
      reply.code(409);
      return apiErrorResponseSchema.parse({
        error: {
          code: "RUN_ACTIVE_DELETE_CONFLICT",
          category: "conflict",
          retryable: false,
          params: { count: 1 },
        },
      });
    }

    runs.delete(runId);
    reply.code(204);
    return reply.send();
  });

  app.post("/api/projects/:projectId/runs/:runId/cancel", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    const access = await resolveProjectRunPermission(
      request,
      reply,
      projectId,
      "start_runs",
      runAccessGuard,
    );
    if (!access) return runAccessDeniedMessage(reply);

    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record || record.metadata?.projectId !== projectId) {
      reply.code(404);
      return apiErrorResponseSchema.parse({
        error: { code: "RUN_NOT_FOUND", category: "not_found", retryable: false },
      });
    }
    if (record.terminal) {
      reply.code(409);
      return apiErrorResponseSchema.parse({
        error: {
          code: "RUN_ALREADY_TERMINAL",
          category: "conflict",
          retryable: false,
        },
      });
    }

    llmScheduler?.cancelRun(runId);
    await runQueue?.cancelRun(runId);
    await billingEntitlements?.releaseRunUsage(runId);
    return cancelRunRecord(record, runId);
  });

  app.post("/api/projects/:projectId/runs/:runId/retry", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    const access = await resolveProjectRunPermission(
      request,
      reply,
      projectId,
      "start_runs",
      runAccessGuard,
    );
    if (!access) return runAccessDeniedMessage(reply);
    await refreshRunRecordIfAvailable(runs, runId);
    return createProjectRunAction({
      request,
      reply,
      action: "retry",
      projectId,
      runId,
      actorUserId: access.userId,
      runs,
      runAccessGuard,
      providerConfigs,
      providerUsageTracker,
      generationUsage,
      billingEntitlements,
      providerRateLimitPolicy,
      startRecordPipeline,
    });
  });

  app.post("/api/projects/:projectId/runs/:runId/rerun", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    const access = await resolveProjectRunPermission(
      request,
      reply,
      projectId,
      "start_runs",
      runAccessGuard,
    );
    if (!access) return runAccessDeniedMessage(reply);
    await refreshRunRecordIfAvailable(runs, runId);
    return createProjectRunAction({
      request,
      reply,
      action: "rerun",
      projectId,
      runId,
      actorUserId: access.userId,
      runs,
      runAccessGuard,
      providerConfigs,
      providerUsageTracker,
      generationUsage,
      billingEntitlements,
      providerRateLimitPolicy,
      startRecordPipeline,
    });
  });

  app.get(RUN_ROUTE_CONFIG.requirements.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record) {
      reply.code(404);
      return apiErrorResponseSchema.parse({
        error: { code: "RUN_NOT_FOUND", category: "not_found", retryable: false },
      });
    }
    if (!(await canReadRunRecord(request, reply, record, runAccessGuard, "view_runs"))) {
      return reply;
    }
    return runSnapshotSchema.parse(record.snapshot);
  });

  app.get(RUN_ROUTE_CONFIG.design.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record) {
      reply.code(404);
      return apiErrorResponseSchema.parse({
        error: { code: "RUN_NOT_FOUND", category: "not_found", retryable: false },
      });
    }
    if (!(await canReadRunRecord(request, reply, record, runAccessGuard, "view_runs"))) {
      return reply;
    }
    return designRunSnapshotSchema.parse(record.snapshot);
  });

  app.get(RUN_ROUTE_CONFIG.code.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record) {
      reply.code(404);
      return apiErrorResponseSchema.parse({
        error: { code: "RUN_NOT_FOUND", category: "not_found", retryable: false },
      });
    }
    if (!(await canReadRunRecord(request, reply, record, runAccessGuard, "view_runs"))) {
      return reply;
    }
    return codeRunSnapshotSchema.parse(record.snapshot);
  });

  app.get(RUN_ROUTE_CONFIG.document.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record) {
      reply.code(404);
      return apiErrorResponseSchema.parse({
        error: { code: "RUN_NOT_FOUND", category: "not_found", retryable: false },
      });
    }
    if (!(await canReadRunRecord(request, reply, record, runAccessGuard, "view_runs"))) {
      return reply;
    }
    return documentRunSnapshotSchema.parse(record.snapshot);
  });

  app.get(RUN_ROUTE_CONFIG.document.downloadPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record) {
      reply.code(404);
      return apiErrorResponseSchema.parse({
        error: { code: "DOCUMENT_FILE_NOT_FOUND", category: "not_found", retryable: false },
      });
    }
    if (!(await canReadRunRecord(request, reply, record, runAccessGuard, "view_documents"))) {
      return reply;
    }
    const snapshot = documentRunSnapshotSchema.parse(record.snapshot);
    if (snapshot.status !== "completed") {
      reply.code(409);
      return apiErrorResponseSchema.parse({
        error: { code: "DOCUMENT_RUN_NOT_COMPLETED", category: "conflict", retryable: false },
      });
    }
    const currentDocument = await currentDocumentForRun(record, documentLibrary);
    if (currentDocument?.status === "deleted") {
      reply.code(409);
      return apiErrorResponseSchema.parse({
        error: { code: "DOCUMENT_RESTORE_REQUIRED", category: "conflict", retryable: false },
      });
    }
    let documentBuffer = record.documentBuffer;
    if (!documentBuffer && record.metadata?.projectId && snapshot.documentId) {
      documentBuffer = await documentLibrary.getDocumentBuffer(
        projectDocumentWorkspaceId(record.metadata.projectId),
        snapshot.documentId,
      ) ?? undefined;
    }
    if (!documentBuffer) {
      reply.code(404);
      return apiErrorResponseSchema.parse({
        error: { code: "DOCUMENT_FILE_NOT_FOUND", category: "not_found", retryable: false },
      });
    }
    reply.header(
      "Content-Type",
      snapshot.mimeType ??
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(currentDocument?.fileName ?? snapshot.fileName ?? "说明书.docx")}`,
    );
    return documentBuffer;
  });

  for (const route of [
    RUN_ROUTE_CONFIG.requirements,
    RUN_ROUTE_CONFIG.design,
    RUN_ROUTE_CONFIG.code,
    RUN_ROUTE_CONFIG.document,
  ]) {
    registerRunEventsRoute({
      app,
      runs,
      path: route.eventsPath,
      notFoundMessage: route.notFoundMessage,
      defaultAllowOrigin: defaultSseAllowOrigin,
      subscribeRunEvents: runQueue?.subscribeRunEvents?.bind(runQueue),
      canReadRunRecord: (request, reply, record) =>
        canReadRunRecord(request, reply, record, runAccessGuard, "view_runs"),
    });
  }
}
