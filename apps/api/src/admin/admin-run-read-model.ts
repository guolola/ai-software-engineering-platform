// Builds admin run list/detail views while enforcing project data-scope visibility.
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { AcademicAdminRepository } from "../db/academic-admin-repository.js";
import {
  buildAdminRunDto,
} from "./admin-route-presenters.js";
import type {
  RunRecord,
  RunRecordStore,
} from "../runs/records/run-record-store.js";
import type { RunStage, RunStatus } from "@uml-platform/contracts";
import type { ProviderConfigStore } from "../provider-configs/provider-config-store.js";
import { snapshotErrorMessage } from "../runs/records/admin-run-summaries.js";
import type { AdminActor } from "../security/admin-guard.js";
import {
  canSeeProjectByScope,
  hasFullProjectScope,
  visibleProjectsForAdmin,
} from "./academic-scope.js";

type AdminRunReadInput = {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  actor: AdminActor;
  runs: RunRecordStore;
  providerConfigs?: ProviderConfigStore;
};

function compareRunsNewestFirst(left: RunRecord, right: RunRecord) {
  const leftTime = new Date(left.metadata?.createdAt ?? 0).getTime();
  const rightTime = new Date(right.metadata?.createdAt ?? 0).getTime();
  return (Number.isFinite(rightTime) ? rightTime : 0) -
    (Number.isFinite(leftTime) ? leftTime : 0);
}

async function listVisibleAdminRunRecords({
  academicStore,
  authStore,
  actor,
  runs,
}: AdminRunReadInput) {
  const visibleProjectIds = hasFullProjectScope(actor)
    ? null
    : new Set(
        (await visibleProjectsForAdmin(academicStore, authStore, actor)).map(
          (project) => project.id,
        ),
      );

  return Array.from(runs.values())
    .filter(
      (record) =>
        visibleProjectIds === null ||
        (record.metadata?.projectId &&
          visibleProjectIds.has(String(record.metadata.projectId))),
    )
    .sort(compareRunsNewestFirst);
}

export async function listAdminRunDtos(input: AdminRunReadInput) {
  const visibleRuns = await listVisibleAdminRunRecords(input);
  return Promise.all(
    visibleRuns.map((record) =>
      buildAdminRunDto(record, input.authStore, {
        providerConfigs: input.providerConfigs,
      }),
    ),
  );
}

export async function buildAdminRunListView(input: AdminRunReadInput) {
  const visibleRuns = await listVisibleAdminRunRecords(input);
  return {
    generatedAt: new Date().toISOString(),
    runs: await Promise.all(
      visibleRuns.map((record) =>
        buildAdminRunDto(record, input.authStore, {
          providerConfigs: input.providerConfigs,
        }),
      ),
    ),
    structuredOutputMetrics: buildStructuredOutputMetrics(visibleRuns),
  };
}

function buildStructuredOutputMetrics(records: RunRecord[]) {
  const groups = new Map<string, {
    model: string;
    requestedMode: string;
    effectiveMode: string;
    total: number;
    initialStructureFailures: number;
    targetedRepairSuccesses: number;
    strictJsonDowngrades: number;
    finalStructuredOutputInvalid: number;
    aliasNormalizations: number;
    repairByStage: Record<string, number>;
  }>();
  for (const record of records) {
    const snapshot = record.snapshot as unknown as {
      generationDiagnostics?: {
        requestedMode?: string;
        effectiveMode?: string;
        downgradeReasons?: string[];
        normalizationActions?: string[];
        repairs?: Array<{ stage?: string; succeeded?: boolean }>;
      } | null;
      error?: { code?: string } | null;
    };
    const diagnostics = snapshot.generationDiagnostics;
    if (!diagnostics?.requestedMode || !diagnostics.effectiveMode) continue;
    const model = String(record.metadata?.model ?? "unknown");
    const key = `${model}:${diagnostics.requestedMode}:${diagnostics.effectiveMode}`;
    const current = groups.get(key) ?? {
      model,
      requestedMode: diagnostics.requestedMode,
      effectiveMode: diagnostics.effectiveMode,
      total: 0,
      initialStructureFailures: 0,
      targetedRepairSuccesses: 0,
      strictJsonDowngrades: 0,
      finalStructuredOutputInvalid: 0,
      aliasNormalizations: 0,
      repairByStage: {},
    };
    const repairs = diagnostics.repairs ?? [];
    current.total += 1;
    if (repairs.length > 0) current.initialStructureFailures += 1;
    if (repairs.some((repair) => repair.succeeded)) {
      current.targetedRepairSuccesses += 1;
    }
    for (const repair of repairs) {
      const stage = repair.stage ?? "unknown";
      current.repairByStage[stage] = (current.repairByStage[stage] ?? 0) + 1;
    }
    current.strictJsonDowngrades += diagnostics.downgradeReasons?.length ?? 0;
    if (snapshot.error?.code === "RUN_STRUCTURED_OUTPUT_INVALID") {
      current.finalStructuredOutputInvalid += 1;
    }
    current.aliasNormalizations += (diagnostics.normalizationActions ?? []).filter(
      (action) => action.startsWith("aliased-"),
    ).length;
    groups.set(key, current);
  }
  return [...groups.values()];
}

