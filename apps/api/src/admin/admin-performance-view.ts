// Builds chart-ready production and evaluation analytics without exposing prompts or model output.
import type { RunRecordStore } from "../runs/records/run-record-store.js";
import { calculateDurationMs, isGenerationTaskType, taskTypeForSnapshot } from "../runs/records/admin-run-summaries.js";
import type { AdminAnalyticsStore, AnalyticsWindowFilters, EvaluationAttemptRecord, LlmRequestTelemetry } from "./admin-analytics-store.js";

function numeric(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}
function average(values: Array<number | null | undefined>) {
  const valid = numeric(values);
  return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
}
export function nearestRankPercentile(values: Array<number | null | undefined>, percentile: number) {
  const valid = numeric(values).sort((left, right) => left - right);
  if (!valid.length) return null;
  return valid[Math.min(Math.max(1, Math.ceil(percentile * valid.length)) - 1, valid.length - 1)]!;
}
function percentage(count: number, total: number) {
  return total ? count / total : null;
}
function requestedModelCount(snapshot: object, taskType: string) {
  if (taskType !== "requirements_to_uml" && taskType !== "design_modeling") return null;
  const source = snapshot as { requestedDiagrams?: unknown; selectedDiagrams?: unknown };
  const selected = Array.isArray(source.requestedDiagrams) ? source.requestedDiagrams
    : Array.isArray(source.selectedDiagrams) ? source.selectedDiagrams : null;
  return selected?.length ?? null;
}
function modelCountBucket(value: number | null) {
  if (value === null) return "not_applicable";
  return value >= 4 ? "4+" : String(value);
}
function isoWindow(query: Record<string, unknown>, now = new Date()) {
  const from = typeof query.from === "string" ? new Date(query.from)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = typeof query.to === "string" ? new Date(query.to) : now;
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
    return { ok: false as const, message: "from and to must be valid timestamps and from must precede to" };
  }
  if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    return { ok: false as const, message: "analytics window cannot exceed 366 days" };
  }
  return { ok: true as const, from: from.toISOString(), to: to.toISOString() };
}
export function parseAnalyticsFilters(query: Record<string, unknown>) {
  const window = isoWindow(query);
  if (!window.ok) return window;
  const count = query.requestedModelCount === undefined ? undefined : Number(query.requestedModelCount);
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
    return { ok: false as const, message: "requestedModelCount must be a positive integer" };
  }
  return { ok: true as const, filters: {
    from: window.from, to: window.to,
    taskType: typeof query.taskType === "string" && query.taskType ? query.taskType : undefined,
    providerConfigId: typeof query.providerConfigId === "string" && query.providerConfigId ? query.providerConfigId : undefined,
    model: typeof query.model === "string" && query.model ? query.model : undefined,
    requestedModelCount: count,
    strategyId: typeof query.strategyId === "string" && query.strategyId ? query.strategyId : undefined,
  } satisfies AnalyticsWindowFilters };
}
function telemetrySummary(records: LlmRequestTelemetry[]) {
  const successful = records.filter((entry) => entry.outcome === "success");
  const inputThroughput = successful.map((entry) => entry.usage?.inputTokens && entry.providerTtftMs && entry.providerTtftMs > 0
    ? entry.usage.inputTokens / (entry.providerTtftMs / 1000) : null);
  const outputThroughput = successful.map((entry) => entry.usage?.outputTokens && entry.decodeMs && entry.decodeMs > 0
    ? entry.usage.outputTokens / (entry.decodeMs / 1000) : null);
  return {
    requestCount: records.length,
    p95TtftMs: nearestRankPercentile(records.map((entry) => entry.ttftMs), 0.95),
    averageInputThroughput: average(inputThroughput),
    averageOutputThroughput: average(outputThroughput),
    averageTokensPerSuccess: average(successful.map((entry) => entry.usage?.totalTokens)),
    rate429: percentage(records.filter((entry) => entry.statusCode === 429).length, records.length),
    timeoutRate: percentage(records.filter((entry) => entry.errorCategory === "timeout").length, records.length),
    retryRate: percentage(records.filter((entry) => entry.retryCount > 0 || entry.formatFallbackCount > 0).length, records.length),
  };
}
export async function buildAdminPerformanceView({ analyticsStore, filters, runs }: {
  analyticsStore: AdminAnalyticsStore; filters: AnalyticsWindowFilters; runs: RunRecordStore;
}) {
  const telemetry = await analyticsStore.listTelemetry(filters);
  const runRows = Array.from(runs.values()).flatMap((record) => {
    const createdAt = record.metadata?.createdAt;
    if (!createdAt || createdAt < filters.from || createdAt >= filters.to) return [];
    const taskType = taskTypeForSnapshot(record.snapshot);
    if (!isGenerationTaskType(taskType) || (filters.taskType && filters.taskType !== taskType)) return [];
    const count = requestedModelCount(record.snapshot, taskType);
    if (filters.requestedModelCount !== undefined && count !== filters.requestedModelCount) return [];
    return [{ taskType, status: record.snapshot.status,
      durationMs: calculateDurationMs(createdAt, record.metadata?.completedAt), requestedModelCount: count }];
  });
  const taskKeys = new Set(runRows.map((row) => `${row.taskType}:${modelCountBucket(row.requestedModelCount)}`));
  const taskPerformance = Array.from(taskKeys, (key) => {
    const [taskType, bucket] = key.split(":");
    const rows = runRows.filter((row) => row.taskType === taskType && modelCountBucket(row.requestedModelCount) === bucket);
    const successfulCount = rows.filter((row) => row.status === "completed").length;
    return { taskType, requestedModelCount: bucket, sampleCount: rows.length, successfulCount,
      failedCount: rows.filter((row) => row.status === "failed").length,
      successRate: percentage(successfulCount, rows.length), averageDurationMs: average(rows.map((row) => row.durationMs)),
      p50DurationMs: nearestRankPercentile(rows.map((row) => row.durationMs), 0.5),
      p95DurationMs: nearestRankPercentile(rows.map((row) => row.durationMs), 0.95), lowSample: rows.length < 100 };
  });
  const modelKeys = new Set(telemetry.map((entry) => `${entry.providerConfigId ?? "unmanaged"}\u0000${entry.model}`));
  const modelPerformance = Array.from(modelKeys, (key) => {
    const [providerConfigId, model] = key.split("\u0000");
    const rows = telemetry.filter((entry) => (entry.providerConfigId ?? "unmanaged") === providerConfigId && entry.model === model);
    const tokens = (field: keyof NonNullable<LlmRequestTelemetry["usage"]>) => rows.map((entry) => entry.usage?.[field]);
    return { providerConfigId: providerConfigId === "unmanaged" ? null : providerConfigId, model,
      sampleCount: rows.length, averageQueueMs: average(rows.map((entry) => entry.queueMs)),
      averageProviderTtftMs: average(rows.map((entry) => entry.providerTtftMs)),
      averageReasoningMs: average(rows.map((entry) => entry.reasoningMs)),
      averageDecodeMs: average(rows.map((entry) => entry.decodeMs)),
      averageInputTokens: average(tokens("inputTokens")), averageOutputTokens: average(tokens("outputTokens")),
      averageCachedInputTokens: average(tokens("cachedInputTokens")), averageReasoningTokens: average(tokens("reasoningTokens")),
      ...telemetrySummary(rows), rpmLimit: null, tpmLimit: null, limitSource: "provider_not_reported" as const,
      lowSample: rows.length < 100 };
  });
  const successfulRuns = runRows.filter((row) => row.status === "completed").length;
  return { generatedAt: new Date().toISOString(),
    metricWindow: { timeZone: "Asia/Shanghai" as const, startAt: filters.from, endAt: filters.to }, filters,
    summary: { runCount: runRows.length, successRate: percentage(successfulRuns, runRows.length),
      averageDurationMs: average(runRows.map((row) => row.durationMs)),
      p95DurationMs: nearestRankPercentile(runRows.map((row) => row.durationMs), 0.95), ...telemetrySummary(telemetry) },
    taskPerformance, modelPerformance,
    latencyBreakdown: modelPerformance.map((row) => ({ providerConfigId: row.providerConfigId, model: row.model,
      sampleCount: row.sampleCount, queueMs: row.averageQueueMs, prefillObservedMs: row.averageProviderTtftMs,
      reasoningMs: row.averageReasoningMs, decodeMs: row.averageDecodeMs })),
    tokenBreakdown: modelPerformance.map((row) => ({ providerConfigId: row.providerConfigId, model: row.model,
      sampleCount: row.sampleCount, inputTokens: row.averageInputTokens, outputTokens: row.averageOutputTokens,
      cachedInputTokens: row.averageCachedInputTokens, reasoningTokens: row.averageReasoningTokens })),
    dataCompleteness: { telemetryStartedAt: telemetry[0]?.queuedAt ?? null, totalRequests: telemetry.length,
      requestsWithUsage: telemetry.filter((entry) => entry.usage).length,
      requestsWithTtft: telemetry.filter((entry) => entry.ttftMs !== null).length,
      requestsWithReasoning: telemetry.filter((entry) => entry.reasoningMs !== null).length,
      historicalBackfill: false },
  };
}

