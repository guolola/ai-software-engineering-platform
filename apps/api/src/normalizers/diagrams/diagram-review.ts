// Verifies review claims and derives the exact changes authorized by confirmed facts.
import { createHash } from "node:crypto";
import { classifyDiagramReviewIssue, isExcludedDiagramReviewIssue, isUnverifiableReviewText, deriveTableModel, getModelGraphElements, validateModelInput, type DiagramModelSpec, type DesignDiagramModelSpec, type DiagramReviewFinding, type ModelingStage, type RequirementBaseline } from "@uml-platform/contracts";

export type ReviewModel = DiagramModelSpec | DesignDiagramModelSpec;
export interface DiagramReviewBasis {
  stage: ModelingStage;
  baseline?: RequirementBaseline | null;
  rules?: unknown;
  upstreamModels?: ReviewModel[];
  traceability?: unknown;
  requirementTraceability?: unknown;
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function reviewFingerprint(...inputs: unknown[]) { return createHash("sha256").update(stableJson(inputs)).digest("hex"); }

function at(value: unknown, path: string): unknown { return path.split(".").reduce<unknown>((v, key) => v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined, value); }
function put(value: unknown, path: string, expected: unknown) {
  const parts = path.split("."); const last = parts.pop()!;
  const parent = parts.reduce<unknown>((v, key) => (v as Record<string, unknown>)[key], value) as Record<string, unknown>;
  parent[last] = expected;
}
function comparison(text: string) {
  const normalized = text.replace(/不少于|至少|大于等于/g, ">=").replace(/不超过|至多|最多|小于等于/g, "<=").replace(/超过|大于/g, ">").replace(/少于|小于/g, "<").replace(/[\s，,。；;：:？?（）()]/g, "");
  const matches = [...normalized.matchAll(/(>=|<=|>|<)\s*(\d+(?:\.\d+)?)/g)];
  if (matches.length !== 1) return;
  return { op: matches[0]![1]!, key: normalized.replace(/>=|<=|>|</, "#") };
}
function trustedBinding(trace: unknown, model: ReviewModel, elementId: string, requirementId: string, upstreamTrace?: unknown): boolean {
  if (!Array.isArray(trace)) return false;
  return trace.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const row = entry as Record<string, any>;
    if (row.mappingSource === "auto-filled-pending-review" || row.reviewStatus === "pending" || /相似|similar|候选/i.test(row.rationale ?? "")) return false;
    if (row.source?.elementId === elementId && row.source.diagramKind === model.diagramKind && (!row.source.modelId || row.source.modelId === model.modelId) && Array.isArray(row.targets) && Array.isArray(upstreamTrace)) {
      return row.targets.some((target: Record<string, any>) => upstreamTrace.some((entry) => {
        const binding = entry as Record<string, any>;
        return binding.ruleId === requirementId && binding.mappingSource !== "auto-filled-pending-review" && binding.reviewStatus !== "pending" && !/相似|similar|候选/i.test(binding.rationale ?? "") && binding.target?.elementId === target.elementId && binding.target.diagramKind === target.diagramKind && binding.target.modelId === target.modelId;
      }));
    }
    return (row.ruleId === requirementId || row.requirementId === requirementId) &&
      ((row.target?.elementId === elementId && (!row.target.modelId || row.target.modelId === model.modelId) && row.target.diagramKind === model.diagramKind) || row.targetId === elementId);
  });
}
export interface AuthorizedRepair { expectedModel: ReviewModel; findings: DiagramReviewFinding[]; changes: string[] }
export function deriveAuthorizedRepairs(model: ReviewModel, basis: DiagramReviewBasis): AuthorizedRepair {
  const expectedModel = structuredClone(model); const findings: DiagramReviewFinding[] = []; const changes: string[] = [];
  const modelId = model.modelId ?? model.diagramKind;
  const change = (path: string, expected: unknown, code: string, elementId: string | undefined, reference: string, detail: string) => {
    const actual = at(expectedModel, path);
    if (stableJson(actual) === stableJson(expected)) return;
    const id = `${modelId}:${code}:${elementId ?? path}`;
    findings.push({ id, layer: "model", code, category: classifyDiagramReviewIssue(detail, "model", code), modelId, elementId, path, expected, actual, evidence: [{ source: "confirmed-field-or-derived-rule", reference, detail }], observation: detail, verification: "verified", repairable: true });
    put(expectedModel, path, expected); changes.push(`${elementId ?? modelId} · ${path}: ${stableJson(actual)} → ${stableJson(expected)}`);
  };
  // Constraints are the authoritative input; derived flags/edges cannot authorize changes to constraints.
  if (model.diagramKind === "table" && model.tables.every((table) => table.relationalConstraints?.length) && !validateModelInput(model, basis.stage).some((issue) => issue.severity === "error")) {
    const derived = deriveTableModel(model);
    model.tables.forEach((table, i) => table.columns.forEach((column, j) => {
      for (const field of ["isPrimaryKey", "isForeignKey", "references"] as const) change(`tables.${i}.columns.${j}.${field}`, derived.tables[i]!.columns[j]![field], "constraint-marker", column.id, table.id, "按已校验的主外键约束派生字段标记");
    }));
    change("relationships", derived.relationships, "constraint-relationship", undefined, modelId, "按已校验的外键约束派生关系集合");
  }
  if (model.diagramKind === "architecture") {
    model.relationships.forEach((edge, i) => {
      if (edge.type !== "contains") return;
      const target = model.components.find((item) => item.id === edge.targetId) ?? model.packages.find((item) => item.id === edge.targetId);
      const owner = target && ("packageId" in target ? target.packageId : "parentId" in target ? target.parentId : undefined);
      if (owner && model.packages.some((item) => item.id === owner)) change(`relationships.${i}.sourceId`, owner, "explicit-owner", edge.id, target!.id, "包含关系必须指向模型明确声明的归属");
    });
  }
  // Only exact predicates with accepted source/manual provenance qualify. Opposite polarity may be a valid false branch.
  const facts = basis.baseline?.requirements.filter((requirement) => requirement.status === "accepted" && requirement.condition && requirement.fieldProvenance?.condition?.status === "accepted" && ["source-text", "manual"].includes(requirement.fieldProvenance.condition.source)) ?? [];
  const visit = (value: unknown, path: string, elementId?: string) => {
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>; const id = typeof row.id === "string" ? row.id : elementId;
    for (const [key, item] of Object.entries(row)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (typeof item === "string" && ["condition", "guard"].includes(key) && id) {
        const actual = comparison(item);
        const matches = facts.filter((fact) => {
          const required = comparison(fact.condition!);
          return required && actual && required.key === actual.key && trustedBinding(basis.traceability, model, id, fact.sourceRuleId ?? fact.id, basis.requirementTraceability);
        });
        if (matches.length === 1 && actual) {
          const required = comparison(matches[0]!.condition!)!;
          if ((required.op === ">=" && actual.op === ">") || (required.op === "<=" && actual.op === "<")) {
            change(fieldPath, matches[0]!.condition, "confirmed-comparator", id, matches[0]!.id, "恢复已确认业务条件的边界比较符");
            if (model.diagramKind === "activity" && path.startsWith("relationships.")) {
              const index = Number(path.split(".")[1]); const edge = model.relationships[index]!;
              const siblings = model.relationships.filter((candidate) => candidate.sourceId === edge.sourceId);
              const other = siblings.find((candidate) => candidate.id !== edge.id);
              const otherKey = other?.guard ? "guard" : "condition";
              const otherText = other?.[otherKey]; const complement = otherText && comparison(otherText);
              if (siblings.length === 2 && !/&&|\|\||且|或|\band\b|\bor\b/.test(otherText ?? "") && model.nodes.some((node) => node.id === edge.sourceId && node.type === "decision") && complement && complement.key === actual.key && complement.op === (actual.op === ">" ? "<=" : ">=")) {
                change(`relationships.${model.relationships.indexOf(other!)}.${otherKey}`, otherText!.replace(/<=|>=|不超过|至多|最多|小于等于|不少于|至少|大于等于/, actual.op === ">" ? "<" : ">"), "complementary-branch", other!.id, matches[0]!.id, "保持二分支与已确认边界严格互补");
              }
            }
          }
        }
      } else if (typeof item === "object") visit(item, fieldPath, id);
    }
  };
  visit(model, "");
  return { expectedModel, findings, changes };
}

