// Replays labeled review fixtures through the same durable events used by the generation task drawer.
import { getModelGraphElements, diagramVisualReviewSchema, type DiagramReviewFinding } from "@uml-platform/contracts";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";
import { reviewFingerprint } from "../../normalizers/diagrams/diagram-review.js";
import { emitOfflineDemoCall, type DemoCall } from "./offline-demo-activity.js";
import { offlineReviewImage } from "./fixtures/library-seat-review-images.js";

export async function emitOfflineDemoDiagramReviews(record: RunRecord) {
  const snapshot = record.snapshot;
  if (!("models" in snapshot) || !("visualReviews" in snapshot)) return;
  const stage = "designTrace" in snapshot ? "design" : "requirements";
  // Clear frozen/previous conclusions: this run owns its calls, timestamps and confirmation state.
  snapshot.visualReviews = {};
  await Promise.all(snapshot.models.map(async (model) => {
    const modelId = model.modelId ?? model.diagramKind;
    const image = offlineReviewImage(stage, modelId);
    const elements = getModelGraphElements(model);
    const node = elements.find((item) => item.name);
    const foreignColumn = model.diagramKind === "table" ? model.tables.flatMap((table) => table.columns).find((column) => column.isForeignKey) : undefined;
    const repairModel = Boolean(foreignColumn);
    const repairRender = stage === "requirements" && model.diagramKind === "activity" && node && offlineReviewImage(stage, modelId, true);
    // Keep one representative pending case per stage so the demo also shows successful checks.
    const needsConfirmation = model.diagramKind === "usecase" || modelId === "sequence:uc-submit-reservation";
    let structureAttempts = 0, attempts = 0;
    const history: NonNullable<ReturnType<typeof diagramVisualReviewSchema.parse>["repairHistory"]> = [];
    const pending: DiagramReviewFinding[] = needsConfirmation ? [{
      id: `${modelId}:demo-unreadable-label`, layer: "image", code: "unreadable-label", modelId,
      observation: "演示：部分关系标签不可辨认，无法从图片核实连线归属。",
      evidence: [{ source: "demo-image-observation", reference: modelId, detail: "固定待确认案例；结构与引用校验已通过，图片观察不足以授权增删。" }],
      verification: "inconclusive", repairable: false,
    }] : [];
    const progress = (message: string, status: "running" | "repairing" | "completed" | "pending_review") => emitEvent(record, {
      type: "stage_progress", stage: "verify_diagram_visual", progress: 95, modelId,
      subtaskId: modelId, subtaskLabel: model.title, subtaskStatus: status, message,
    });
    const call = (operation: NonNullable<DemoCall["operation"]>, round: number, text: string, reasoning: string, imageUrl?: string) => {
      if (operation === "structure_check") structureAttempts++;
      if (operation === "visual_check") attempts++;
      return emitOfflineDemoCall(record, "verify_diagram_visual", {
        title: `${model.title}（演示）`, modelId, subtaskId: modelId, operation, round, text: `演示结果：${text}`,
        reasoning: `演示推理片段：${reasoning}`, summary: `演示摘要：${text}`,
        inputImages: imageUrl ? [{ url: imageUrl, caption: `${model.title} · ${round ? "修复后复查" : "图片检查"}（演示）` }] : undefined,
      });
    };
    progress("演示：正在核对模型与已确认需求", "running");
    await call("structure_check", 0, repairModel ? `外键字段 ${foreignColumn!.name} 的标记应由显式外键约束派生。` : "模型元素、端点、类型与需求追踪核对通过。",
      "读取本模型的需求依据和追踪关系；名称相似度与缺失追踪均不能授权增删业务元素。");
    if (repairModel) {
      const before = structuredClone(model);
      if (before.diagramKind === "table") before.tables.flatMap((table) => table.columns).find((column) => column.id === foreignColumn!.id)!.isForeignKey = false;
      progress("演示：正在进行第 1 轮结构纠错", "repairing");
      const callId = await call("model_repair", 1, `恢复 ${foreignColumn!.name} 的 FK 标记；约束、字段 ID 与其他业务内容保持一致。`,
        `显式外键约束唯一确定 ${foreignColumn!.id} 的 FK 标记；候选只改动这个字段，通过契约、引用、追踪及绘图校验。`);
      history.push({ round: 1, target: "model", issueIds: [`${modelId}:demo-fk-marker`], callId,
        beforeFingerprint: reviewFingerprint(before), afterFingerprint: reviewFingerprint(model), status: "accepted",
        changes: [`${foreignColumn!.name} · 外键标记：缺失 → FK`], reason: "演示：受限候选通过校验，已接受并重新渲染" });
      await call("structure_check", 1, "修复后的 FK 标记与主外键约束一致，模型与引用核对通过。", "重新读取接受后的模型，确认字段与派生关系一致。");
    }
    if (repairRender) {
      await call("visual_check", 0, `图形标签“标签待同步（演示）”与模型元素“${node!.name}”不一致。`,
        `将最新图片与绘图映射逐项对照，${node!.id} 的模型名称明确，允许从模型统一重建；位置与绕行不属于修改范围。`, repairRender);
      progress("演示：正在进行第 1 轮图形重建", "repairing");
      const callId = await call("render_repair", 1, `从模型重建图形描述、SVG 和 PNG，恢复标签“${node!.name}”。`, "统一转换重建图形，不由视觉模型自由重写绘图源码。");
      history.push({ round: 1, target: "render", issueIds: [`${modelId}:demo-stale-label`], callId,
        beforeFingerprint: reviewFingerprint(model, repairRender), afterFingerprint: reviewFingerprint(model, image),
        status: "accepted", changes: [`${node!.id} · 标签待同步（演示） → ${node!.name}`], reason: "演示：按模型名称重建后通过映射与图形核对" });
    }
    if (image) {
      progress("演示：正在核对最新图片与结构化模型", "running");
      await call("visual_check", history.length ? 1 : 0, needsConfirmation ? pending[0]!.observation : "节点、标签、关系方向与归属核对通过，合法辅助符号已保留。",
        needsConfirmation ? "标签不可辨认只能记为无法核实，不推断元素缺失，不修改位置，不增删业务元素。" : "使用当前模型对应的最新图片核对；泳道、片段、图例与注释按用途识别，布局交给 PlantUML。", image);
    }
    throwIfRunCancelled(record);
    const review = diagramVisualReviewSchema.parse({
      status: needsConfirmation ? "pending_review" : image ? "passed" : "skipped",
      issues: pending.map((item) => item.observation), findings: pending, repairHistory: history,
      reason: needsConfirmation ? "演示：视觉核对有无法核实的标签，请人工确认" : image ? "演示：模型与需求及图面核对通过" : "演示：当前模型未准备 PNG，已跳过图片检查",
      checkOutcome: needsConfirmation ? "inconclusive" : image ? "verified" : "skipped",
      attempts, structureAttempts, repairAttempts: history.length, checkedAt: new Date().toISOString(),
      inputFingerprint: reviewFingerprint(model, snapshot.plantUml.find((item) => (item.modelId ?? item.diagramKind) === modelId)?.source, image),
      stopReason: needsConfirmation ? "证据不足，保留待确认；未启动修复尝试" : undefined,
    });
    snapshot.visualReviews[modelId] = review;
    progress(review.reason, needsConfirmation ? "pending_review" : "completed");
  }));
}