function finalVerdict(attempt: EvaluationAttemptRecord) {
  return attempt.reviewVerdict ?? attempt.automaticVerdict;
}
function groupBy<T>(values: T[], key: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) groups.set(key(value), [...(groups.get(key(value)) ?? []), value]);
  return groups;
}
export function calculateEvaluationMetrics(attempts: EvaluationAttemptRecord[]) {
  const ordered = Array.from(groupBy(attempts, (attempt) => attempt.fixtureId).values())
    .map((rows) => rows.slice().sort((a, b) => a.attempt - b.attempt));
  const configuredK = attempts.length ? Math.min(...attempts.map((attempt) => attempt.k)) : 5;
  const k = Math.max(1, Math.min(5, configuredK));
  const passes = (rows: EvaluationAttemptRecord[]) => rows.slice(0, k).map((row) => finalVerdict(row) === "pass");
  return {
    fixtureCount: ordered.length, attemptCount: attempts.length, k,
    passAt1: percentage(ordered.filter((rows) => passes(rows)[0]).length, ordered.length),
    passAtK: percentage(ordered.filter((rows) => passes(rows).some(Boolean)).length, ordered.length),
    passPowerK: percentage(ordered.filter((rows) => passes(rows).length === k && passes(rows).every(Boolean)).length, ordered.length),
    bestAtK: ordered.length
      ? ordered.reduce((sum, rows) => sum + Math.max(...rows.slice(0, k).map((row) => row.qualityScore)), 0) / ordered.length
      : null,
    averageTokensPerPass: average(attempts.filter((row) => finalVerdict(row) === "pass").map((row) => row.totalTokens)),
    lowSample: attempts.length < 100,
  };
}
export async function buildAdminEvaluationMetricsView({ analyticsStore, filters }: {
  analyticsStore: AdminAnalyticsStore; filters: AnalyticsWindowFilters;
}) {
  const attempts = await analyticsStore.listEvaluationAttempts(filters);
  const configurations = groupBy(attempts, (attempt) => `${attempt.model}\u0000${attempt.strategyId}\u0000${attempt.taskType}`);
  const comparisons = Array.from(configurations.entries(), ([key, rows]) => {
    const [model, strategyId, taskType] = key.split("\u0000");
    return { model, strategyId, taskType, ...calculateEvaluationMetrics(rows) };
  });
  const budgetGroups = groupBy(attempts.filter((attempt) => attempt.budgetDimension && attempt.budgetValue !== null),
    (attempt) => `${attempt.budgetDimension}\u0000${attempt.budgetValue}`);
  return {
    generatedAt: new Date().toISOString(),
    metricWindow: { timeZone: "Asia/Shanghai" as const, startAt: filters.from, endAt: filters.to },
    summary: calculateEvaluationMetrics(attempts), comparisons,
    budgetCurves: Array.from(budgetGroups.entries(), ([key, rows]) => {
      const [dimension, value] = key.split("\u0000");
      return { dimension, value: Number(value), ...calculateEvaluationMetrics(rows) };
    }).sort((left, right) => left.dimension.localeCompare(right.dimension) || left.value - right.value),
    reasoningQuality: attempts.flatMap((attempt) => attempt.reasoningTokens === null ? [] : [{
      attemptId: attempt.id, fixtureId: attempt.fixtureId, model: attempt.model,
      strategyId: attempt.strategyId, reasoningTokens: attempt.reasoningTokens,
      qualityScore: attempt.qualityScore, verdict: finalVerdict(attempt),
    }]),
    pendingReviewCount: attempts.filter((attempt) => attempt.reviewVerdict === null).length,
    dataAvailable: attempts.length > 0,
  };
}
