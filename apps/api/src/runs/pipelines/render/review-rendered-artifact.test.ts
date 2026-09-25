// Verifies visual review decisions, image input, and source-only repair behavior.
import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramModelSpec, ProviderSettings } from "@uml-platform/contracts";
import type { LlmTransport } from "../../../llm.js";
import type { RenderClient } from "../../../adapters/render/render-client.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { renderArtifactWithRepair } from "./render-artifact-with-repair.js";
import { reviewRenderedArtifact } from "./review-rendered-artifact.js";

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
    yield '{"passed":true,"issues":[]}';
  } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "passed");
  assert.equal(sawImage, true);
  assert.equal(run.events.some((event) => event.type === "stage_progress" && event.stage === "verify_diagram_visual" && event.subtaskStatus === "completed"), true);
});

test("repairs PlantUML and rerenders before accepting the second visual judgment", async () => {
  const run = record();
  let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() {
    calls += 1;
    yield calls === 1 ? '{"passed":false,"issues":["连线缺失"]}' : calls === 2 ? '{"source":"@startuml\\nA --> B\\n@enduml"}' : '{"passed":true,"issues":[]}';
  } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "passed");
  assert.equal(calls, 3);
  assert.equal(result.review.repairAttempts, 1);
  assert.match(result.rendered.artifact.source, /A --> B/);
  assert.deepEqual(model.relationships, []);
});

test("skips image review when the provider rejects image input", async () => {
  const run = record();
  const transport: LlmTransport = { async *streamChatCompletion() { throw new Error("image input not supported"); } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "skipped");
});

test("checks an image even when catalog capability is text chat", async () => {
  const run = record();
  let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() { calls += 1; yield '{"passed":true,"issues":[]}'; } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: { ...settings, modelCapability: { category: "text_chat" } as ProviderSettings["modelCapability"] }, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "passed");
  assert.equal(calls, 1);
});

test("keeps the last compilable source and issues when visual repairs are exhausted", async () => {
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
  assert.equal(result.review.attempts, 3);
  assert.equal(result.review.repairAttempts, 2);
  assert.deepEqual(result.review.issues, ["标签不可读"]);
  assert.match(result.rendered.artifact.source, /A --> B : 4/);
});
