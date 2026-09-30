// Coordinates requirement/model and image/model checks with one per-model repair budget.
import { z } from "zod";
import { classifyDiagramReviewIssue, isUnverifiableReviewText, diagramReviewFindingSchema, diagramVisualReviewSchema, stageProgressRunEventSchema, validateModelInput, type DiagramVisualReview, type ProviderSettings } from "@uml-platform/contracts";
import { JSON_ONLY_SYSTEM_PROMPT } from "@uml-platform/prompts";
import type { ChatMessage, LlmTransport } from "../../../llm.js";
import type { PngRenderClient } from "../../../adapters/render/png-render-client.js";
import type { RenderClient } from "../../../adapters/render/render-client.js";
import { generateDesignPlantUmlArtifacts, generatePlantUmlArtifacts } from "../../../plantuml.js";
import { parseJson } from "../../../normalizers/json/parse-json.js";
import { acceptRepairCandidate, deriveAuthorizedRepairs, filterDiagramReviewIssues, reviewFingerprint, verifyReviewClaims, type DiagramReviewBasis, type ReviewModel } from "../../../normalizers/diagrams/diagram-review.js";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";
import { readDiagramReviewCounters } from "../../records/diagram-review-record.js";
import { isRunCancelled, isRunCancelledError, RunCancelledError, throwIfRunCancelled } from "../../records/run-cancellation.js";
import { collectStructuredResult } from "../shared/structured-output.js";
import { createRunLlmChunkHandlers } from "../shared/llm-chunk-events.js";
import { createCallActivity } from "../shared/call-activity.js";
import { stageProgressValue } from "../shared/pipeline-events.js";
import { withModelTaskTimeout } from "../shared/model-task-timeout.js";
import { renderArtifactWithRepair } from "./render-artifact-with-repair.js";

