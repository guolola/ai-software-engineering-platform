// Runs a real PlantUML SVG/PNG round trip after an authorized model correction.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveTableModel } from "@uml-platform/contracts";
import { modelFixture } from "../../../../../../packages/contracts/src/testing/model-fixtures.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import { reviewRenderedArtifact } from "./review-rendered-artifact.js";

test("real PlantUML consumes the corrected FK model and supplies the latest PNG to recheck", async () => {
  const root = fileURLToPath(new URL("../../../../../../", import.meta.url));
  const folder = resolve(root, "plantuml/build/libs");
  const jar = readdirSync(folder).find((file) => /^plantuml-.*\.jar$/.test(file) && !/sources|javadoc/.test(file));
  assert.ok(jar, "Build the repository PlantUML runtime first");
  const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, "bin/java.exe") : "C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot/bin/java.exe";
  const table = modelFixture("design", "table"); if (table.diagramKind !== "table") throw new Error("fixture");
  const candidate = deriveTableModel(table);
  const record: RunRecord = { snapshot: createEmptySnapshot("real-review", "需求", ["class"]), events: [], listeners: new Set(), terminal: false };
  const compile = (source: string, kind: "svg" | "png") => {
    const value = spawnSync(java, ["-Djava.awt.headless=true", "-jar", resolve(folder, jar), "-charset", "UTF-8", "-pipe", `-t${kind}`], { input: Buffer.from(source), timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(value.status, 0, `${value.error ?? ""}${value.stderr}`);
    return value.stdout;
  };
  let latestSource = "";
  const reviewed = await reviewRenderedArtifact({ record, model: table, mutable: true, basis: { stage: "design" },
    providerSettings: { apiBaseUrl: "https://example.test", apiKey: "test", model: "selected-model" },
    llmTransport: { async *streamChatCompletion(input) {
      const prompt = input.messages.at(-1)!.content;
      if (typeof prompt === "string" && prompt.includes('只返回 {"model"')) yield JSON.stringify({ model: candidate });
      else {
        if (Array.isArray(prompt)) {
          const image = prompt.find((part) => part.type === "image_url"); assert.ok(image && image.type === "image_url");
          const png = Buffer.from(image.image_url.url.split(",")[1]!, "base64"); assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
          assert.ok(JSON.stringify(prompt).includes("items.fk_order"));
        }
        yield '{"passed":true,"issues":[],"findings":[]}';
      }
    } },
    renderClient: async (artifact) => { latestSource = artifact.source; const svg = compile(artifact.source, "svg").toString("utf8"); assert.match(svg, /<svg/); return { svg, renderMeta: { engine: "PlantUML", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 1 } }; },
    pngRenderClient: async (artifact) => { assert.equal(artifact.source, latestSource); return { png: compile(artifact.source, "png"), renderMeta: { engine: "PlantUML", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 1 } }; },
  });
  assert.equal(reviewed.review.status, "passed"); assert.equal(reviewed.review.repairAttempts, 1); assert.equal(reviewed.review.attempts, 1);
  assert.equal(reviewed.model.diagramKind, "table");
  assert.ok(reviewed.review.inputFingerprint);
});
