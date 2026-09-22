// Verifies durable stream batching, parallel attribution, cancellation flush and public reasoning summaries.
import assert from "node:assert/strict";
import test from "node:test";
import { runEventSchema, type RunActivityEvent } from "@uml-platform/contracts";
import { createEmptySnapshot } from "../../records/snapshots.js";
import { createRunRecordStore, emitEvent, serializeRunRecordStore, type RunRecord } from "../../records/run-record-store.js";
import { createRunLlmChunkHandlers } from "./llm-chunk-events.js";
import { collectTextResult } from "./structured-output.js";

function record(): RunRecord {
  return { snapshot: createEmptySnapshot("run-activity", "需求", ["usecase"]), events: [], listeners: new Set(), terminal: false };
}
function activity(record: RunRecord) {
  return record.events.filter((event): event is RunActivityEvent => event.type === "run_activity");
}

test("parallel calls retain identities, batch output and replay exactly after serialization", () => {
  const run = record();
  const a = createRunLlmChunkHandlers({ record: run, stage: "generate_models", subtaskId: "usecase" });
  const b = createRunLlmChunkHandlers({ record: run, stage: "generate_models", subtaskId: "activity" });
  a.onStart?.(); b.onStart?.();
  a.onChunk("用例"); b.onChunk("活动"); a.onChunk("图");
  a.onComplete?.(); b.onComplete?.();
  const events = activity(run);
  assert.equal(events.filter((event) => event.phase === "output").length, 2);
  assert.equal(events.find((event) => event.phase === "output" && event.subtaskId === "usecase")?.text, "用例图");
  assert.equal(new Set(events.map((event) => event.callId)).size, 2);
  assert.equal(new Set(events.map((event) => event.eventId)).size, events.length);
  events.forEach((event) => assert.equal(runEventSchema.safeParse(event).success, true));
  const store = createRunRecordStore(); store.set(run.snapshot.runId, run);
  const restored = createRunRecordStore(serializeRunRecordStore(store)).get(run.snapshot.runId)!;
  assert.deepEqual(restored.events, run.events);
});

test("cancellation flushes pending text before terminal and rejects subsequent chunks", () => {
  const run = record();
  const sink = createRunLlmChunkHandlers({ record: run, stage: "generate_models" });
  sink.onChunk("已到达的内容");
  emitEvent(run, { type: "cancelled", stage: "generate_models", message: "已取消" });
  sink.onChunk("迟到内容"); sink.onComplete?.();
  assert.equal(activity(run).filter((event) => event.phase === "output").map((event) => event.text).join(""), "已到达的内容");
  assert.equal(run.events.at(-1)?.type, "cancelled");
});

test("transport activity and public summaries flow through collectors without exposing raw reasoning", async () => {
  const run = record();
  const sink = createRunLlmChunkHandlers({ record: run, stage: "generate_document_text" });
  const content = await collectTextResult({ async *streamChatCompletion(input) {
    input.onReasoningChunk?.(); input.onReasoningChunk?.();
    input.onReasoningSummary?.("正在核对来源。");
    yield "正文";
  } }, { baseUrl: "https://example.com", apiKey: "test", model: "test" }, [], sink);
  assert.equal(content, "正文");
  assert.equal(activity(run).filter((event) => event.phase === "thinking").length, 1);
  assert.equal(activity(run).find((event) => event.phase === "summary")?.text, "正在核对来源。");
  assert.equal(activity(run).at(-1)?.phase, "completed");
});

test("failed calls flush text and a retry uses a different identity", async () => {
  const run = record();
  await assert.rejects(() => collectTextResult({ async *streamChatCompletion() { yield "部分结果"; throw new Error("offline"); } },
    { baseUrl: "https://example.com", apiKey: "test", model: "test" }, [], createRunLlmChunkHandlers({ record: run, stage: "generate_models" })));
  const retry = createRunLlmChunkHandlers({ record: run, stage: "generate_models" });
  retry.onStart?.(); retry.onComplete?.();
  assert.equal(new Set(activity(run).map((event) => event.callId)).size, 2);
  assert.ok(activity(run).some((event) => event.phase === "failed"));
});
