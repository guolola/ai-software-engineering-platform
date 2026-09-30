// Verifies visual review decisions, image input, and advisory review without source mutation.
import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramModelSpec, ProviderSettings } from "@uml-platform/contracts";
import type { LlmTransport } from "../../../llm.js";
import type { RenderClient } from "../../../adapters/render/render-client.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { renderArtifactWithRepair } from "./render-artifact-with-repair.js";
import { reviewRenderedArtifact } from "./review-rendered-artifact.js";
import { DiagramReviewRenderError } from "./review-rendered-artifact.js";
import { deriveTableModel, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture } from "../../../../../../packages/contracts/src/testing/model-fixtures.js";
import { generateDesignPlantUmlArtifacts } from "../../../plantuml.js";
import { RunCancelledError } from "../../records/run-cancellation.js";

function repairTransport(candidate?: DesignDiagramModelSpec): LlmTransport {
  return { async *streamChatCompletion(input) {
    const prompt = input.messages.at(-1)?.content;
    input.onReasoningChunk?.("核对本模型的已确认约束"); input.onReasoningSummary?.("已完成依据核实");
    yield typeof prompt === "string" && prompt.includes('只返回 {"model"') ? JSON.stringify({ model: candidate }) : '{"passed":true,"issues":[],"findings":[]}';
  } };
}

const settings: ProviderSettings = { apiBaseUrl: "https://example.test", apiKey: "test", model: "vision-test" };
const model: DiagramModelSpec = { diagramKind: "usecase", title: "用例", summary: "用例", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] };
const renderClient: RenderClient = async (artifact) => ({ svg: `<svg>${artifact.source}</svg>`, renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 1 } });
const pngRenderClient = async () => ({ png: Buffer.from("png"), renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: 1, durationMs: 1 } });

function record(): RunRecord {
  return { snapshot: createEmptySnapshot("visual-test", "需求", ["usecase"]), events: [], listeners: new Set(), terminal: false };
}

async function rendered(input: RunRecord) {
  const unused: LlmTransport = { async *streamChatCompletion() { throw new Error("unexpected repair"); } };
  const value = await renderArtifactWithRepair(input, settings, unused, renderClient, model, { diagramKind: "usecase", source: "@startuml\n@enduml" });
  assert.equal(value.status, "success");
  if (value.status !== "success") throw new Error("render failed");
  return value;
}

test("passes latest PNG with model and source to the selected chat model", async () => {
  const run = record();
  let sawImage = false;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const content = input.messages.at(-1)?.content;
    sawImage = Array.isArray(content) && content.some((part) => part.type === "image_url" && part.image_url.url.startsWith("data:image/png;base64,"));
    input.onReasoningChunk?.("核对环境图节点与连线。");
    yield '{"passed":true,"issues":[]}';
  } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "passed");
  assert.equal(sawImage, true);
  assert.equal(run.events.some((event) => event.type === "stage_progress" && event.stage === "verify_diagram_visual" && event.subtaskStatus === "completed"), true);
  const activity = run.events.filter((event) => event.type === "run_activity");
  assert.equal(activity[0].inputImages?.[0].url, "data:image/png;base64,cG5n");
  assert.equal(activity.find((event) => event.phase === "reasoning")?.text, "核对环境图节点与连线。");
  assert.equal(activity.find((event) => event.phase === "output")?.text, '{"passed":true,"issues":[]}');
  assert.equal(new Set(activity.map((event) => event.callId)).size, 1);
});

test("keeps visual feedback advisory without allowing source rewrites", async () => {
  const run = record();
  let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() {
    calls += 1;
    yield calls === 1 ? '{"passed":false,"issues":["连线缺失"]}' : calls === 2 ? '{"source":"@startuml\\nA --> B\\n@enduml"}' : '{"passed":true,"issues":[]}';
  } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "pending_review");
  assert.equal(calls, 1);
  assert.equal(result.review.repairAttempts, 0);
  assert.doesNotMatch(result.rendered.artifact.source, /A --> B/);
  assert.deepEqual(model.relationships, []);
});

test("skips image review when the provider rejects image input", async () => {
  const run = record();
  const transport: LlmTransport = { async *streamChatCompletion() { throw new Error("image input not supported"); } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "skipped");
  assert.equal(result.review.attempts, 1);
});

