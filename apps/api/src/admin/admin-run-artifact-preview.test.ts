// Verifies historical PlantUML previews are restored once and safely persisted.
import assert from "node:assert/strict";
import test from "node:test";
import { ensureAdminRunSvgPreviews } from "./admin-run-artifact-preview.js";
import { buildRunArtifactItems } from "../runs/records/admin-run-summaries.js";
import { createEmptySnapshot } from "../runs/records/snapshots.js";
import type { RunRecord } from "../runs/records/run-record-store.js";

function historicalRecord(): RunRecord {
  const snapshot = createEmptySnapshot("run-history", "历史需求", ["usecase"]);
  snapshot.plantUml.push({
    modelId: "usecase:main",
    diagramKind: "usecase",
    source: "@startuml\n@enduml",
  });
  return {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: true,
  };
}

test("historical PlantUML is rendered, persisted, and reused", async () => {
  const record = historicalRecord();
  let renderCalls = 0;
  let persistCalls = 0;
  record.persist = async () => {
    persistCalls += 1;
  };
  const renderClient = async () => {
    renderCalls += 1;
    return {
      svg: "<svg><text>历史用例图</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: "2026-09-18T00:00:00.000Z",
        sourceLength: 18,
        durationMs: 12,
      },
    };
  };

  assert.deepEqual(await ensureAdminRunSvgPreviews(record, renderClient), []);
  assert.deepEqual(await ensureAdminRunSvgPreviews(record, renderClient), []);
  assert.equal(renderCalls, 1);
  assert.equal(persistCalls, 1);
  assert.equal(record.snapshot.svgArtifacts.length, 1);

  const items = buildRunArtifactItems(record.snapshot, { includePreviews: true });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.type, "UML 模型");
  assert.equal(items[0]?.previewState, "ready");
  assert.match(items[0]?.preview?.svg ?? "", /历史用例图/);
});

test("render failures do not persist or expose source text", async () => {
  const record = historicalRecord();
  let persistCalls = 0;
  record.persist = async () => {
    persistCalls += 1;
  };

  const failures = await ensureAdminRunSvgPreviews(record, async () => {
    throw new Error("provider rejected @startuml private-content");
  });

  assert.equal(persistCalls, 0);
  assert.equal(record.snapshot.svgArtifacts.length, 0);
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.message, "Render Service 未能生成模型图，请稍后重试。");
  assert.doesNotMatch(JSON.stringify(failures), /private-content|@startuml/);
});
