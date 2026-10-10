// Builds source-backed coding tasks and explicit readiness issues without inventing acceptance checks or code locations.
import {
  atomicRequirementSchema,
  requirementRuleSchema,
  diagramModelSpecSchema,
  designDiagramModelSpecSchema,
  getModelGraphElements,
  modelElementRefSchema,
  type AnyDiagramModel,
  type McpImplementationTask,
  type McpScope,
  type ModelElementRef,
} from "@uml-platform/contracts";
import { contentHash, record, type SourceArtifact } from "./source-artifacts.js";

type TaskIssue = McpImplementationTask["issues"][number];
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => list(value).filter((item): item is string => typeof item === "string");
const unique = (values: string[]) => [...new Set(values)].sort();
const globalSource = (artifact: SourceArtifact) =>
  ["requirements:source", "requirements:review", "feasibility:inputs", "feasibility:implementation"].includes(artifact.id);

const commonGuidance = [
  "先读取 sourceArtifactIds 的完整产物，核对原始需求和模型；学生明确技术要求与目标仓库既有约束优先，模型技术建议不能自动替代它们。",
  "先登记预计修改的模块和文件，编码后另行登记实际代码文件、类或函数及测试；预计位置不代表已实现，候选设计元素不要求逐个生成代码。",
  "designRefs 只列真实模型节点作为候选位置；完整关系边、时序消息、条件、约束及列定义仍须从来源产物读取，不能忽略。",
  "根据来源中的验收条件编写正常、边界、异常及权限测试；测试场景是参考，不能把规则正文或生成代码本身当作已确认验收条件。",
  "blocking 问题阻止将本任务标为验证通过；可先计划或实现明确部分，补齐或更新受影响依据后重新验证。缺少某类图不阻止实现已有明确要求。",
  "当前只核对来源状态和引用，不代表已验证模型语义、代码行为或设计一致性。来源版本或实际代码变化后，原验证结果必须失效并复验。",
];
const diagramGuidance: Record<string, string> = {
  context: "上下文模型确定系统边界、外部参与方和集成职责。",
  function: "功能结构模型用于核对功能范围；功能分解关系不等于任务执行依赖。",
  usecase: "用例模型用于落实参与者权限、功能入口、业务流程及异常分支。",
  activity: "活动模型用于落实控制流程、条件分支、对象传递及终止行为。",
  analysis: "分析交互模型用于理解业务职责与协作；消息及片段约束需完整读取。",
  class: "类模型用于核对实体、接口、职责、操作及约束；分析类不直接等同于实现类。",
  architecture: "架构模型用于确定模块边界、组件职责和依赖。",
  component: "组件模型用于确定接口契约、组件职责及集成关系。",
  sequence: "时序模型用于落实调用顺序、输入输出、条件分支和异常处理。",
  table: "数据库模型用于落实表、列、主外键、唯一性及其他数据约束。",
  navigation: "导航模型用于落实页面、入口、模块与导航权限。",
  prototype: "界面模型用于理解交互入口，不继承平台原型运行环境或仅前端限制。",
  deployment: "部署模型用于核对部署单元、运行环境、外部服务和通信约束。",
};

function parsedModel(artifact: SourceArtifact): AnyDiagramModel | null {
  if (artifact.stage !== "analysis" && artifact.stage !== "design") return null;
  const parsed = (artifact.stage === "analysis" ? diagramModelSpecSchema : designDiagramModelSpecSchema).safeParse(artifact.payload.model);
  return parsed.success ? parsed.data : null;
}

function modelMatches(artifact: SourceArtifact, model: AnyDiagramModel, ref: ModelElementRef) {
  return model.diagramKind === ref.diagramKind &&
    (!ref.modelId || model.modelId === ref.modelId || artifact.id === `${artifact.stage}:${ref.modelId}`);
}

