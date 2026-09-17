import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryAdminAnalyticsStore } from "./admin-analytics-store.js";
import {
  buildAdminEvaluationMetricsView,
  buildAdminPerformanceView,
  calculateEvaluationMetrics,
  nearestRankPercentile,
} from "./admin-performance-view.js";
import { createEmptySnapshot } from "../runs/records/snapshots.js";
import { createRunRecordStore } from "../runs/records/run-record-store.js";

test("nearest-rank p95 uses the observed rank without interpolation", () => {
  assert.equal(nearestRankPercentile(Array.from({ length: 20 }, (_, index) => index + 1), 0.95), 19);
  assert.equal(nearestRankPercentile([], 0.95), null);
});

test("performance view groups requirement runs by requested UML model count", async () => {
  const analyticsStore = createInMemoryAdminAnalyticsStore();
  const runs = createRunRecordStore();
  const snapshot = createEmptySnapshot("run-1", "需求", ["usecase", "class", "activity"], [], {
    requestedDiagrams: ["usecase", "class"],
  });
  snapshot.status = "completed";
  runs.set("run-1", {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: true,
    metadata: {
      createdAt: "2026-09-01T00:00:00.000Z",
      completedAt: "2026-09-01T00:00:10.000Z",
    },
  });
  const view = await buildAdminPerformanceView({
    analyticsStore,
    runs,
    filters: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
  });
  assert.equal(view.summary.averageDurationMs, 10_000);
  assert.equal(view.taskPerformance[0]?.requestedModelCount, "2");
  assert.equal(view.taskPerformance[0]?.sampleCount, 1);
  assert.equal(view.dataCompleteness.historicalBackfill, false);
  assert.equal(view.summary.p95TtftMs, null);
});

test("evaluation metrics apply manual verdicts and preserve all Pass definitions", async () => {
  const analyticsStore = createInMemoryAdminAnalyticsStore();
  await analyticsStore.importEvaluationReport({
    importId: "report-1",
    suiteVersion: "suite-v1",
    evaluatorVersion: "quality-v1",
    generatedAt: "2026-09-02T00:00:00.000Z",
    attempts: [
      { id: "a-1", fixtureId: "a", taskType: "requirements_to_uml", provider: null, model: "m", strategyId: "single-model", strategyVersion: "1", attempt: 1, k: 2, budgetDimension: null, budgetValue: null, qualityScore: 50, automaticVerdict: "fail", durationMs: 100, inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null, totalTokens: 10, modelCallCount: 1, createdAt: "2026-09-02T00:00:00.000Z" },
      { id: "a-2", fixtureId: "a", taskType: "requirements_to_uml", provider: null, model: "m", strategyId: "single-model", strategyVersion: "1", attempt: 2, k: 2, budgetDimension: null, budgetValue: null, qualityScore: 90, automaticVerdict: "pass", durationMs: 100, inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: 20, totalTokens: 20, modelCallCount: 1, createdAt: "2026-09-02T00:00:00.000Z" },
      { id: "b-1", fixtureId: "b", taskType: "requirements_to_uml", provider: null, model: "m", strategyId: "single-model", strategyVersion: "1", attempt: 1, k: 2, budgetDimension: null, budgetValue: null, qualityScore: 80, automaticVerdict: "pass", durationMs: 100, inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null, totalTokens: 30, modelCallCount: 1, createdAt: "2026-09-02T00:00:00.000Z" },
      { id: "b-2", fixtureId: "b", taskType: "requirements_to_uml", provider: null, model: "m", strategyId: "single-model", strategyVersion: "1", attempt: 2, k: 2, budgetDimension: null, budgetValue: null, qualityScore: 85, automaticVerdict: "pass", durationMs: 100, inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null, totalTokens: 40, modelCallCount: 1, createdAt: "2026-09-02T00:00:00.000Z" },
    ],
  });
  const attempts = await analyticsStore.listEvaluationAttempts({ from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" });
  assert.deepEqual(calculateEvaluationMetrics(attempts), {
    fixtureCount: 2, attemptCount: 4, k: 2, passAt1: 0.5, passAtK: 1,
    passPowerK: 0.5, bestAtK: 87.5, averageTokensPerPass: 30, lowSample: true,
  });
  await analyticsStore.reviewEvaluationAttempt({ attemptId: "a-1", reviewerId: "admin", review: { verdict: "pass", reason: "人工确认通过" } });
  const view = await buildAdminEvaluationMetricsView({ analyticsStore, filters: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" } });
  assert.equal(view.summary.passAt1, 1);
  assert.equal(view.summary.passPowerK, 1);
  assert.equal(view.pendingReviewCount, 3);
});