test("accepted repair is validated, rendered, rechecked and returned for downstream generation", async () => {
  const run = record(); const table = modelFixture("design", "table"); if (table.diagramKind !== "table") throw new Error("fixture");
  const accepted = deriveTableModel(table); let latestSource = "";
  const checked = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(accepted), renderClient: async (artifact) => { latestSource = artifact.source; return renderClient(artifact); }, pngRenderClient: async (artifact) => { assert.equal(artifact.source, latestSource); return pngRenderClient(); }, model: table, basis: { stage: "design" }, mutable: true });
  assert.deepEqual(checked.model, JSON.parse(JSON.stringify(accepted)));
  assert.deepEqual(table.relationships, []);
  assert.equal(checked.review.repairAttempts, 1); assert.equal(checked.review.structureAttempts, 2); assert.equal(checked.review.attempts, 1);
  assert.equal(checked.review.status, "passed"); assert.equal(checked.review.repairHistory?.[0]?.status, "accepted");
  assert.ok(checked.rendered.artifact.source.includes("FK"));
  const calls = run.events.filter((event) => event.type === "run_activity" && event.phase === "started");
  assert.deepEqual(calls.map((event) => event.operation), ["structure_check", "model_repair", "structure_check", "visual_check"]);
  assert.equal(new Set(calls.map((event) => event.callId)).size, 4);
  assert.ok(calls.every((event) => event.modelId === "table"));
  assert.ok(calls.at(-1)?.inputImages?.length);
});

test("out-of-scope and no-op candidates never overwrite a valid tuple; failed attempt counts", async () => {
  const table = modelFixture("design", "table"); if (table.diagramKind !== "table") throw new Error("fixture");
  for (const candidate of [table, { ...deriveTableModel(table), title: "未经授权的改写" }]) {
    const run = record(); const artifact = generateDesignPlantUmlArtifacts([table])[0]!;
    const old = await renderClient(artifact);
    const checked = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(candidate), renderClient, pngRenderClient, model: table, rendered: { status: "success", artifact, svgArtifact: { ...old, diagramKind: "table", modelId: "table" } }, basis: { stage: "design" }, mutable: true });
    assert.deepEqual(checked.model, table); assert.equal(checked.rendered.svgArtifact.svg, old.svg);
    assert.equal(checked.review.repairAttempts, 1); assert.equal(checked.review.repairHistory?.[0]?.status, "rejected");
    assert.match(checked.review.stopReason!, /没有有效改动|越过授权/);
  }
});

test("manual models report deterministic suggestions with zero repair launches", async () => {
  const table = modelFixture("design", "table");
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, llmTransport: repairTransport(), renderClient, pngRenderClient, model: table as DesignDiagramModelSpec, basis: { stage: "design" } });
  assert.equal(checked.review.repairAttempts, 0); assert.equal(checked.review.status, "pending_review"); assert.deepEqual(checked.model, table);
});

test("the same model cannot reset its shared repair budget when the run is replayed", async () => {
  const run = record(); const table = modelFixture("design", "table");
  const common = { providerSettings: settings, llmTransport: repairTransport(table), renderClient, pngRenderClient, model: table, basis: { stage: "design" as const }, mutable: true };
  for (let attempt = 0; attempt < 2; attempt++) {
    const checked = await reviewRenderedArtifact({ ...common, record: run });
    assert.equal(checked.review.repairAttempts, attempt + 1);
    if ("visualReviews" in run.snapshot) run.snapshot.visualReviews[table.modelId!] = checked.review;
  }
  const restored = { ...run, snapshot: JSON.parse(JSON.stringify(run.snapshot)), events: JSON.parse(JSON.stringify(run.events)), listeners: new Set<RunRecord["listeners"] extends Set<infer T> ? T : never>() };
  const checked = await reviewRenderedArtifact({ ...common, record: restored });
  assert.equal(checked.review.repairAttempts, 2); assert.equal(checked.review.attempts, 3);
  assert.equal(checked.review.repairHistory?.length, 2); assert.match(checked.review.stopReason!, /两轮修复上限/);
});

test("missing PNG capability skips; PNG failure launches zero checks; invalid JSON launches one", async () => {
  const common = { providerSettings: settings, llmTransport: repairTransport(), renderClient, model };
  const skipped = await reviewRenderedArtifact({ ...common, record: record() });
  assert.equal(skipped.review.checkOutcome, "skipped"); assert.equal(skipped.review.attempts, 0);
  const noPng = await reviewRenderedArtifact({ ...common, record: record(), pngRenderClient: async () => { throw new Error("PNG unavailable"); } });
  assert.equal(noPng.review.checkOutcome, "not_completed"); assert.equal(noPng.review.attempts, 0);
  const bad = await reviewRenderedArtifact({ ...common, record: record(), pngRenderClient, llmTransport: { async *streamChatCompletion() { yield "invalid-json"; } } });
  assert.equal(bad.review.checkOutcome, "not_completed"); assert.equal(bad.review.attempts, 1);
});

test("new structure check failure preserves its reason when image verification succeeds", async () => {
  let calls = 0;
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, llmTransport: { async *streamChatCompletion() { yield ++calls === 1 ? "invalid-json" : '{"passed":true,"issues":[]}'; } }, renderClient, pngRenderClient, model, basis: { stage: "requirements" }, mutable: true });
  assert.equal(checked.review.checkOutcome, "not_completed"); assert.match(checked.review.issues.join(), /结构核对未完成/);
});