// Trace contracts also support edges, messages and table-scoped columns, beyond graph-node candidates.
function traceElementIds(model: AnyDiagramModel) {
  const ids = new Set(getModelGraphElements(model).map((element) => element.id));
  const raw = record(model);
  for (const key of ["relationships", "messages", "fragments", "activations", "systemBoundaries", "swimlanes"])
    for (const entry of list(raw[key])) {
      const id = record(entry).id;
      if (typeof id === "string") ids.add(id);
    }
  if (model.diagramKind === "table")
    for (const table of model.tables)
      for (const column of table.columns) ids.add(`${table.id}.${column.id}`);
  return ids;
}

function sourceIssues(artifact: SourceArtifact): TaskIssue[] {
  const issues: TaskIssue[] = [];
  const add = (code: string, severity: TaskIssue["severity"], message: string) => issues.push({ code, severity, message: `${artifact.id}：${message}` });
  if (["conflict", "rejected"].includes(artifact.reviewStatus))
    add("source-review-blocked", "blocking", "来源存在冲突或已被拒绝，请更新相关依据后再验证。");
  else if (artifact.reviewStatus !== "accepted" && !["requirements:source", "requirements:review", "feasibility:inputs"].includes(artifact.id))
    add("source-review-pending", "warning", "来源尚未确认；请核对其适用范围和未决内容。");
  if (artifact.sourceConsistency === "conflict")
    add("source-inconsistent", "blocking", "结构化模型与图源码可能冲突，须确认并同步依据。");
  if (artifact.version.freshness === "stale")
    add("source-stale", "blocking", "来源已过期，须更新受影响设计并重新验证。");
  else if (artifact.version.freshness === "unknown" && !["requirements:source", "requirements:review", "feasibility:inputs"].includes(artifact.id))
    add("source-freshness-unknown", "warning", "尚无可核对的输入版本，不能声称来源已验证为最新。");
  for (const message of artifact.issues) add("source-note", "warning", message);
  return issues;
}

function qualityIssues(artifact: SourceArtifact, requirementIds: Set<string>): TaskIssue[] {
  if (artifact.id !== "requirements:review") return [];
  const issues: TaskIssue[] = [];
  const add = (code: string, severity: TaskIssue["severity"], message: string) => issues.push({ code, severity, message });
  const report = record(artifact.payload.qualityReport);
  const blockers = new Set(strings(report.blockingIssueIds));
  const reportedIssues = list(report.issues).map(record);
  const applies = (id: unknown) => typeof id !== "string" || requirementIds.has(id);
  for (const issue of reportedIssues) {
    if (!applies(issue.requirementId)) continue;
    const blocking = issue.blocksDownstream === true || blockers.has(String(issue.id));
    add(`requirement-quality-${String(issue.code ?? "issue")}`, blocking ? "blocking" : "warning", `需求质量问题 ${String(issue.id)}：${String(issue.message)}`);
  }
  for (const id of blockers)
    if (!reportedIssues.some((issue) => issue.id === id))
      add("requirement-quality-unresolved", "blocking", `质量报告阻断项 ${id} 缺少详情，无法确认影响范围。`);
  if (report.status === "blocked" && !blockers.size && !reportedIssues.some((issue) => issue.blocksDownstream === true))
    add("requirement-quality-blocked", "blocking", `需求质量报告已阻断，但未提供具体阻断项：${String(report.summary ?? "请检查报告")}`);
  if (strings(report.reviewRequiredRequirementIds).some((id) => requirementIds.has(id)))
    add("requirement-review-required", "warning", "质量报告要求人工确认本任务关联需求。");
  for (const conflict of list(artifact.payload.conflicts).map(record))
    if (conflict.status !== "resolved" && strings(conflict.requirementIds).some((id) => requirementIds.has(id)))
      add("requirement-conflict", "blocking", `未解决的需求冲突 ${String(conflict.id)}：${String(conflict.description)}`);
  for (const assumption of list(artifact.payload.assumptions).map(record))
    if (assumption.status !== "accepted" && applies(assumption.requirementId))
      add("requirement-assumption-unconfirmed", "warning", `假设 ${String(assumption.id)} 尚未接受，不能作为已确认要求：${String(assumption.text)}`);
  return issues;
}