function runDiagnosticSummary(record: RunRecord) {
  const serializedEvents = record.events.map((event) => JSON.stringify(event));
  const repairEventCount = serializedEvents.filter((event) =>
    /repair|修复|plantuml/i.test(event),
  ).length;
  const artifactCount =
    record.events.filter((event) => /artifact|document|code_file/i.test(event.type)).length ||
    Object.entries(record.snapshot).filter(([, value]) => Array.isArray(value)).length;

  return {
    currentStage: record.snapshot.currentStage ?? null,
    terminal: record.terminal,
    eventCount: record.events.length,
    repairEventCount,
    artifactCount,
    errorMessage: snapshotErrorMessage(record.snapshot),
    snapshotKeys: Object.keys(record.snapshot),
    structuredOutput:
      "generationDiagnostics" in record.snapshot
        ? record.snapshot.generationDiagnostics ?? null
        : null,
    validationIssues:
      record.snapshot.error?.details &&
      Array.isArray(record.snapshot.error.details.validationIssues)
        ? record.snapshot.error.details.validationIssues
        : [],
  };
}

const RUN_STAGE_LABELS: Record<RunStage, string> = {
  extract_rules: "提取需求规则",
  generate_models: "生成需求模型",
  generate_design_sequence: "规划设计序列",
  generate_design_models: "生成设计模型",
  generate_tests: "生成测试",
  analyze_code_business_logic: "分析业务逻辑",
  analyze_code_product: "分析产品结构",
  plan_code_ui: "规划界面",
  generate_code_ui_mockup: "生成界面原型",
  analyze_code_ui_mockup: "分析界面原型",
  generate_code_ui_ir: "生成界面中间表示",
  load_web_design_skill: "加载设计技能",
  select_code_skills: "选择代码技能",
  plan_code_files: "规划代码文件",
  generate_code_spec: "生成代码规格",
  generate_code_files: "生成代码文件",
  plan_code: "规划代码",
  write_code_files: "写入代码文件",
  audit_code_quality: "审查代码质量",
  verify_code_ui_fidelity: "校验界面还原度",
  verify_code_rendered_preview: "校验渲染预览",
  verify_code_business_assertions: "校验业务断言",
  verify_code_preview: "校验代码预览",
  repair_code_files: "修复代码文件",
  generate_document_text: "生成文档内容",
  render_document_file: "渲染文档文件",
  generate_plantuml: "生成 PlantUML",
  render_svg: "渲染模型图",
  generate_context: "生成可行性上下文",
  render_context: "整理可行性证据",
  generate_implementation: "生成实施方案",
};

function eventStage(event: RunRecord["events"][number]) {
  return "stage" in event ? event.stage : null;
}

function failedEventMessage(event: RunRecord["events"][number]) {
  const compatible = event as unknown as { message?: unknown; error?: { message?: unknown } };
  if (typeof compatible.error?.message === "string") return compatible.error.message;
  return typeof compatible.message === "string" ? compatible.message : "任务阶段失败";
}

