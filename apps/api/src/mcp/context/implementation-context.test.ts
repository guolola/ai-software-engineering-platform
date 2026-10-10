// Exercises neutral extraction, dependency scopes, uncertain provenance, and source-only change detection.
import assert from "node:assert/strict";
import test from "node:test";
import {
  snapshotInputFingerprint,
  designInputFingerprint,
} from "@uml-platform/contracts";
import { buildContext, compareManifest } from "./implementation-context.js";
import { contentHash } from "./source-artifacts.js";
const whole = { requirementIds: [], artifactIds: [] };
function fixture() {
  const rule = {
    id: "BORROW",
    category: "业务规则",
    text: "每名学生最多借阅5本；使用 Spring Boot、Vue 和 MySQL",
    relatedDiagrams: ["usecase"],
  };
  const model = {
    diagramKind: "usecase",
    modelId: "borrow",
    title: "借阅",
    summary: "借阅归还",
    notes: [],
    actors: [],
    useCases: [],
    systemBoundaries: [],
    relationships: [],
  };
  const ref = {
    diagramKind: "usecase",
    modelId: "borrow",
    elementId: "borrow",
    elementKind: "usecase",
    label: "借阅",
  };
  const design = {
    diagramKind: "class",
    modelId: "loan",
    title: "借阅实体",
    summary: "借阅设计",
    notes: [],
    classes: [],
    relationships: [],
  };
  const requirementModelTraceability = [
    { ruleId: "BORROW", target: ref, reviewStatus: "confirmed" },
  ];
  const state = {
    requirementText: rule.text,
    rules: [rule],
    models: { borrow: model, duplicate: { ...model, modelId: "other" } },
    plantUml: { borrow: "@startuml\n@enduml" },
    designModels: { loan: design },
    requirementModelTraceability,
    designModelTraceability: [
      {
        source: ref,
        targets: [{ ...ref, diagramKind: "class", modelId: "loan" }],
      },
    ],
    requirementInputFingerprint: "",
    diagramInputFingerprints: { borrow: "" },
    designInputFingerprints: { loan: "" },
    
    
    providerConfig: { apiKey: "secret" },
  };
  state.requirementInputFingerprint = snapshotInputFingerprint({
    requirementText: state.requirementText,
    rules: state.rules,
  });
  state.diagramInputFingerprints.borrow = state.requirementInputFingerprint;
  state.designInputFingerprints.loan = designInputFingerprint(
    Object.values(state.models),
    requirementModelTraceability,
  );
  return state;
}
test("keeps student stacks and strips prototype runtime/provider data with a deterministic content hash", () => {
  const context = buildContext(fixture(), whole);
  const text = JSON.stringify(context);
  assert.match(text, /Spring Boot/);
  assert.match(text, /Vue/);
  assert.match(text, /MySQL/);
  assert.doesNotMatch(
    text,
    /Sandpack|onlyFrontend|privateKey|do-not-return|apiKey/,
  );
  assert.equal(contentHash({ b: 2, a: 1 }), contentHash({ a: 1, b: 2 }));
  assert.equal(
    context.artifacts.find((a) => a.id === "analysis:borrow")?.version
      .freshness,
    "current",
  );
  assert.equal(
    context.artifacts.find((a) => a.id === "analysis:borrow")?.reviewStatus,
    "unknown",
  );
  assert.equal(
    context.artifacts.find((a) => a.id === "analysis:duplicate")?.version
      .freshness,
    "unknown",
  );
  for (const stack of ["React", "Java", "Python FastAPI"]) {
    const state = fixture();
    state.requirementText = `用户明确要求 ${stack}`;
    assert.match(JSON.stringify(buildContext(state, whole)), new RegExp(stack));
  }
});
test("document data in saved workspaces cannot enter or invalidate MCP sources", () => {
  const state = fixture();
  const initial = buildContext(state, whole);
  const withDocuments = buildContext({
    ...state,
    documents: [{ id: "private-doc", title: "private-document-title", paragraphs: ["private-document-body"] }],
    documentLibrary: { version: 2, readStatus: "unavailable" },
  }, whole);
  assert.deepEqual(withDocuments, initial);
  assert.doesNotMatch(JSON.stringify(withDocuments), /document:|private-document/);
});

