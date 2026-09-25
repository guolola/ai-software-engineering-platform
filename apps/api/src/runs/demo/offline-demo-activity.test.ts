// Validates timed demo events, parallel attribution, recovery and cancellation without provider calls.
import assert from "node:assert/strict";
import test from "node:test";
import { runEventSchema, startRunRequestSchema, type RunActivityEvent } from "@uml-platform/contracts";
import { createEmptySnapshot, createEmptyDocumentSnapshot } from "../records/snapshots.js";
import { createRunRecordStore, emitEvent, serializeRunRecordStore, type RunRecord } from "../records/run-record-store.js";
import { emitOfflineDemoActivity } from "./offline-demo-activity.js";
import { completeOfflineDemoRequirementRun, createOfflineDemoDocumentInput } from "./offline-demo-runs.js";
import { fallbackDocumentSections } from "../../documents/context/document-context.js";
import { startDocumentRunRequestSchema } from "@uml-platform/contracts";

function record(): RunRecord {
  return { snapshot: createEmptySnapshot("demo-test", "演示需求", ["usecase", "activity"]), events: [], listeners: new Set(), terminal: false };
}
function activities(run: RunRecord) { return run.events.filter((e): e is RunActivityEvent => e.type === "run_activity"); }

test("demo generation emits output without invented reasoning for parallel models", async (t) => {
  const previous = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = "0";
  t.after(() => { if (previous === undefined) delete process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS; else process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = previous; });
  const run = record();
  await completeOfflineDemoRequirementRun(run, startRunRequestSchema.parse({ requirementText: "演示需求", selectedDiagrams: ["usecase", "activity"] }));
  const events = activities(run);
  assert.ok(events.every((event) => runEventSchema.safeParse(event).success));
  assert.equal(new Set(events.map((e) => e.eventId)).size, events.length);
  const models = events.filter((e) => e.stage === "generate_models");
  assert.ok(new Set(models.map((e) => e.subtaskId)).size >= 2);
  assert.equal(models[0].phase, "started");
  assert.equal(models[1].phase, "started");
  for (const id of new Set(events.map((e) => e.callId))) {
    const call = events.filter((e) => e.callId === id);
    assert.equal(call[0].phase, "started");
    assert.ok(call.filter((e) => e.phase === "output").length > 1);
    assert.ok(call.every((event) => !["thinking", "reasoning", "summary"].includes(event.phase)));
    assert.equal(call.at(-1)?.phase, "completed");
  }
  const store = createRunRecordStore(); store.set(run.snapshot.runId, run);
  assert.deepEqual(createRunRecordStore(serializeRunRecordStore(store)).get(run.snapshot.runId)?.events, run.events);
});

test("default demo pacing waits before output and stops promptly when cancelled", async (t) => {
  const previous = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  delete process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  t.after(() => { if (previous !== undefined) process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = previous; });
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const run = record();
  const done = emitOfflineDemoActivity(run, "extract_rules");
  const rejected = assert.rejects(done, { name: "RunCancelledError" });
  assert.deepEqual(activities(run).map((e) => e.phase), ["started"]);
  for (let i = 0; i < 7; i++) { t.mock.timers.tick(100); await new Promise<void>((resolve) => setImmediate(resolve)); }
  assert.deepEqual(activities(run).map((e) => e.phase), ["started"]);
  emitEvent(run, { type: "cancelled", stage: "extract_rules", message: "已停止" });
  const count = run.events.length;
  t.mock.timers.tick(100);
  await rejected;
  assert.equal(run.events.length, count);
  assert.equal(run.events.at(-1)?.type, "cancelled");
});

test("demo document output comes from the prepared document sections", async (t) => {
  const previous = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = "0";
  t.after(() => { if (previous === undefined) delete process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS; else process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = previous; });
  const input = createOfflineDemoDocumentInput(startDocumentRunRequestSchema.parse({ documentKind: "requirementsSpec", requirementText: "演示需求" }));
  const snapshot = createEmptyDocumentSnapshot("demo-document", input);
  snapshot.sections = fallbackDocumentSections(input);
  const run: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
  await emitOfflineDemoActivity(run, "generate_document_text");
  const text = activities(run).filter((e) => e.phase === "output").map((e) => e.text).join("");
  assert.ok(text.includes(snapshot.sections[0].title));
  assert.ok(activities(run).every((e) => !["thinking", "reasoning", "summary"].includes(e.phase)));
});