export function buildImplementationTasks(input: SourceArtifact[], scope?: McpScope): McpImplementationTask[] {
  const artifacts = input.filter((artifact) => artifact.stage !== "implementation");
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const models = new Map(artifacts.flatMap((artifact) => {
    const model = parsedModel(artifact);
    return model ? [[artifact.id, model] as const] : [];
  }));
  const atomic = artifacts.flatMap((artifact) => {
    const parsed = atomicRequirementSchema.safeParse(artifact.payload.requirement);
    return artifact.stage === "requirements" && parsed.success ? [{ artifact, requirement: parsed.data }] : [];
  });
  const linkedRuleIds = new Set(atomic.flatMap(({ requirement }) => requirement.sourceRuleId ? [requirement.sourceRuleId] : []));
  const seeds = [
    ...atomic.map(({ artifact, requirement }) => ({ artifact, title: requirement.sourceFragment, criteria: requirement.acceptanceCriteria })),
    ...artifacts.flatMap((artifact) => {
      const parsed = requirementRuleSchema.safeParse(artifact.payload.rule);
      return artifact.stage === "requirements" && parsed.success && !linkedRuleIds.has(parsed.data.id)
        ? [{ artifact, title: parsed.data.text, criteria: [] as string[] }] : [];
    }),
  ];
  if (!seeds.length) {
    const original = byId.get("requirements:source");
    if (original && typeof original.payload.text === "string" && original.payload.text.trim())
      seeds.push({ artifact: original, title: "根据原始需求建立实现清单", criteria: [] });
  }

  const tasks = seeds.map(({ artifact: seed, title, criteria }): McpImplementationTask => {
    const requirementIds = new Set(seed.requirementIds);
    const selected = new Set(artifacts.filter((artifact) =>
      artifact.id === seed.id || globalSource(artifact) ||
      (artifact.requirementIds.some((id) => requirementIds.has(id)) &&
        (artifact.stage !== "requirements" || Boolean(artifact.payload.rule))),
    ).map((artifact) => artifact.id));
    const issues: TaskIssue[] = [];
    // Follow only existing source dependencies. Missing dependencies become issues, never invented references.
    const visit = (id: string) => {
      const artifact = byId.get(id);
      if (!artifact) return;
      for (const dependency of artifact.dependencies) {
        if (!byId.has(dependency)) {
          issues.push({ code: "source-dependency-missing", severity: "blocking", message: `${artifact.id} 引用的来源 ${dependency} 已缺失。` });
        } else if (!selected.has(dependency)) {
          selected.add(dependency);
          visit(dependency);
        }
      }
    };
    for (const id of [...selected]) visit(id);
    const sources = artifacts.filter((artifact) => selected.has(artifact.id));
    for (const source of sources) issues.push(...sourceIssues(source), ...qualityIssues(source, requirementIds));

    const validateRef = (value: unknown, stage: "analysis" | "design", owner: string) => {
      const parsed = modelElementRefSchema.safeParse(value);
      if (!parsed.success) {
        issues.push({ code: "trace-reference-invalid", severity: "blocking", message: `${owner} 的追踪引用不符合模型元素契约。` });
        return;
      }
      const ref = parsed.data;
      const candidates = artifacts.filter((artifact) => {
        const model = models.get(artifact.id);
        return artifact.stage === stage && model && modelMatches(artifact, model, ref);
      });
      if (!candidates.some((artifact) => traceElementIds(models.get(artifact.id)!).has(ref.elementId)))
        issues.push({ code: "trace-reference-missing", severity: "blocking", message: `${owner} 的追踪目标 ${ref.modelId ?? ref.diagramKind}/${ref.elementId} 不存在或无法核对，须修复映射。` });
      else if (!ref.modelId && candidates.length > 1)
        issues.push({ code: "trace-model-ambiguous", severity: "warning", message: `${owner} 的 ${ref.diagramKind}/${ref.elementId} 未指定模型标识，存在多个同类型模型候选。` });
    };
    for (const source of sources.filter((artifact) => artifact.stage === "analysis" || artifact.stage === "design")) {
      for (const trace of list(source.payload.traceability).map(record)) {
        if (trace.reviewStatus !== "confirmed") issues.push({ code: "trace-review-pending", severity: "warning", message: `${source.id} 的追踪尚未确认，请核对关联职责。` });
        if (source.stage === "analysis" && trace.target) validateRef(trace.target, "analysis", source.id);
        if (source.stage === "design" && trace.source) {
          validateRef(trace.source, "analysis", source.id);
          for (const ref of list(trace.upstreamDesignRefs)) validateRef(ref, "design", source.id);
          const model = models.get(source.id);
          // A trace may name sibling design targets outside this functional scope; inspect its local target only.
          for (const value of list(trace.targets)) {
            const ref = modelElementRefSchema.safeParse(value);
            if (!ref.success || !model || modelMatches(source, model, ref.data)) validateRef(value, "design", source.id);
          }
        }
      }
    }

    const acceptanceCriteria = unique(criteria.map((text) => text.trim()).filter(Boolean)).map((text) => ({
      id: `${seed.id}:acceptance:${contentHash(text).slice(7, 23)}`,
      text,
      sourceArtifactId: seed.id,
    }));
    if (!acceptanceCriteria.length) issues.push({ code: "acceptance-criteria-missing", severity: "blocking", message: "尚无结构化验收条件；可先计划或实现明确部分，但必须补齐并确认验收条件后才能标为验证通过。" });
    const acceptanceProvenance = record(record(record(seed.payload.requirement).fieldProvenance).acceptanceCriteria);
    if (acceptanceProvenance.status && acceptanceProvenance.status !== "accepted")
      issues.push({ code: "acceptance-criteria-unconfirmed", severity: acceptanceProvenance.status === "rejected" ? "blocking" : "warning", message: "验收条件的字段来源尚未接受，须核对后再作为验收依据。" });
    const designRefs = sources.filter((artifact) => artifact.stage === "design").flatMap((artifact) => {
      const model = models.get(artifact.id);
      if (!model) return [];
      const elements = getModelGraphElements(model);
      if (new Set(elements.map((element) => element.id)).size !== elements.length)
        issues.push({ code: "design-element-ambiguous", severity: "blocking", message: `${artifact.id} 存在重复元素标识，须修复后才能建立唯一代码映射。` });
      return [...new Map(elements.map((element) => [`${element.kind}:${element.id}`, element])).values()].map((element) => ({
        artifactId: artifact.id,
        ...(model.modelId ? { modelId: model.modelId } : {}),
        diagramKind: model.diagramKind,
        elementId: element.id,
        elementKind: element.kind,
        label: element.name,
      }));
    });
    if (!designRefs.length) issues.push({ code: "design-mapping-missing", severity: "warning", message: "暂无可核对的设计元素映射；请基于明确需求和已有仓库确定实现位置，并记录设计缺口。" });
    return {
      id: `implement:${seed.id}`,
      title: title.slice(0, 160),
      requirementIds: unique([...requirementIds]),
      sourceArtifactIds: unique(sources.map((artifact) => artifact.id)),
      designRefs,
      acceptanceCriteria,
      // Artifact dependency edges express provenance, not a reliable feature execution order.
      dependsOnTaskIds: [],
      issues: [...new Map(issues.map((issue) => [JSON.stringify(issue), issue])).values()],
      guidance: [...commonGuidance, ...unique(sources.flatMap((artifact) => {
        const model = models.get(artifact.id);
        return model && diagramGuidance[model.diagramKind] ? [diagramGuidance[model.diagramKind]] : [];
      }))],
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const requestedRequirements = new Set(scope?.requirementIds ?? []);
  const requestedArtifacts = new Set((scope?.artifactIds ?? []).filter((id) => !id.startsWith("implementation:")));
  if (!requestedRequirements.size && !requestedArtifacts.size) return tasks;
  // Source closure supplies context, not authorization to implement additional requirements.
  return tasks.filter((task) =>
    task.requirementIds.some((id) => requestedRequirements.has(id)) ||
    task.sourceArtifactIds.some((id) => requestedArtifacts.has(id)),
  );
}
