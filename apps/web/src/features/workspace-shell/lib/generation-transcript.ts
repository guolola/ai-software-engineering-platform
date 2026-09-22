// Projects ordered run events into user-readable steps, keeping parallel calls and retries separate.
import type { RunEvent, RunStage } from "@uml-platform/contracts";
import { localizeRunFailure } from "../../../shared/i18n/api-errors";
import { formatStageForDiagnostics, sanitizeDiagnosticText } from "../../workspace-session/lib/diagnostics";
import type { GenerationSubtask } from "../../workspace-session/model/session-state";

export type TranscriptStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "pending_review";
export interface TranscriptCall {
  id: string;
  stage?: RunStage;
  subtaskId?: string;
  title: string;
  status: TranscriptStatus;
  startedAt?: string;
  finishedAt?: string;
  output: string;
  summary: string;
  thinking: boolean;
  technical: boolean;
  message?: string;
}
export interface TranscriptStep {
  stage: RunStage;
  title: string;
  messages: string[];
  calls: TranscriptCall[];
  entries?: Array<{ kind: "message"; text: string } | { kind: "call"; id: string }>;
  status: TranscriptStatus;
}

const order: RunStage[] = [
  "extract_rules", "generate_models", "generate_design_sequence", "generate_design_models",
  "generate_plantuml", "render_svg", "analyze_code_business_logic", "analyze_code_product",
  "plan_code_ui", "generate_code_ui_mockup", "analyze_code_ui_mockup", "generate_code_ui_ir",
  "load_web_design_skill", "select_code_skills", "plan_code_files", "generate_code_spec", "plan_code",
  "generate_code_files", "write_code_files", "audit_code_quality", "verify_code_ui_fidelity",
  "verify_code_rendered_preview", "verify_code_business_assertions", "verify_code_preview", "repair_code_files",
  "generate_document_text", "render_document_file", "generate_context", "render_context", "generate_implementation", "generate_tests",
];
const diagrams: Record<string, string> = {
  function: "功能模型", usecase: "用例图", class: "类图", activity: "活动图", deployment: "部署图",
  prototype: "界面模型", analysis: "需求分析模型", architecture: "架构图", sequence: "顺序图", component: "组件图", table: "数据表模型",
};

export function readableTaskText(text: string) {
  return sanitizeDiagnosticText(text)
    .replace(/https?:\/\/[^\s，。；）)]+/g, "服务地址")
    .replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/gi, "处理步骤")
    .replace(/\b[A-Za-z0-9_]{80,}\b/g, "详细信息已省略")
    .replace(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g, "处理信息")
    .replace(/\b(?:usecase|class|activity|deployment|prototype|analysis|architecture|sequence|component)\b/g, (word) => diagrams[word] ?? word);
}

function label(stage: RunStage) {
  const overrides: Partial<Record<RunStage, string>> = {
    generate_code_ui_ir: "整理界面结构", load_web_design_skill: "准备界面设计规范",
    select_code_skills: "选择界面设计规范", generate_plantuml: "生成图形描述",
    render_svg: "生成图形预览", render_document_file: "排版并生成文档",
    verify_code_business_assertions: "检查业务功能", verify_code_ui_fidelity: "检查页面与需求是否一致",
  };
  return overrides[stage] ?? formatStageForDiagnostics(stage);
}

function callTitle(stage: RunStage, subtaskId?: string, subtaskLabel?: string) {
  if (subtaskLabel) return readableTaskText(subtaskLabel);
  const diagram = subtaskId?.split(":")[0];
  return diagram && diagrams[diagram] ? diagrams[diagram] : label(stage);
}

function newCall(id: string, title: string, at?: string, subtaskId?: string): TranscriptCall {
  return { id, title, subtaskId, startedAt: at, status: "running", output: "", summary: "", thinking: false, technical: true };
}

// Surface a real natural-language summary while JSON is arriving, without displaying its wire structure.
export function readableOutput(call: TranscriptCall) {
  if (!call.technical) return call.output;
  if (call.stage === "generate_document_text") {
    const paragraphs: string[] = [];
    // Document body arrays contain prose. Decode only those strings, including the
    // current incomplete string, so JSON scaffolding never enters the conversation.
    for (const match of call.output.matchAll(/"body"\s*:\s*\[/g)) {
      let cursor = match.index! + match[0].length;
      while (cursor < call.output.length) {
        while (/[\s,]/.test(call.output[cursor] ?? "") && cursor < call.output.length) cursor++;
        if (call.output[cursor] !== '"') break;
        const start = ++cursor;
        while (cursor < call.output.length && call.output[cursor] !== '"') {
          cursor += call.output[cursor] === "\\" ? 2 : 1;
        }
        try { paragraphs.push(JSON.parse(`"${call.output.slice(start, Math.min(cursor, call.output.length))}"`)); }
        catch { /* A split escape sequence is rendered when its next chunk arrives. */ }
        cursor++;
      }
    }
    return paragraphs.join("\n\n");
  }
  const match = /"summary"\s*:\s*"((?:\\.|[^"\\])*)/.exec(call.output);
  if (!match) return "";
  try { return readableTaskText(JSON.parse(`"${match[1]}"`) as string); }
  catch { return ""; }
}