test("structure failure stays incomplete when the image provider is unsupported", async () => {
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, llmTransport: { async *streamChatCompletion(input) {
    if (Array.isArray(input.messages.at(-1)?.content)) throw new Error("image input not supported");
    yield "invalid-json";
  } }, renderClient, pngRenderClient, model, basis: { stage: "requirements" }, mutable: true });
  assert.equal(checked.review.checkOutcome, "not_completed");
  assert.equal(checked.review.attempts, 1);
  assert.match(checked.review.stopReason!, /拒绝图片/);
});

test("initial render failure records an incomplete review with zero image calls", async () => {
  await assert.rejects(reviewRenderedArtifact({ record: record(), providerSettings: settings, llmTransport: repairTransport(), renderClient: async () => { throw new Error("renderer offline"); }, pngRenderClient, model }), (error) => {
    assert.ok(error instanceof DiagramReviewRenderError);
    assert.equal(error.review.status, "pending_review"); assert.equal(error.review.checkOutcome, "not_completed");
    assert.equal(error.review.attempts, 0); assert.match(error.review.issues.join(), /renderer offline/);
    return true;
  });
});

test("model and render fixes share two attempts and repeated proven rendering defects fail", async () => {
  const table = modelFixture("design", "table"); if (table.diagramKind !== "table") throw new Error("fixture");
  let renders = 0; const run = record();
  await assert.rejects(reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(deriveTableModel(table)), renderClient: async (artifact) => { renders += 1; return { ...await renderClient(artifact), svg: '<svg><g id="elem_unrelated"/></svg>' }; }, pngRenderClient, model: table, basis: { stage: "design" }, mutable: true }), (error) => {
    assert.ok(error instanceof DiagramReviewRenderError); assert.equal(error.review.repairAttempts, 2); assert.match(error.message, /绘图器故障/); assert.equal(error.review.attempts, 0);
    assert.equal(error.review.repairHistory?.[1]?.status, "failed"); return true;
  });
  assert.equal(renders, 2);
});

test("timeout and cancellation propagate abort and never become a completed image verdict", async () => {
  const run = record(); let aborted = false;
  const waiting: LlmTransport = { async *streamChatCompletion(input) { await new Promise<void>((_resolve, reject) => input.abortSignal?.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true })); yield ""; } };
  const timedOut = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: waiting, renderClient, pngRenderClient, model, timeoutMs: 20 });
  assert.equal(aborted, true); assert.equal(timedOut.review.checkOutcome, "not_completed"); assert.equal(timedOut.review.attempts, 1);
  const cancelled = record();
  await assert.rejects(reviewRenderedArtifact({ record: cancelled, providerSettings: settings, llmTransport: waiting, renderClient, pngRenderClient: async () => { cancelled.snapshot.status = "cancelled"; return pngRenderClient(); }, model }), RunCancelledError);
});

test("parallel models retain independent input images, reasoning, operation and round on replay", async () => {
  const run = record(); const models = ["one", "two"].map((id) => ({ ...model, modelId: id }));
  await Promise.all(models.map((candidate) => reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(), renderClient, pngRenderClient: async () => ({ ...await pngRenderClient(), png: Buffer.from(candidate.modelId) }), model: candidate, basis: { stage: "requirements" }, mutable: true })));
  const replay = JSON.parse(JSON.stringify(run.events)) as typeof run.events;
  for (const id of ["one", "two"]) {
    const starts = replay.filter((event) => event.type === "run_activity" && event.modelId === id && event.phase === "started");
    assert.equal(starts.length, 2); assert.equal(starts[1]!.inputImages?.[0]?.url, `data:image/png;base64,${Buffer.from(id).toString("base64")}`);
    assert.ok(replay.filter((event) => event.type === "run_activity" && event.callId === starts[1]!.callId).every((event) => event.type !== "run_activity" || event.modelId === id));
  }
});

test("checks an image even when catalog capability is text chat", async () => {
  const run = record();
  let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() { calls += 1; yield '{"passed":true,"issues":[]}'; } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: { ...settings, modelCapability: { category: "text_chat" } as ProviderSettings["modelCapability"] }, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "passed");
  assert.equal(calls, 1);
});

test("keeps deterministic source and full issues after one advisory review", async () => {
  const run = record();
  let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() {
    calls += 1;
    yield calls % 2 === 0
      ? `{"source":"@startuml\\nA --> B : ${calls}\\n@enduml"}`
      : '{"passed":false,"issues":["标签不可读"]}';
  } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "pending_review");
  assert.equal(result.review.attempts, 1);
  assert.equal(result.review.repairAttempts, 0);
  assert.deepEqual(result.review.issues, ["标签不可读"]);
  assert.doesNotMatch(result.rendered.artifact.source, /A --> B/);
});
