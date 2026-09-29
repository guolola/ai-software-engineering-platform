// Verifies deterministic design-model coverage before prompts ask an LLM to write files.
import { modelFixture } from "../../../../../../packages/contracts/src/testing/model-fixtures.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { CodeRunSnapshot, DesignDiagramModelSpec } from "@uml-platform/contracts";
import { buildCodeContext } from "./code-context.js";
import {
  buildDesignModelCoverageReport,
  buildDesignToCodeMapping,
} from "./design-to-code-mapping.js";

function sampleDesignModels(): DesignDiagramModelSpec[] {
  return ["architecture", "sequence", "navigation", "class", "component", "deployment", "table"].map((kind) => modelFixture("design", kind) as DesignDiagramModelSpec);
}

test("design-to-code mapping covers every design model kind with concrete targets", () => {
  const mapping = buildDesignToCodeMapping(sampleDesignModels(), "2026-06-26T00:00:00.000Z");
  const kinds = new Set(mapping.items.map((item) => item.diagramKind));
  assert.deepEqual([...kinds].sort(), [
    "architecture",
    "class",
    "component",
    "deployment",
    "navigation",
    "sequence",
    "table",
  ]);
  assert.ok(mapping.items.some((item) => item.targetPath.startsWith("/src/features/")));
  assert.ok(mapping.items.some((item) => item.targetPath.startsWith("/src/components/")));
  assert.ok(mapping.items.some((item) => item.targetPath === "/src/domain/types.ts"));
  assert.ok(mapping.items.some((item) => item.targetPath === "/src/data/mock-data.ts"));

  const report = buildDesignModelCoverageReport({
    designModels: sampleDesignModels(),
    mapping,
    generatedAt: "2026-06-26T00:00:00.000Z",
  });
  assert.equal(report.passed, true);
  assert.equal(report.models.length, 7);
});

test("buildCodeContext keeps design-only facts and expands architecture component and table models", () => {
  const designModels = sampleDesignModels();
  const mapping = buildDesignToCodeMapping(designModels, "2026-06-26T00:00:00.000Z");
  const snapshot = {
    runId: "code-run",
    coverageMatrix: null,
    traceabilityMatrix: null,
    designModels,
    designPlantUml: [],
    spec: null,
    businessLogic: null,
    designToCodeMapping: mapping,
    designModelCoverageReport: buildDesignModelCoverageReport({ designModels, mapping }),
    loadedCodeSkill: null,
    visualDirection: null,
    skillResourceDiscoveryPlan: null,
    skillResourcePreviews: null,
    skillResourcePlan: null,
    codeSkillContext: null,
    appBlueprint: null,
    uiBlueprint: null,
    uiMockup: null,
    uiReferenceSpec: null,
    uiFidelityReport: null,
    designTokens: null,
    componentRegistry: null,
    uiIr: null,
    visualDiffReport: null,
    businessAssertionResults: null,
    repairLoopSummary: null,
    selectedCodeSkills: [],
    skillDiagnostics: [],
    filePlan: null,
    codeImplementationBrief: null,
    codeFileOperationManifest: null,
    fileGenerationDiagnostics: [],
    codeTrace: [],
    codeGenerationMode: "json_schema_operations",
    qualityDiagnostics: [],
    files: {},
    entryFile: "/src/App.tsx",
    dependencies: {},
    agentPlan: [],
    generationMode: "continue",
    changedFileCount: 0,
    diagnostics: [],
    codeContextHash: null,
    currentStage: null,
    status: "running",
    error: null,
  } as CodeRunSnapshot;

  const context = buildCodeContext(snapshot) as Record<string, unknown>;
  assert.equal("requirementText" in context, false);
  assert.equal("rules" in context, false);
  assert.equal("requirementBaseline" in context, false);
  assert.ok(String(context.authority).includes("accepted requirement baseline"));

  const compactModels = context.designModels as Array<Record<string, unknown>>;
  const architecture = compactModels.find((model) => model.diagramKind === "architecture");
  const component = compactModels.find((model) => model.diagramKind === "component");
  const table = compactModels.find((model) => model.diagramKind === "table");
  assert.equal(Array.isArray(architecture?.components), true);
  assert.equal(Array.isArray(component?.interfaces), true);
  assert.equal(Array.isArray(table?.tables), true);
  assert.equal(context.designToCodeMapping, mapping);
});
