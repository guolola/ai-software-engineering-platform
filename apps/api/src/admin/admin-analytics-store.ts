// Persists privacy-safe LLM telemetry and versioned evaluation attempts for admin analytics.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Queryable } from "../db/transactions.js";

const nullableCountSchema = z.number().int().min(0).nullable();

export const evaluationAttemptImportSchema = z.object({
  id: z.string().trim().min(1),
  fixtureId: z.string().trim().min(1),
  taskType: z.string().trim().min(1),
  provider: z.string().trim().min(1).nullable().default(null),
  model: z.string().trim().min(1),
  strategyId: z.string().trim().min(1).default("single-model"),
  strategyVersion: z.string().trim().min(1).default("1"),
  attempt: z.number().int().min(1),
  k: z.number().int().min(1).max(100),
  budgetDimension: z.enum(["wall_clock_ms", "tokens", "model_calls"]).nullable().default(null),
  budgetValue: z.number().int().min(0).nullable().default(null),
  qualityScore: z.number().min(0).max(100),
  automaticVerdict: z.enum(["pass", "fail"]),
  durationMs: z.number().int().min(0),
  inputTokens: nullableCountSchema.default(null),
  outputTokens: nullableCountSchema.default(null),
  cachedInputTokens: nullableCountSchema.default(null),
  reasoningTokens: nullableCountSchema.default(null),
  totalTokens: nullableCountSchema.default(null),
  modelCallCount: nullableCountSchema.default(null),
  createdAt: z.string().datetime({ offset: true }),
}).strict();

export const evaluationReportImportSchema = z.object({
  importId: z.string().trim().min(1),
  suiteVersion: z.string().trim().min(1),
  evaluatorVersion: z.string().trim().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  attempts: z.array(evaluationAttemptImportSchema).min(1),
}).strict();

export const evaluationReviewRequestSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export type EvaluationReportImport = z.infer<typeof evaluationReportImportSchema>;
export type EvaluationReviewRequest = z.infer<typeof evaluationReviewRequestSchema>;

export type LlmTokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
};

export type LlmRequestTelemetry = {
  id: string;
  runId: string;
  projectId: string | null;
  userId: string | null;
  providerConfigId: string | null;
  model: string;
  taskType: string;
  stage: string | null;
  diagramKind: string | null;
  subtaskId: string | null;
  requestedModelCount: number | null;
  queuedAt: string;
  providerStartedAt: string | null;
  firstReasoningAt: string | null;
  firstVisibleAt: string | null;
  lastVisibleAt: string | null;
  completedAt: string;
  queueMs: number | null;
  providerTtftMs: number | null;
  ttftMs: number | null;
  reasoningMs: number | null;
  decodeMs: number | null;
  totalMs: number;
  usage: LlmTokenUsage | null;
  outcome: "success" | "failed" | "cancelled";
  statusCode: number | null;
  errorCategory: string | null;
  retryCount: number;
  formatFallbackCount: number;
  usageUnavailableReason: string | null;
};

export type AnalyticsWindowFilters = {
  from: string;
  to: string;
  taskType?: string;
  providerConfigId?: string;
  model?: string;
  requestedModelCount?: number;
  strategyId?: string;
};

