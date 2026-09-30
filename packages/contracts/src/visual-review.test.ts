// Verifies legacy review compatibility and durable structural repair records.
import assert from "node:assert/strict";
import test from "node:test";
import { diagramVisualReviewSchema } from "./visual-review.js";

const legacy = { status: "pending_review", issues: ["标签待确认"], reason: "待确认", attempts: 1, checkedAt: "check-1" };

test("historical image reviews remain readable without new fields", () => {
  assert.deepEqual(diagramVisualReviewSchema.parse(legacy), legacy);
});

test("review replay retains evidence, shared repair rounds, outcome and input fingerprint", () => {
  const review = { ...legacy, repairAttempts: 1, structureAttempts: 2, checkOutcome: "inconclusive", inputFingerprint: "input-1", stopReason: "标签无法辨认",
    findings: [{ id: "unknown", layer: "image", code: "unknown-shape", modelId: "model-1", observation: "图右侧标签无法辨认", evidence: [{ source: "image", reference: "右侧", detail: "图片观察" }], verification: "inconclusive", repairable: false }],
    repairHistory: [{ round: 1, target: "model", issueIds: ["boundary"], callId: "call-1", beforeFingerprint: "before", afterFingerprint: "after", status: "accepted", changes: ["恢复比较符"], reason: "已确认字段" }],
  };
  assert.deepEqual(diagramVisualReviewSchema.parse(JSON.parse(JSON.stringify(review))), review);
  assert.equal(diagramVisualReviewSchema.safeParse({ ...review, repairHistory: [{ ...review.repairHistory[0], round: 3 }] }).success, false);
  assert.equal(diagramVisualReviewSchema.safeParse({ ...review, findings: [{ ...review.findings[0], observation: "" }] }).success, false);
});