export function verifyReviewClaims(claims: DiagramReviewFinding[], model: ReviewModel, basis: DiagramReviewBasis | undefined): DiagramReviewFinding[] {
  if (claims.some((claim) => claim.modelId !== (model.modelId ?? model.diagramKind))) throw new Error("检查输出引用了其他模型，无法核实");
  const elements = new Set(getModelGraphElements(model).map((item) => item.id));
  const relationships = new Set(("messages" in model ? model.messages : model.relationships).map((item) => item.id));
  const authorized = basis ? deriveAuthorizedRepairs(model, basis).findings : [];
  return claims.filter((claim) => !isExcludedDiagramReviewIssue(claim.observation)).map((claim) => {
    const proof = authorized.find((item) => item.path === claim.path && stableJson(item.expected) === stableJson(claim.expected));
    if (proof) return { ...proof, id: claim.id };
    const unreadable = isUnverifiableReviewText(`${claim.code} ${claim.observation}`);
    const inferred = classifyDiagramReviewIssue(claim.observation, claim.layer, claim.code);
    // Provider evidence is retained as an observation, never promoted to service authorization.
    return { ...claim, category: inferred === "other" ? claim.category ?? inferred : inferred, verification: unreadable ? "inconclusive" : "unverified", repairable: false, evidence: claim.evidence.map((item) => ({ ...item, source: `provider-observation:${item.source}` })), ...(claim.elementId && !elements.has(claim.elementId) ? { elementId: undefined } : {}), ...(claim.relationshipId && !relationships.has(claim.relationshipId) ? { relationshipId: undefined } : {}) };
  });
}

export function filterDiagramReviewIssues(issues: string[]): string[] {
  return [...new Set(issues.flatMap((issue) => issue.split(/[；;\n]+/)).map((issue) => issue.trim()).filter((issue) => issue && !isExcludedDiagramReviewIssue(issue)))];
}

export function acceptRepairCandidate(candidate: ReviewModel, before: ReviewModel, authorized: AuthorizedRepair, basis: DiagramReviewBasis, validate?: (model: ReviewModel) => void) {
  if (stableJson(candidate) === stableJson(before)) throw new Error("候选没有有效改动");
  if (stableJson(candidate) !== stableJson(authorized.expectedModel)) throw new Error("候选越过授权字段或集合，已拒绝");
  const errors = validateModelInput(candidate, basis.stage).filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  validate?.(candidate);
  return structuredClone(candidate);
}
