// Emits deliberately paced demo-only analysis summaries and text over the normal durable event stream.
import { randomUUID } from "node:crypto";
import type { RunActivityEvent, RunStage } from "@uml-platform/contracts";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";

const diagramNames: Record<string, string> = {
  function: "功能模型", usecase: "用例图", class: "类图", activity: "活动图", deployment: "部署图",
  prototype: "界面模型", analysis: "需求分析模型", architecture: "架构图", sequence: "顺序图", component: "组件图", table: "数据表模型",
};

interface DemoCall { title: string; subtaskId?: string; summary: string; text: string }

function demoCalls(record: RunRecord, stage: RunStage): DemoCall[] {
  const snapshot = record.snapshot;
  const baseSummary = "演示思考摘要：根据固定演示产物展示分析过程，不调用真实模型。\n";
  if (["generate_models", "generate_design_sequence", "generate_design_models"].includes(stage) && "models" in snapshot) {
    const models = snapshot.models.filter((model) => stage === "generate_design_sequence" ? model.diagramKind === "sequence"
      : stage === "generate_design_models" ? model.diagramKind !== "sequence" : true);
    return models.map((model) => {
      const name = diagramNames[model.diagramKind] ?? "模型";
      return { title: `整理${name}`, subtaskId: "modelId" in model && model.modelId ? model.modelId : model.diagramKind,
        summary: `${baseSummary}读取${name}中的元素与关系，核对当前选择的模型范围。`,
        text: `已读取演示${name}。${"summary" in model && typeof model.summary === "string" ? model.summary.slice(0, 240) : "该模型的元素与关系将随结果一起展示。"}\n模型整理完成后，将继续准备图形预览。` };
    });
  }
  if (stage === "render_svg" && "svgArtifacts" in snapshot) {
    return [{ title: "准备图形预览", summary: `${baseSummary}检查固定图形产物数量，整理可展示的预览。`,
      text: `本次演示包含 ${snapshot.plantUml.length} 份图形描述与 ${snapshot.svgArtifacts.length} 个已保存预览。\n已保存的预览会保留对应模型的归属，可在生成结果中查看。` }];
  }
  if (stage === "extract_rules" && "rules" in snapshot && "selectedDiagrams" in snapshot) {
    return [{ title: "整理需求规则", summary: `${baseSummary}先读取需求规则，再按所选模型整理输入范围。`,
      text: `已从演示数据读取 ${snapshot.rules?.length ?? 0} 条需求规则。\n本次选择 ${snapshot.selectedDiagrams.length} 类模型，后续过程将按步骤展开；多个模型会并行显示。` }];
  }
  if ("files" in snapshot) {
    const files = Object.keys(snapshot.files);
    const entries: Partial<Record<RunStage, DemoCall>> = {
      analyze_code_business_logic: { title: "整理业务逻辑", summary: `${baseSummary}读取演示代码的业务逻辑资料，确认原型对应的需求范围。`, text: `已读取演示业务逻辑资料。\n原型入口为 ${snapshot.entryFile}，后续将准备代码规格与 ${files.length} 个文件。` },
      generate_code_spec: { title: "整理代码规格", summary: `${baseSummary}核对固定代码规格与文件清单的对应关系。`, text: `演示代码规格已准备好。\n接下来会读取原型文件，保持入口文件与已有目录结构一致。` },
      generate_code_files: { title: "准备原型文件", summary: `${baseSummary}按固定演示产物中的文件清单准备原型，不发起模型代码生成。`, text: `本次原型包含 ${files.length} 个文件。\n${files.slice(0, 3).join("\n")}\n文件内容可在完成后展开查看。` },
      verify_code_business_assertions: { title: "读取业务检查结果", summary: `${baseSummary}读取演示产物中保存的业务检查报告；这里不重新执行测试。`, text: snapshot.businessAssertionResults ? "已读取演示数据中保存的业务检查报告。\n原型文件和报告将随本次任务结果一起保留。" : "演示数据没有保存业务检查报告，当前仅提供原型文件。" },
    };
    if (entries[stage]) return [entries[stage]!];
  }
  if ("sections" in snapshot) {
    if (stage === "generate_document_text") return [{ title: "整理文档正文（演示）", summary: `${baseSummary}按实际文档章节组织正文，并逐段展示已有内容。`,
      text: snapshot.sections.slice(0, 2).map((section) => `${section.title}\n${section.body.join("\n").slice(0, 240)}`).join("\n\n") || "当前文档没有可展示的正文。" }];
    if (stage === "render_document_file") return [{ title: "准备文档排版（演示）", summary: `${baseSummary}确认章节已准备好，再交给文档导出流程。`, text: `已准备 ${snapshot.sections.length} 个章节。\n接下来排版并写入文档文件，文件生成后会提供下载入口。` }];
  }
  return [];
}

function beatDuration() {
  const raw = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  const parsed = raw?.trim() ? Number(raw) : NaN;
  // The existing setting now controls each demo beat; zero still keeps automated tests instant.
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 700;
}

async function pause(record: RunRecord, duration: number) {
  // Check cancellation during waits so slowing a demo never delays the stop action.
  for (let remaining = duration; remaining > 0; remaining -= 100) {
    throwIfRunCancelled(record);
    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 100)));
  }
  throwIfRunCancelled(record);
}

function chunks(text: string, size: number) {
  const characters = Array.from(text);
  return Array.from({ length: Math.ceil(characters.length / size) }, (_, i) => characters.slice(i * size, (i + 1) * size).join(""));
}

export async function emitOfflineDemoActivity(record: RunRecord, stage: RunStage) {
  throwIfRunCancelled(record);
  const beat = beatDuration();
  // Independent calls start together and retain their own IDs, just like parallel provider calls.
  await Promise.all(demoCalls(record, stage).map(async (call) => {
    const callId = randomUUID();
    const emit = (phase: RunActivityEvent["phase"], text?: string) => {
      throwIfRunCancelled(record);
      emitEvent(record, { type: "run_activity", eventId: randomUUID(), createdAt: new Date().toISOString(),
        runId: record.snapshot.runId, stage, callId, subtaskId: call.subtaskId, subtaskLabel: call.title, format: "text", phase, text });
    };
    emit("started");
    await pause(record, beat);
    emit("thinking");
    await pause(record, beat * 2);
    for (const text of chunks(call.summary, 28)) {
      emit("summary", text);
      await pause(record, beat);
    }
    for (const text of chunks(call.text, Math.max(18, Math.ceil(Array.from(call.text).length / 8)))) {
      emit("output", text);
      await pause(record, beat);
    }
    emit("completed");
  }));
}