function buildAdminRunStages(record: RunRecord) {
  const timeline: Array<{
    code: RunStage;
    name: string;
    status: RunStatus;
    progress: number | null;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    note: string;
  }> = [];
  const byStage = new Map<RunStage, (typeof timeline)[number]>();
  record.events.forEach((event, index) => {
    const stage = eventStage(event);
    if (!stage) return;
    let item = byStage.get(stage);
    const createdAt = record.eventCreatedAt?.[index] ?? null;
    if (!item) {
      item = {
        code: stage,
        name: RUN_STAGE_LABELS[stage],
        status: "running",
        progress: null,
        startedAt: createdAt,
        completedAt: null,
        durationMs: null,
        note: "阶段已开始",
      };
      const previous = timeline.at(-1);
      if (previous && previous.status === "running") {
        previous.status = "completed";
        previous.completedAt = createdAt;
      }
      timeline.push(item);
      byStage.set(stage, item);
    }
    if (event.type === "stage_progress") {
      item.progress = event.progress;
      if (event.message) item.note = event.message;
      if (event.subtaskStatus === "failed") item.status = "failed";
    } else if (event.type === "artifact_ready") {
      item.note = "阶段产物已生成";
    } else if (event.type === "failed") {
      item.status = "failed";
      item.note = failedEventMessage(event);
      item.completedAt = createdAt;
    } else if (event.type === "cancelled") {
      item.status = "cancelled";
      item.note = event.message;
      item.completedAt = createdAt;
    }
  });
  const last = timeline.at(-1);
  if (last) {
    if (record.snapshot.status === "completed") last.status = "completed";
    if (record.snapshot.status === "failed") last.status = "failed";
    if (record.snapshot.status === "cancelled") last.status = "cancelled";
    if (last.status !== "running") last.completedAt ??= record.metadata?.completedAt ?? null;
  } else if (record.snapshot.currentStage) {
    timeline.push({
      code: record.snapshot.currentStage,
      name: RUN_STAGE_LABELS[record.snapshot.currentStage],
      status: record.snapshot.status,
      progress: null,
      startedAt: null,
      completedAt: record.metadata?.completedAt ?? null,
      durationMs: null,
      note: "历史任务未保留阶段事件时间",
    });
  }
  for (const item of timeline) {
    const start = item.startedAt ? Date.parse(item.startedAt) : Number.NaN;
    const end = item.completedAt ? Date.parse(item.completedAt) : Number.NaN;
    item.durationMs = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null;
  }
  return timeline;
}

function buildAdminDiagnosticEvents(record: RunRecord) {
  return record.events
    .map((event, index) => ({ event, createdAt: record.eventCreatedAt?.[index] ?? null }))
    .filter(({ event }) => event.type !== "llm_chunk" && event.type !== "code_file_changed")
    .map(({ event, createdAt }) => ({
      type: event.type,
      stage: eventStage(event),
      message:
        event.type === "stage_progress" || event.type === "cancelled"
          ? event.message ?? null
          : event.type === "failed"
            ? failedEventMessage(event)
            : null,
      action: event.type === "run_action" ? event.action : null,
      createdAt,
    }));
}

async function getReadableAdminRunRecord({
  academicStore,
  authStore,
  actor,
  runs,
  runId,
}: AdminRunReadInput & { runId: string }) {
  const record = runs.get(runId);
  if (!record) {
    return { ok: false, statusCode: 404, body: { message: "Run not found" } } as const;
  }

  const projectId =
    typeof record.metadata?.projectId === "string" ? record.metadata.projectId : null;
  const project = projectId ? await authStore.getProject(projectId) : null;
  if (
    project &&
    !(await canSeeProjectByScope(academicStore, authStore, actor, project))
  ) {
    return { ok: false, statusCode: 404, body: { message: "Run not found" } } as const;
  }
  if (!project && !hasFullProjectScope(actor)) {
    return { ok: false, statusCode: 404, body: { message: "Run not found" } } as const;
  }

  return { ok: true, record } as const;
}

export async function getAdminRunDetail(input: AdminRunReadInput & { runId: string }) {
  const access = await getReadableAdminRunRecord(input);
  if (!access.ok) {
    return { statusCode: access.statusCode, body: access.body };
  }

  const run = access.record;
  return {
    statusCode: 200,
    body: {
      generatedAt: new Date().toISOString(),
      run: {
        ...(await buildAdminRunDto(run, input.authStore, {
          includeArtifactPreviews: true,
          providerConfigs: input.providerConfigs,
        })),
        id: run.snapshot.runId,
        status: run.snapshot.status,
        currentStage: run.snapshot.currentStage,
        errorMessage: snapshotErrorMessage(run.snapshot),
        metadata: run.metadata ?? null,
        terminal: run.terminal,
        diagnostics: runDiagnosticSummary(run),
        stages: buildAdminRunStages(run),
        events: buildAdminDiagnosticEvents(run),
      },
    },
  };
}