export type EvaluationAttemptRecord = z.infer<typeof evaluationAttemptImportSchema> & {
  importId: string;
  suiteVersion: string;
  evaluatorVersion: string;
  reviewVerdict: "pass" | "fail" | null;
  reviewReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export interface AdminAnalyticsStore {
  recordTelemetry(entry: LlmRequestTelemetry): Promise<void>;
  listTelemetry(filters: AnalyticsWindowFilters): Promise<LlmRequestTelemetry[]>;
  importEvaluationReport(report: EvaluationReportImport): Promise<{ imported: number; duplicate: boolean }>;
  listEvaluationAttempts(filters: AnalyticsWindowFilters): Promise<EvaluationAttemptRecord[]>;
  reviewEvaluationAttempt(input: {
    attemptId: string;
    reviewerId: string;
    review: EvaluationReviewRequest;
  }): Promise<EvaluationAttemptRecord | null>;
}

function matchesFilters(
  entry: Pick<LlmRequestTelemetry, "queuedAt" | "taskType" | "providerConfigId" | "model" | "requestedModelCount">,
  filters: AnalyticsWindowFilters,
) {
  return entry.queuedAt >= filters.from && entry.queuedAt < filters.to &&
    (!filters.taskType || entry.taskType === filters.taskType) &&
    (!filters.providerConfigId || entry.providerConfigId === filters.providerConfigId) &&
    (!filters.model || entry.model === filters.model) &&
    (filters.requestedModelCount === undefined || entry.requestedModelCount === filters.requestedModelCount);
}

export function createInMemoryAdminAnalyticsStore(): AdminAnalyticsStore {
  const telemetry: LlmRequestTelemetry[] = [];
  const attempts = new Map<string, EvaluationAttemptRecord>();
  const imports = new Set<string>();
  return {
    async recordTelemetry(entry) {
      telemetry.push(structuredClone(entry));
    },
    async listTelemetry(filters) {
      return telemetry.filter((entry) => matchesFilters(entry, filters)).map((entry) => structuredClone(entry));
    },
    async importEvaluationReport(report) {
      if (imports.has(report.importId)) return { imported: 0, duplicate: true };
      imports.add(report.importId);
      for (const attempt of report.attempts) {
        attempts.set(attempt.id, {
          ...structuredClone(attempt),
          importId: report.importId,
          suiteVersion: report.suiteVersion,
          evaluatorVersion: report.evaluatorVersion,
          reviewVerdict: null,
          reviewReason: null,
          reviewedBy: null,
          reviewedAt: null,
        });
      }
      return { imported: report.attempts.length, duplicate: false };
    },
    async listEvaluationAttempts(filters) {
      return Array.from(attempts.values())
        .filter((entry) => entry.createdAt >= filters.from && entry.createdAt < filters.to)
        .filter((entry) => !filters.taskType || entry.taskType === filters.taskType)
        .filter((entry) => !filters.model || entry.model === filters.model)
        .filter((entry) => !filters.strategyId || entry.strategyId === filters.strategyId)
        .map((entry) => structuredClone(entry));
    },
    async reviewEvaluationAttempt({ attemptId, reviewerId, review }) {
      const existing = attempts.get(attemptId);
      if (!existing) return null;
      const updated: EvaluationAttemptRecord = {
        ...existing,
        reviewVerdict: review.verdict,
        reviewReason: review.reason,
        reviewedBy: reviewerId,
        reviewedAt: new Date().toISOString(),
      };
      attempts.set(attemptId, updated);
      return structuredClone(updated);
    },
  };
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function timestamp(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapTelemetryRow(row: Record<string, unknown>): LlmRequestTelemetry {
  return {
    id: String(row.id), runId: String(row.run_id),
    projectId: row.project_id === null ? null : String(row.project_id),
    userId: row.user_id === null ? null : String(row.user_id),
    providerConfigId: row.provider_config_id === null ? null : String(row.provider_config_id),
    model: String(row.model), taskType: String(row.task_type),
    stage: row.stage === null ? null : String(row.stage),
    diagramKind: row.diagram_kind === null ? null : String(row.diagram_kind),
    subtaskId: row.subtask_id === null ? null : String(row.subtask_id),
    requestedModelCount: nullableNumber(row.requested_model_count),
    queuedAt: timestamp(row.queued_at),
    providerStartedAt: row.provider_started_at === null ? null : timestamp(row.provider_started_at),
    firstReasoningAt: row.first_reasoning_at === null ? null : timestamp(row.first_reasoning_at),
    firstVisibleAt: row.first_visible_at === null ? null : timestamp(row.first_visible_at),
    lastVisibleAt: row.last_visible_at === null ? null : timestamp(row.last_visible_at),
    completedAt: timestamp(row.completed_at),
    queueMs: nullableNumber(row.queue_ms), providerTtftMs: nullableNumber(row.provider_ttft_ms),
    ttftMs: nullableNumber(row.ttft_ms), reasoningMs: nullableNumber(row.reasoning_ms),
    decodeMs: nullableNumber(row.decode_ms), totalMs: Number(row.total_ms),
    usage: row.input_tokens === null && row.output_tokens === null && row.total_tokens === null ? null : {
      inputTokens: nullableNumber(row.input_tokens), outputTokens: nullableNumber(row.output_tokens),
      cachedInputTokens: nullableNumber(row.cached_input_tokens), reasoningTokens: nullableNumber(row.reasoning_tokens),
      totalTokens: nullableNumber(row.total_tokens),
    },
    outcome: row.outcome as LlmRequestTelemetry["outcome"],
    statusCode: nullableNumber(row.status_code),
    errorCategory: row.error_category === null ? null : String(row.error_category),
    retryCount: Number(row.retry_count ?? 0), formatFallbackCount: Number(row.format_fallback_count ?? 0),
    usageUnavailableReason: row.usage_unavailable_reason === null ? null : String(row.usage_unavailable_reason),
  };
}

function mapEvaluationRow(row: Record<string, unknown>): EvaluationAttemptRecord {
  return {
    id: String(row.id), importId: String(row.import_id), suiteVersion: String(row.suite_version),
    evaluatorVersion: String(row.evaluator_version), fixtureId: String(row.fixture_id),
    taskType: String(row.task_type), provider: row.provider === null ? null : String(row.provider),
    model: String(row.model), strategyId: String(row.strategy_id), strategyVersion: String(row.strategy_version),
    attempt: Number(row.attempt), k: Number(row.k),
    budgetDimension: row.budget_dimension as EvaluationAttemptRecord["budgetDimension"],
    budgetValue: nullableNumber(row.budget_value), qualityScore: Number(row.quality_score),
    automaticVerdict: row.automatic_verdict as "pass" | "fail", durationMs: Number(row.duration_ms),
    inputTokens: nullableNumber(row.input_tokens), outputTokens: nullableNumber(row.output_tokens),
    cachedInputTokens: nullableNumber(row.cached_input_tokens), reasoningTokens: nullableNumber(row.reasoning_tokens),
    totalTokens: nullableNumber(row.total_tokens), modelCallCount: nullableNumber(row.model_call_count),
    createdAt: timestamp(row.created_at), reviewVerdict: row.review_verdict as "pass" | "fail" | null,
    reviewReason: row.review_reason === null ? null : String(row.review_reason),
    reviewedBy: row.reviewed_by === null ? null : String(row.reviewed_by),
    reviewedAt: row.reviewed_at === null ? null : timestamp(row.reviewed_at),
  };
}

const evaluationSelect = `select id, import_id, suite_version, evaluator_version, fixture_id, task_type,
  provider, model, strategy_id, strategy_version, attempt, k, budget_dimension, budget_value,
  quality_score, automatic_verdict, duration_ms, input_tokens, output_tokens, cached_input_tokens,
  reasoning_tokens, total_tokens, model_call_count, created_at, review_verdict, review_reason,
  reviewed_by, reviewed_at from evaluation_attempts`;

export function createPostgresAdminAnalyticsStore(db: Queryable): AdminAnalyticsStore {
  return {
    async recordTelemetry(entry) {
      await db.query(`insert into llm_request_telemetry (
        id, run_id, project_id, user_id, provider_config_id, model, task_type, stage, diagram_kind,
        subtask_id, requested_model_count, queued_at, provider_started_at, first_reasoning_at,
        first_visible_at, last_visible_at, completed_at, queue_ms, provider_ttft_ms, ttft_ms,
        reasoning_ms, decode_ms, total_ms, input_tokens, output_tokens, cached_input_tokens,
        reasoning_tokens, total_tokens, outcome, status_code, error_category, retry_count,
        format_fallback_count, usage_unavailable_reason
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34) on conflict (id) do nothing`, [
        entry.id, entry.runId, entry.projectId, entry.userId, entry.providerConfigId, entry.model,
        entry.taskType, entry.stage, entry.diagramKind, entry.subtaskId, entry.requestedModelCount,
        entry.queuedAt, entry.providerStartedAt, entry.firstReasoningAt, entry.firstVisibleAt,
        entry.lastVisibleAt, entry.completedAt, entry.queueMs, entry.providerTtftMs, entry.ttftMs,
        entry.reasoningMs, entry.decodeMs, entry.totalMs, entry.usage?.inputTokens ?? null,
        entry.usage?.outputTokens ?? null, entry.usage?.cachedInputTokens ?? null,
        entry.usage?.reasoningTokens ?? null, entry.usage?.totalTokens ?? null, entry.outcome,
        entry.statusCode, entry.errorCategory, entry.retryCount, entry.formatFallbackCount,
        entry.usageUnavailableReason,
      ]);
    },
    async listTelemetry(filters) {
      const result = await db.query<Record<string, unknown>>(`select * from llm_request_telemetry
        where queued_at >= $1::timestamptz and queued_at < $2::timestamptz
          and ($3::text is null or task_type = $3) and ($4::text is null or provider_config_id = $4)
          and ($5::text is null or model = $5) and ($6::int is null or requested_model_count = $6)
        order by queued_at asc`, [filters.from, filters.to, filters.taskType ?? null,
        filters.providerConfigId ?? null, filters.model ?? null, filters.requestedModelCount ?? null]);
      return result.rows.map(mapTelemetryRow);
    },
    async importEvaluationReport(report) {
      const marker = await db.query<{ id: string }>(`insert into evaluation_imports
        (id, suite_version, evaluator_version, generated_at) values ($1,$2,$3,$4)
        on conflict (id) do nothing returning id`,
        [report.importId, report.suiteVersion, report.evaluatorVersion, report.generatedAt]);
      if (!marker.rows.length) return { imported: 0, duplicate: true };
      for (const attempt of report.attempts) {
        await db.query(`insert into evaluation_attempts (
          id, import_id, suite_version, evaluator_version, fixture_id, task_type, provider, model,
          strategy_id, strategy_version, attempt, k, budget_dimension, budget_value, quality_score,
          automatic_verdict, duration_ms, input_tokens, output_tokens, cached_input_tokens,
          reasoning_tokens, total_tokens, model_call_count, created_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24) on conflict (id) do nothing`, [attempt.id, report.importId,
          report.suiteVersion, report.evaluatorVersion, attempt.fixtureId, attempt.taskType,
          attempt.provider, attempt.model, attempt.strategyId, attempt.strategyVersion,
          attempt.attempt, attempt.k, attempt.budgetDimension, attempt.budgetValue,
          attempt.qualityScore, attempt.automaticVerdict, attempt.durationMs, attempt.inputTokens,
          attempt.outputTokens, attempt.cachedInputTokens, attempt.reasoningTokens,
          attempt.totalTokens, attempt.modelCallCount, attempt.createdAt]);
      }
      return { imported: report.attempts.length, duplicate: false };
    },
    async listEvaluationAttempts(filters) {
      const result = await db.query<Record<string, unknown>>(`${evaluationSelect}
        where created_at >= $1::timestamptz and created_at < $2::timestamptz
          and ($3::text is null or task_type = $3) and ($4::text is null or model = $4)
          and ($5::text is null or strategy_id = $5)
        order by created_at desc, fixture_id, attempt`, [filters.from, filters.to,
        filters.taskType ?? null, filters.model ?? null, filters.strategyId ?? null]);
      return result.rows.map(mapEvaluationRow);
    },
    async reviewEvaluationAttempt({ attemptId, reviewerId, review }) {
      const result = await db.query<Record<string, unknown>>(`update evaluation_attempts
        set review_verdict=$2, review_reason=$3, reviewed_by=$4, reviewed_at=now()
        where id=$1 returning *`, [attemptId, review.verdict, review.reason, reviewerId]);
      return result.rows[0] ? mapEvaluationRow(result.rows[0]) : null;
    },
  };
}

export function newTelemetryId() {
  return randomUUID();
}