type Rendered = Extract<Awaited<ReturnType<typeof renderArtifactWithRepair>>, { status: "success" }>;
const judgmentSchema = z.object({ passed: z.boolean(), issues: z.array(z.string()).default([]), findings: z.array(diagramReviewFindingSchema).default([]) });
const findingInstructions = '返回 JSON {"passed":boolean,"issues":string[],"findings":[{"id":string,"layer":"model"或"image","code":string,"modelId":string,"elementId"?:string,"relationshipId"?:string,"path"?:string,"expected"?:任意值,"actual"?:任意值,"evidence":[{"source":string,"reference":string,"detail":string}],"observation":string,"verification":"unverified","repairable":false}]}。未知图形可无元素 ID，但必须描述观察到的标签或位置。';
const categoryInstructions = '每个 finding 填写 category：model_structure（模型结构）、business_constraint（业务约束）、render_mismatch（图形与模型不一致）、check_execution（检查未完成或异常）、other（其他待分类）。只检查结构和业务内容；不检查或报告位置、间距、交叉、绕线、绕行、遮挡、字体大小及可读性建议。无法辨认输入中的结构时，仅报告对应元素或关系无法核实，不推断缺失，也不提出布局修改。';
function unsupportedImage(error: unknown) { return /image.*(?:not supported|unsupported)|(?:not supported|unsupported).*image|does not support.*vision|不支持.*(?:图片|图像|视觉)/i.test(String(error)); }
export class DiagramReviewRenderError extends Error {
  constructor(message: string, public readonly review: DiagramVisualReview) { super(message); this.name = "DiagramReviewRenderError"; }
}
export async function reviewRenderedArtifact(input: {
  record: RunRecord; providerSettings: ProviderSettings; llmTransport: LlmTransport; renderClient: RenderClient; pngRenderClient?: PngRenderClient;
  model: ReviewModel; rendered?: Rendered; basis?: DiagramReviewBasis; mutable?: boolean; validateModel?: (model: ReviewModel) => void;
  reconcileTraceability?: (model: ReviewModel) => unknown; timeoutMs?: number;
}): Promise<{ model: ReviewModel; rendered: Rendered; review: DiagramVisualReview; traceability?: unknown }> {
  const { record, providerSettings, llmTransport, pngRenderClient } = input;
  const basis = input.basis ? structuredClone(input.basis) : undefined;
  let model = structuredClone(input.model), rendered = input.rendered;
  const modelId = model.modelId ?? model.diagramKind;
  const previous = readDiagramReviewCounters(record, modelId);
  let checks = previous.attempts, repairs = previous.repairAttempts, structureChecks = previous.structureAttempts;
  let findings: NonNullable<DiagramVisualReview["findings"]> = [];
  const savedReview = "visualReviews" in record.snapshot ? record.snapshot.visualReviews?.[modelId] : undefined;
  const repairHistory: NonNullable<DiagramVisualReview["repairHistory"]> = previous.repairAttempts ? structuredClone(savedReview?.repairHistory ?? []) : [];
  let issues: string[] = [], stopReason = "";
  let outcome: NonNullable<DiagramVisualReview["checkOutcome"]> = "verified", imageHash: string | undefined;
  const fingerprint = () => reviewFingerprint(basis, model, basis?.traceability, rendered?.artifact.source, imageHash);
  const result = (): DiagramVisualReview => {
    const allIssues = [...new Set([...issues, ...findings.map((finding) => finding.observation)])];
    const pending = allIssues.length > 0 || ["not_completed", "inconclusive", "differences"].includes(outcome);
    return diagramVisualReviewSchema.parse({
      status: pending ? "pending_review" : outcome === "skipped" ? "skipped" : "passed",
      issues: allIssues,
      reason: outcome === "not_completed" ? "检查未完成" : pending ? "检查存在待确认问题" : outcome === "skipped" ? "视觉检查已跳过" : "模型与需求及图面核对通过",
      attempts: checks, repairAttempts: repairs, structureAttempts: structureChecks,
      checkedAt: new Date().toISOString(), findings, repairHistory, checkOutcome: outcome,
      inputFingerprint: fingerprint(), stopReason: stopReason || undefined,
    });
  };
  const progress = (message: string, status: "running" | "repairing" | "completed" | "pending_review") => emitEvent(record, stageProgressRunEventSchema.parse({ type: "stage_progress", stage: "verify_diagram_visual", progress: stageProgressValue("verify_diagram_visual"), diagramKind: model.diagramKind, modelId, subtaskId: modelId, subtaskLabel: model.title, subtaskStatus: status, message }));
  const bounded = <T>(task: (signal: AbortSignal, active: () => void, blank: () => void) => Promise<T>) => withModelTaskTimeout((active, blank, signal) => { throwIfRunCancelled(record); return task(signal, active, blank); }, { label: `${model.title}核对`, idleTimeoutMs: input.timeoutMs ?? 60_000, maxRuntimeMs: input.timeoutMs ?? 180_000, isCancelled: () => isRunCancelled(record), createCancelError: () => new RunCancelledError(record.snapshot.runId) });
  const call = async <T>(operation: "structure_check" | "visual_check" | "model_repair", round: number, messages: ChatMessage[], parse: (raw: string) => T, history?: typeof repairHistory[number]) => {
    const value = await bounded((signal, active, blank) => {
      if (history && readDiagramReviewCounters(record, modelId).repairAttempts >= 2) throw new Error("已达到共享两轮修复上限");
      const handlers = createRunLlmChunkHandlers({ record, stage: "verify_diagram_visual", modelId, subtaskId: modelId, subtaskLabel: model.title, operation, round, onActivity: active, onBlankActivity: blank });
      if (history) { history.callId = handlers.callId; repairs += 1; repairHistory.push(history); }
      if (operation === "visual_check") checks += 1;
      if (operation === "structure_check") structureChecks += 1;
      return collectStructuredResult(llmTransport, providerSettings, messages, "verify_diagram_visual", handlers, parse, { type: "json_object" }, round + 1, signal);
    });
    throwIfRunCancelled(record); return value;
  };
  const cancelOrReport = (error: unknown) => { throwIfRunCancelled(record); if (isRunCancelledError(error)) throw error; };
  const render = async (candidate: ReviewModel): Promise<Rendered> => {
    const artifact = basis?.stage === "design" || (!basis && "designTrace" in record.snapshot) ? generateDesignPlantUmlArtifacts([candidate as Parameters<typeof generateDesignPlantUmlArtifacts>[0][number]])[0]! : generatePlantUmlArtifacts([candidate as Parameters<typeof generatePlantUmlArtifacts>[0][number]], basis?.stage === "feasibility" ? "feasibility" : "requirements")[0]!;
    const value = await bounded((signal) => renderArtifactWithRepair(record, providerSettings, llmTransport, input.renderClient, candidate, artifact, basis?.stage, signal));
    throwIfRunCancelled(record); if (value.status !== "success") throw new Error(value.errorMessage); return value;
  };
  if (basis) for (;;) {
    progress("正在核对模型与已确认需求", "running");
    const authorized = deriveAuthorizedRepairs(model, basis); let reported: typeof findings = [];
    const diagnostics = validateModelInput(model, basis.stage).filter((issue) => issue.severity === "error").map((issue) => ({ id: `${modelId}:${issue.code}:${issue.path}`, layer: "model" as const, code: issue.code, category: classifyDiagramReviewIssue(issue.message, "model", issue.code), modelId, elementId: issue.elementId, path: issue.path, evidence: [{ source: "stage-contract", reference: basis.stage, detail: issue.message }], observation: issue.message, verification: "verified" as const, repairable: false }));
    try {
      const judgment = await call("structure_check", repairs, [{ role: "system", content: JSON_ONLY_SYSTEM_PROMPT }, { role: "user", content: `核对模型对需求的遗漏、无依据元素、引用、关系类型端点归属及业务约束。只提出问题或建议，不改写模型。\n${findingInstructions}\n${categoryInstructions}\n依据：${JSON.stringify(basis)}\n模型：${JSON.stringify(model)}` }], (raw) => judgmentSchema.parse(parseJson(raw)));
      reported = verifyReviewClaims(judgment.findings, model, basis); issues = filterDiagramReviewIssues(judgment.issues);
      if (!judgment.passed && !judgment.issues.length && !judgment.findings.length) issues.push("模型对需求的核对未确认通过");
    } catch (error) { cancelOrReport(error); outcome = "not_completed"; issues = [`结构核对未完成：${String(error)}`]; }
    findings = [...authorized.findings, ...diagnostics, ...reported.filter((item) => !authorized.findings.some((proof) => proof.path === item.path))];
    if (!authorized.changes.length) break;
    if (!input.mutable) { stopReason = "已有人工模型仅提供修改建议"; break; }
    if (repairs >= 2) { stopReason = "已达到共享两轮修复上限"; break; }
    const history: typeof repairHistory[number] = { round: repairs + 1, target: "model", issueIds: authorized.findings.map((item) => item.id), beforeFingerprint: fingerprint(), status: "failed", changes: [], reason: "修复调用未完成" };
    progress(`正在进行第 ${history.round} 轮结构纠错`, "repairing");
    try {
      const candidate = await call("model_repair", history.round, [{ role: "system", content: JSON_ONLY_SYSTEM_PROMPT }, { role: "user", content: `只返回 {"model":完整模型}。严格应用授权改动，其他字段、ID、集合和业务含义不得变化。\n当前模型：${JSON.stringify(model)}\n本模型已核实问题和依据：${JSON.stringify(authorized.findings)}\n允许的目标模型：${JSON.stringify(authorized.expectedModel)}` }], (raw) => (parseJson(raw) as { model: ReviewModel }).model, history);
      const accepted = acceptRepairCandidate(candidate, model, authorized, basis, input.validateModel);
      const acceptedTraceability = input.reconcileTraceability?.(accepted) ?? basis.traceability;
      // Model and render acceptance are atomic; retain the last valid tuple when a candidate fails.
      const acceptedRender = await render(accepted); model = accepted; rendered = acceptedRender; basis.traceability = acceptedTraceability;
      history.status = "accepted"; history.changes = authorized.changes; history.reason = "通过授权范围、契约、语义、引用、追踪校验并渲染成功"; history.afterFingerprint = fingerprint();
      if (deriveAuthorizedRepairs(model, basis).findings.some((item) => authorized.findings.some((old) => old.id === item.id))) { stopReason = "同一问题重复出现，停止修复"; break; }
    } catch (error) { cancelOrReport(error); history.status = /候选|授权|字段|集合/.test(String(error)) ? "rejected" : "failed"; history.reason = String(error); stopReason = history.reason; break; }
  }
  try { rendered ??= await render(model); } catch (error) {
    cancelOrReport(error); stopReason = String(error); outcome = "not_completed"; issues.push(stopReason);
    throw new DiagramReviewRenderError(stopReason, result());
  }
  const missing = (candidate = rendered!) => {
    const svg = candidate.svgArtifact.svg;
    if (!/data-entity=|id=["']elem_/.test(svg)) return [];
    const identifiers = new Set([...svg.matchAll(/(?:data-entity|id)=["']([^"']+)["']/g)].map((match) => match[1]));
    return (candidate.artifact.renderMapping?.elements ?? []).filter((element) => !identifiers.has(element.alias) && !identifiers.has(`elem_${element.alias}`));
  };
  if (missing().length) {
    const proof = missing().map((element) => ({ id: `${modelId}:svg:${element.elementId}`, layer: "render" as const, code: "missing-svg-element", category: "render_mismatch" as const, modelId, elementId: element.elementId, expected: element.alias, actual: null, evidence: [{ source: "svg-entity-id", reference: element.alias, detail: element.statement ?? "模型声明" }], observation: `SVG 缺少模型元素 ${element.label ?? element.elementId}`, verification: "verified" as const, repairable: true }));
    findings.push(...proof);
    if (input.mutable && repairs < 2) {
      const history: typeof repairHistory[number] = { round: repairs + 1, target: "render", issueIds: proof.map((item) => item.id), beforeFingerprint: fingerprint(), status: "failed", changes: [], reason: "统一转换重建" };
      const activity = createCallActivity({ record, stage: "verify_diagram_visual", modelId, subtaskId: modelId, operation: "render_repair", round: history.round }); history.callId = activity.callId;
      throwIfRunCancelled(record); repairs += 1; repairHistory.push(history); activity.onStart();
      try {
        const rebuilt = await render(model);
        if (!/data-entity=|id=["']elem_/.test(rebuilt.svgArtifact.svg)) throw new Error("重建 SVG 无法核实元素标识");
        if (missing(rebuilt).length) throw new Error("绘图器故障：重建后仍缺少可证明的模型元素");
        rendered = rebuilt; history.status = "accepted"; history.changes = ["从模型重新生成 PlantUML 和 SVG"];
        history.reason = "统一转换重建后通过 SVG 元素核对"; history.afterFingerprint = fingerprint();
        activity.onChunk(history.changes[0]!); activity.onComplete();
      }
      catch (error) { cancelOrReport(error); history.reason = String(error); activity.onError(); }
    }
    if (missing().length) { stopReason = "绘图器故障：重建后仍缺少可证明的模型元素"; outcome = "differences"; issues.push(stopReason); throw new DiagramReviewRenderError(stopReason, result()); }
    findings = findings.filter((item) => !proof.some((old) => old.id === item.id));
  }
  progress("正在核对最新图面与结构化模型", "running");
  if (!pngRenderClient) { if (outcome !== "not_completed") outcome = "skipped"; stopReason ||= "当前环境缺少 PNG 渲染能力"; }
  else try {
    const image = await bounded((signal) => pngRenderClient(rendered!.artifact, signal)); throwIfRunCancelled(record); imageHash = reviewFingerprint(image.png.toString("base64"));
    const judged = await call("visual_check", repairs, [{ role: "system", content: JSON_ONLY_SYSTEM_PROMPT }, { role: "user", content: [
      { type: "text", text: `核对图对模型：节点、标签内容、连线、方向、归属和 UML 符号。系统边界、泳道、分支、片段、注释、图例是合法辅助符号，按模型规则核对。不增删业务元素。\n${findingInstructions}\n${categoryInstructions}\n模型 ID：${modelId}\n图类型：${model.diagramKind}\n结构化模型：${JSON.stringify(model)}\nPlantUML 源码：${rendered.artifact.source}\n绘图映射：${JSON.stringify(rendered.artifact.renderMapping)}` },
      { type: "image_url", image_url: { url: `data:image/png;base64,${image.png.toString("base64")}` } },
    ] }], (raw) => judgmentSchema.parse(parseJson(raw)));
    findings.push(...verifyReviewClaims(judged.findings, model, basis)); issues.push(...filterDiagramReviewIssues(judged.issues));
    if (!judged.passed && !judged.issues.length && !judged.findings.length) issues.push("视觉模型未确认图面正确");
    if (outcome !== "not_completed") outcome = findings.some((item) => item.verification === "inconclusive") || issues.some(isUnverifiableReviewText) ? "inconclusive" : issues.length || findings.length ? "differences" : "verified";
  } catch (error) {
    cancelOrReport(error);
    if (unsupportedImage(error)) { if (outcome !== "not_completed") outcome = "skipped"; stopReason ||= "本次模型明确拒绝图片输入"; }
    else { outcome = "not_completed"; issues.push(`视觉检查未完成：${String(error)}`); }
  }
  issues = [...new Set([...issues, ...findings.map((finding) => finding.observation)])];
  if (!stopReason && issues.length) stopReason = "剩余问题缺少唯一确定的修复依据，保留待确认";
  const review = result(); progress(`${review.reason}${issues.length ? `：${issues.join("；")}` : ""}`, review.status === "pending_review" ? "pending_review" : "completed");
  return { model, rendered, review, traceability: basis?.traceability };
}