test("functional scopes follow model identities through analysis and design, not diagram kind alone", () => {
  const context = buildContext(fixture(), {
    requirementIds: ["BORROW"],
    artifactIds: [],
  });
  assert.ok(context.artifacts.some((a) => a.id === "design:loan"));
  assert.ok(!context.artifacts.some((a) => a.id === "analysis:duplicate"));
  assert.ok(context.issues.some((issue) => issue.includes("缺少需求追踪")));
  const artifactScope = buildContext(fixture(), {
    requirementIds: [],
    artifactIds: ["design:loan"],
  });
  assert.ok(artifactScope.artifacts.some((a) => a.id === "rule:BORROW"));
});
test("UI changes do not invalidate context; upstream changes stale models and deletion remains visible", () => {
  const state = fixture();
  const before = buildContext(state, whole);
  assert.equal(
    buildContext(
      {
        ...state,
        activeTab: "code",
        progress: 0.5,
        svgArtifacts: { random: "svg" },
      },
      whole,
    ).version,
    before.version,
  );
  state.rules[0].text = "每名学生最多借阅8本";
  const after = buildContext(state, whole);
  assert.equal(
    after.artifacts.find((a) => a.id === "analysis:borrow")?.version.freshness,
    "stale",
  );
  assert.equal(
    after.artifacts.find((a) => a.id === "design:loan")?.version.freshness,
    "stale",
  );
  assert.ok(
    compareManifest(before.manifest, after.manifest).some(
      (change) =>
        change.artifactId === "rule:BORROW" && change.change === "modified",
    ),
  );
  assert.ok(
    compareManifest(before.manifest, buildContext({}, whole).manifest).every(
      (change) => change.change === "deleted",
    ),
  );
});
test("saved review dictionaries and user implementation constraints retain their provenance", () => {
  const state = {
    ...fixture(),
    autoGeneratedUpstreamReviews: {
      generated: {
        artifactId: "borrow",
        artifactType: "requirement-model",
        status: "pending",
      },
    },
    feasibilityInputs: {
      targetEnvironment: "Python FastAPI + PostgreSQL",
      teamSkills: "Python",
      school: "private-school",
    },
  };
  const context = buildContext(state, whole);
  assert.equal(
    context.artifacts.find((a) => a.id === "analysis:borrow")?.reviewStatus,
    "pending",
  );
  assert.match(JSON.stringify(context), /Python FastAPI/);
  assert.doesNotMatch(JSON.stringify(context), /private-school/);
});
test("dirty source, invalid models and absent fingerprints stay explicitly uncertain without mutation", () => {
  const state = {
    ...fixture(),
    manualModelEditStatus: { borrow: { status: "dirty" } },
    models: { borrow: { diagramKind: "usecase", title: "incomplete" } },
  };
  const snapshot = structuredClone(state);
  const context = buildContext(state, whole);
  assert.equal(
    context.artifacts.find((a) => a.id === "analysis:borrow")
      ?.sourceConsistency,
    "conflict",
  );
  assert.ok(
    context.artifacts
      .find((a) => a.id === "analysis:borrow")
      ?.issues.some((issue) => issue.includes("结构化模型缺失")),
  );
  assert.deepEqual(state, snapshot);
  assert.ok(buildContext({}, whole).issues.length);
});
test("cycles terminate and same-kind models without IDs preserve candidate dependencies", () => {
  const state = fixture();
  state.designModels = {
    loan: state.designModels.loan,
    second: { ...state.designModels.loan, modelId: "second" },
  } as typeof state.designModels;
  const ref = (id: string) => ({
    diagramKind: "class",
    modelId: id,
    elementId: id,
    elementKind: "class",
    label: id,
  });
  state.designModelTraceability = [
    {
      source: {
        diagramKind: "usecase",
        elementId: "borrow",
        elementKind: "usecase",
        label: "borrow",
      },
      targets: [ref("loan")],
      upstreamDesignRefs: [ref("second")],
    },
    {
      source: {
        diagramKind: "usecase",
        elementId: "borrow",
        elementKind: "usecase",
        label: "borrow",
      },
      targets: [ref("second")],
      upstreamDesignRefs: [ref("loan")],
    },
  ] as typeof state.designModelTraceability;
  const context = buildContext(state, {
    requirementIds: [],
    artifactIds: ["design:loan"],
  });
  assert.ok(context.artifacts.some((a) => a.id === "design:second"));
  assert.ok(context.artifacts.some((a) => a.id === "analysis:duplicate"));
});
test("embedded domain requirement IDs and separately saved quality reports remain visible", () => {
  const state = {
    ...fixture(),
    designModels: {
      architecture: {
        diagramKind: "architecture",
        title: "Architecture",
        summary: "Modules",
        notes: [],
        packages: [],
        components: [
          { id: "loan", name: "Loan", sourceRequirementIds: ["BORROW"] },
        ],
        relationships: [],
      },
    },
    requirementQualityReport: {
      runId: "saved-run",
      status: "pending-review",
      summary: "需要确认借阅次数",
      issues: [],
      blockingIssueIds: [],
      reviewRequiredRequirementIds: ["BORROW"],
    },
  };
  const context = buildContext(state, {
    requirementIds: ["BORROW"],
    artifactIds: [],
  });
  assert.ok(context.artifacts.some((a) => a.id === "design:architecture"));
  assert.match(JSON.stringify(context), /需要确认借阅次数/);
});