export function projectGenerationTranscript(events: RunEvent[], fallbackStatus = "running", subtasks: GenerationSubtask[] = []) {
  const steps = new Map<RunStage, TranscriptStep>();
  const calls = new Map<string, TranscriptCall>();
  const seen = new Set<string>();
  let status = fallbackStatus;
  let finalMessage = "";
  let terminalAt: string | undefined;
  let lastStage: RunStage | undefined;
  let completed: Extract<RunEvent, { type?: "completed" }> | undefined;
  const getStep = (stage: RunStage) => {
    if (!steps.has(stage)) steps.set(stage, { stage, title: label(stage), messages: [], calls: [], entries: [], status: "running" });
    return steps.get(stage)!;
  };
  const getCall = (step: TranscriptStep, id: string, at?: string, subtaskId?: string, subtaskLabel?: string) => {
    if (!calls.has(id)) {
      const call = newCall(id, callTitle(step.stage, subtaskId, subtaskLabel), at, subtaskId);
      call.stage = step.stage;
      calls.set(id, call); step.calls.push(call); step.entries?.push({ kind: "call", id });
    }
    return calls.get(id)!;
  };
  const activityStages = new Set(events.flatMap((event) => event.type === "run_activity" ? [event.stage] : []));
  for (const event of events) {
    if (event.eventId && seen.has(event.eventId)) continue;
    if (event.eventId) seen.add(event.eventId);
    if (completed) break;
    const at = event.createdAt;
    if (event.type === "run_activity") {
      const step = getStep(event.stage);
      const call = getCall(step, event.callId, at, event.subtaskId, event.subtaskLabel);
      call.technical = event.format === "technical";
      if (event.phase === "output") { call.output += event.text ?? ""; call.thinking = false; }
      if (event.phase === "summary") call.summary += event.text ?? "";
      if (event.phase === "thinking") call.thinking = true;
      if (event.phase === "completed" || event.phase === "failed") {
        call.status = event.phase; call.finishedAt = at; call.thinking = false;
      }
      continue;
    }
    if (event.type === "stage_started") {
      lastStage = event.stage;
      getStep(event.stage);
    } else if (event.type === "stage_progress") {
      const step = getStep(event.stage);
      const subtaskId = event.subtaskId ?? event.modelId ?? event.diagramKind;
      const text = event.message ? readableTaskText(event.message) : "";
      if (subtaskId) {
        const call = getCall(step, `${event.stage}:${subtaskId}`, at, subtaskId, event.subtaskLabel);
        call.status = event.subtaskStatus === "repairing" || event.subtaskStatus === "rendering" ? "running" : event.subtaskStatus ?? "running";
        call.message = text;
        if (["completed", "failed", "pending_review"].includes(call.status)) call.finishedAt = at;
      } else if (text && !step.messages.includes(text)) {
        step.messages.push(text);
        step.entries?.push({ kind: "message", text });
      }
    } else if (event.type === "llm_chunk" && !activityStages.has(event.stage)) {
      const call = getCall(getStep(event.stage), `${event.stage}:legacy`, at);
      call.output += event.chunk;
      call.technical = /^[\s]*[\[{`]/.test(call.output);
    } else if (event.type === "artifact_ready") {
      const step = getStep(event.stage);
      const subtaskId = event.subtaskId ?? event.modelId ?? event.diagramKind;
      if (subtaskId) {
        const call = getCall(step, `${event.stage}:${subtaskId}`, at, subtaskId, event.subtaskLabel);
        call.status = event.subtaskStatus === "pending_review" ? "pending_review" : "completed";
        call.finishedAt = at;
      } else {
        const message = `${step.title}已产生结果。`;
        if (!step.messages.includes(message)) { step.messages.push(message); step.entries?.push({ kind: "message", text: message }); }
        const artifactNames: Record<string, string> = {
          rules: "整理需求规则", requirementBaseline: "确认需求基线", businessLogic: "整理业务逻辑",
          document: "生成可下载文档", codeFiles: "保存代码文件", uiMockup: "生成界面设计图",
          uiFidelityReport: "检查页面与需求是否一致", visualDiffReport: "验证页面预览",
          businessAssertionResults: "检查业务功能", codeSkillContext: "整理界面设计参考",
        };
        if (artifactNames[event.artifactKind]) {
          const call = getCall(step, `${event.stage}:artifact:${event.artifactKind}`, undefined);
          call.title = artifactNames[event.artifactKind]; call.status = "completed"; call.finishedAt = at;
          if (event.uiFidelityReport) {
            call.status = event.uiFidelityReport.passed ? "completed" : "failed";
            call.message = readableTaskText(event.uiFidelityReport.summary);
          }
        }
        for (const [index, action] of (event.codeSkillContext?.actionResults ?? []).entries()) {
          const call = getCall(step, `${event.eventId ?? event.stage}:reference:${index}`, action.startedAt);
          call.title = `查询界面设计参考 ${index + 1}`;
          call.status = action.status === "completed" ? "completed" : "failed";
          call.finishedAt = action.completedAt; call.output = action.stdout;
          if (call.status === "failed") call.message = "此项设计参考未能读取。";
        }
      }
    } else if (event.type === "code_file_changed") {
      const step = getStep(lastStage ?? "generate_code_files");
      const call = getCall(step, `file:${event.path}`, at);
      call.title = `写入 ${event.path}`; call.status = "completed"; call.finishedAt = at;
      call.output = event.content; call.message = "文件已更新";
    } else if (event.type === "completed") {
      terminalAt = at;
      completed = event; status = "completed";
      const snapshot = event.snapshot;
      const failures = "diagramErrors" in snapshot ? Object.keys(snapshot.diagramErrors ?? {}).length : 0;
      if ("diagramErrors" in snapshot) for (const [id, failure] of Object.entries(snapshot.diagramErrors ?? {})) {
        if (!failure) continue;
        const stage = failure.stage ?? "generate_models";
        const call = getCall(getStep(stage), `${stage}:${id}`, at, id);
        call.status = "failed"; call.message = "此模型未能完成生成，可重试。"; call.finishedAt = at;
      }
      if (failures) { status = "failed"; finalMessage = `生成结束，${failures} 个模型未完成，可重试失败项。`; }
      else if ("files" in snapshot) finalMessage = `已生成 ${Object.keys(snapshot.files).length} 个代码文件，可以查看原型。`;
      else if ("documentKind" in snapshot) finalMessage = `文档已生成${snapshot.fileName ? `：${snapshot.fileName}` : ""}。`;
      else if ("svgArtifacts" in snapshot) finalMessage = `已生成 ${snapshot.svgArtifacts.length} 个图形预览。`;
      else finalMessage = "生成完成，可以查看结果。";
    } else if (event.type === "failed" || event.type === "cancelled") {
      terminalAt = at;
      status = event.type;
      finalMessage = event.type === "failed"
        ? readableTaskText(localizeRunFailure(event.error, "生成任务失败，请稍后重试。"))
        : "任务已停止，已完成的过程保留。";
      break;
    }
  }
  const startupValidation = subtasks.find(
    (subtask) => subtask.id === "start_validation",
  );
  if (startupValidation) {
    const step = getStep("extract_rules");
    step.title = readableTaskText(startupValidation.label);
    const call = getCall(
      step,
      "extract_rules:start_validation",
      undefined,
      undefined,
      startupValidation.label,
    );
    call.title = readableTaskText(startupValidation.label);
    call.status = startupValidation.status as TranscriptStatus;
    if (startupValidation.status === "failed") {
      const localizedMessage = startupValidation.messageCode
        ? localizeRunFailure(
            {
              code: startupValidation.messageCode,
              params: startupValidation.messageParams,
            },
            "生成任务失败，请稍后重试。",
          )
        : "生成任务失败，请稍后重试。";
      call.message = localizedMessage;
      finalMessage = localizedMessage;
      status = "failed";
    }
  }
  const terminal = !["queued", "running", "idle"].includes(status);
  for (const step of steps.values()) {
    // Apply confirmed artifact/review state without showing unstarted placeholder steps.
    for (const subtask of subtasks) {
      const prefix = `${step.stage}:`;
      if (!subtask.id.startsWith(prefix) && subtask.id !== step.stage && !(step.stage === "extract_rules" && subtask.id === "repair_rules")) continue;
      if (subtask.status === "queued" && !step.calls.some((call) => call.subtaskId === subtask.id.slice(prefix.length))) continue;
      const rawId = subtask.id.startsWith(prefix) ? subtask.id.slice(prefix.length) : subtask.id;
      const call = getCall(step, `${step.stage}:${rawId}`, undefined, rawId, subtask.label);
      call.title = readableTaskText(subtask.label);
      call.status = ["repairing", "rendering"].includes(subtask.status) ? "running" : subtask.status as TranscriptStatus;
      if (subtask.status === "pending_review") call.message = `有 ${subtask.pendingReviewCount ?? 1} 条追踪关系需复核`;
      else if (subtask.status === "failed") {
        call.message = subtask.messageCode
          ? localizeRunFailure(
              { code: subtask.messageCode, params: subtask.messageParams },
              "生成任务失败，请稍后重试。",
            )
          : "此模型未能完成生成，可重试。";
      }
    }
    for (const call of step.calls) {
      if (terminal && ["running", "queued"].includes(call.status)) {
        call.status = status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed";
        call.finishedAt = terminalAt;
        call.thinking = false;
      }
    }
    step.status = step.calls.some((call) => call.status === "running" || call.status === "queued") ? "running"
      : step.calls.some((call) => call.status === "failed") ? "failed"
      : terminal ? status === "cancelled" ? "cancelled" : "completed" : "running";
  }
  return { steps: [...steps.values()].sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage)), status, finalMessage, completed };
}
