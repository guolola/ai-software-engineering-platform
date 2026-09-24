// Reviews a compiled UML image against its structured model and repairs only diagram source.
import { z } from "zod";
import {
  diagramVisualReviewSchema,
  stageProgressRunEventSchema,
  type DesignDiagramModelSpec,
  type DiagramModelSpec,
  type DiagramVisualReview,
  type ProviderSettings,
} from "@uml-platform/contracts";
import { JSON_ONLY_SYSTEM_PROMPT, buildRepairPlantUmlPrompt } from "@uml-platform/prompts";
import type { ChatMessage, LlmTransport } from "../../../llm.js";
import type { PngRenderClient } from "../../../adapters/render/png-render-client.js";
import type { RenderClient } from "../../../adapters/render/render-client.js";
import { parseJson } from "../../../normalizers/json/parse-json.js";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";
import { collectTextResult } from "../shared/structured-output.js";
import { stageProgressValue } from "../shared/pipeline-events.js";
import { renderArtifactWithRepair } from "./render-artifact-with-repair.js";

type Rendered = Extract<Awaited<ReturnType<typeof renderArtifactWithRepair>>, { status: "success" }>;
const judgmentSchema = z.object({ passed: z.boolean(), issues: z.array(z.string()) });
const sourceSchema = z.object({ source: z.string().min(1) });
const MAX_VISUAL_REPAIRS = 2;

function unsupportedImage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /image.*(?:not supported|unsupported)|(?:not supported|unsupported).*image|does not support.*vision|不支持.*(?:图片|图像|视觉)/i.test(message);
}

function progress(record: RunRecord, rendered: Rendered, message: string, status: "running" | "repairing" | "completed" | "pending_review", label: string) {
  emitEvent(record, stageProgressRunEventSchema.parse({
    type: "stage_progress",
    stage: "verify_diagram_visual",
    progress: stageProgressValue("verify_diagram_visual"),
    diagramKind: rendered.artifact.diagramKind,
    modelId: rendered.artifact.modelId,
    subtaskId: rendered.artifact.modelId ?? rendered.artifact.diagramKind,
    subtaskLabel: label,
    subtaskStatus: status,
    message,
  }));
}

function result(status: DiagramVisualReview["status"], issues: string[], reason: string, attempts: number) {
  return diagramVisualReviewSchema.parse({ status, issues, reason, attempts, checkedAt: new Date().toISOString() });
}

export async function reviewRenderedArtifact(input: {
  record: RunRecord;
  providerSettings: ProviderSettings;
  llmTransport: LlmTransport;
  renderClient: RenderClient;
  pngRenderClient?: PngRenderClient;
  model: DiagramModelSpec | DesignDiagramModelSpec;
  rendered: Rendered;
}): Promise<{ rendered: Rendered; review: DiagramVisualReview }> {
  const { record, providerSettings, llmTransport, renderClient, pngRenderClient, model } = input;
  let rendered = input.rendered;
  progress(record, rendered, "正在检查图面与结构化模型是否一致", "running", model.title);
  if (!pngRenderClient) {
    const review = result("skipped", [], "当前运行环境无法生成检查所需的 PNG，已跳过视觉检查", 0);
    progress(record, rendered, review.reason, "completed", model.title);
    return { rendered, review };
  }

  let issues: string[] = [];
  let checks = 0;
  for (let attempt = 0; attempt <= MAX_VISUAL_REPAIRS; attempt += 1) {
    try {
      const image = await pngRenderClient(rendered.artifact);
      checks += 1;
      const text = [
        "请对照结构化模型检查此 UML 图的可读性、节点、标签、连线和方向。只报告图片中明确可见的图面问题，不补充或修改业务需求。",
        "仅返回 JSON：{\"passed\":boolean,\"issues\":string[]}。",
        `图类型：${rendered.artifact.diagramKind}`,
        `结构化模型：${JSON.stringify(model)}`,
        `PlantUML 源码：${rendered.artifact.source}`,
      ].join("\n");
      const messages: ChatMessage[] = [
        { role: "system", content: JSON_ONLY_SYSTEM_PROMPT },
        { role: "user", content: [
          { type: "text", text },
          { type: "image_url", image_url: { url: `data:image/png;base64,${image.png.toString("base64")}` } },
        ] },
      ];
      const raw = await collectTextResult(llmTransport, providerSettings, messages, () => undefined, { type: "json_object" });
      const judgment = judgmentSchema.parse(parseJson(raw));
      if (judgment.passed && judgment.issues.length === 0) {
        const review = result("passed", [], "图面与结构化模型一致", checks);
        progress(record, rendered, review.reason, "completed", model.title);
        return { rendered, review };
      }
      issues = judgment.issues.length ? judgment.issues : ["视觉模型未确认图面正确"];
      if (attempt === MAX_VISUAL_REPAIRS) break;
      progress(record, rendered, `视觉检查发现问题，正在修复（${attempt + 1}/${MAX_VISUAL_REPAIRS}）`, "repairing", model.title);
      const repairPrompt = `${buildRepairPlantUmlPrompt(rendered.artifact.diagramKind, model, rendered.artifact.source, issues.join("；"))}\n视觉检查问题：${issues.join("；")}\n只修改 PlantUML 源码，不修改结构化模型。`;
      const repairedRaw = await collectTextResult(
        llmTransport,
        providerSettings,
        [{ role: "system", content: JSON_ONLY_SYSTEM_PROMPT }, { role: "user", content: repairPrompt }],
        () => undefined,
        { type: "json_object" },
      );
      const repairedSource = sourceSchema.parse(parseJson(repairedRaw)).source;
      const candidate = await renderArtifactWithRepair(record, providerSettings, llmTransport, renderClient, model, {
        ...rendered.artifact,
        source: repairedSource,
      });
      if (candidate.status !== "success") {
        issues = [...issues, "视觉修复后的图源码无法渲染"];
        break;
      }
      rendered = candidate;
    } catch (error) {
      if (unsupportedImage(error)) {
        const review = result("skipped", [], "本次模型不支持图片输入，已跳过视觉检查", checks);
        progress(record, rendered, review.reason, "completed", model.title);
        return { rendered, review };
      }
      const message = error instanceof Error ? error.message : String(error);
      issues = [...issues, `视觉检查未完成：${message}`];
      break;
    }
  }
  const review = result("pending_review", issues, "视觉检查仍有问题，请人工确认", checks);
  progress(record, rendered, `${review.reason}：${issues.join("；")}`, "pending_review", model.title);
  return { rendered, review };
}
