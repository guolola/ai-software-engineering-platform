// Exercises user-visible ordering, replay and parallel output independently of presentation.
import { describe, expect, it } from "vitest";
import type { RunActivityEvent, RunEvent } from "@uml-platform/contracts";
import { createRunSnapshot } from "../../../test/workspace-test-utils";
import { mergeTranscriptEvents } from "../../workspace-session/lib/run-transcript";
import { projectGenerationTranscript, readableTaskText, readableOutput } from "./generation-transcript";

const activity = (id: string, callId: string, phase: RunActivityEvent["phase"], text?: string): RunActivityEvent => ({
  type: "run_activity", eventId: id, callId, phase, text, format: "technical", runId: "run-a", stage: "generate_models", subtaskId: callId,
  createdAt: "2026-09-21T08:00:00.000Z",
});

describe("generation transcript", () => {
  it("shows client rule repair after extraction without exposing the empty model phase", () => {
    const events: RunEvent[] = [
      { type: "stage_started", stage: "extract_rules", tracksCompletion: true },
      { type: "stage_finished", stage: "extract_rules", status: "completed" },
      { type: "stage_started", stage: "generate_models" },
      { type: "stage_finished", stage: "generate_models", status: "completed" },
      { type: "completed", snapshot: createRunSnapshot({ selectedDiagrams: [], status: "completed" }) },
    ];
    const extraction = { id: "extract_rules", label: "抽取需求规则", status: "completed" as const, message: null, errorMessage: null };
    const repair = { id: "repair_rules", label: "修复需求规则", status: "repairing" as const, message: "正在修复 r2", errorMessage: null };
    const active = projectGenerationTranscript(events, "completed", [extraction, repair]);
    expect(active.visibleSteps.map((step) => step.title)).toEqual(["抽取需求规则", "修复需求规则"]);
    expect(active.status).toBe("running");
    const done = projectGenerationTranscript(events, "completed", [extraction, { ...repair, status: "pending_review", pendingReviewCount: 1 }]);
    expect(done.status).toBe("completed");
    expect(done.visibleSteps[1].calls[0].message).toContain("1 条需求规则修复结果待确认");
  });

  it("reveals each sequential feasibility stage as soon as its successor starts", () => {
    const stages = ["generate_context", "render_context", "generate_business_flow", "render_business_flow", "generate_implementation"] as const;
    const events: RunEvent[] = [];
    for (const stage of stages) {
      events.push({ type: "stage_started", stage });
      const result = projectGenerationTranscript(events);
      expect(result.visibleSteps.map((step) => step.stage)).toEqual(stages.slice(0, events.length));
      expect(result.visibleSteps.slice(0, -1).every((step) => step.finished)).toBe(true);
    }
  });
  it("keeps the two feasibility image reviews in separate chronological steps", () => {
    const events: RunEvent[] = [
      { type: "stage_started", stage: "render_context" },
      { type: "stage_started", stage: "verify_diagram_visual" },
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "context", subtaskStatus: "completed", message: "系统环境图已通过" },
      { type: "stage_started", stage: "generate_business_flow" },
      { type: "stage_started", stage: "render_business_flow" },
      { type: "stage_started", stage: "verify_diagram_visual" },
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "business-flow", subtaskStatus: "pending_review", message: "流程图待确认" },
    ];
    const result = projectGenerationTranscript(events);
    expect(result.steps.map((step) => step.stage)).toEqual([
      "render_context", "verify_diagram_visual", "generate_business_flow", "render_business_flow", "verify_diagram_visual",
    ]);
    expect(result.steps[1].calls.map((call) => call.subtaskId)).toEqual(["context"]);
    expect(result.steps[4].calls.map((call) => call.subtaskId)).toEqual(["business-flow"]);
  });
  it("switches from analysis to output while retaining the received thinking summary", () => {
    const events = [activity("start", "a", "started"), activity("think", "a", "thinking"), activity("reasoning", "a", "reasoning", "先检查需求。"), activity("summary", "a", "summary", "正在核对需求。")];
    expect(projectGenerationTranscript(events).steps[0].calls[0].thinking).toBe(true);
    const call = projectGenerationTranscript([...events, activity("out", "a", "output", "正文片段")]).steps[0].calls[0];
    expect(call.thinking).toBe(false);
    expect(call.reasoning).toBe("先检查需求。");
    expect(call.summary).toBe("正在核对需求。");
    expect(call.status).toBe("running");
  });
  it("streams document paragraphs without leaking JSON keys or inventing prose", () => {
    const item = { ...activity("doc", "doc", "output", '{"sections":[{"title":"概述","body":["第一段。","正在生成'), stage: "generate_document_text" as const };
    const call = projectGenerationTranscript([item]).steps[0].calls[0];
    expect(readableOutput(call)).toBe("第一段。\n\n正在生成");
    expect(readableOutput({ ...call, output: '{"sections":[' })).toBe("");
  });
  it("separates interleaved parallel calls and deduplicates replayed fragments", () => {
    const events = [activity("a1", "usecase", "started"), activity("b1", "activity", "started"), activity("a2", "usecase", "output", "用例"), activity("b2", "activity", "output", "流程")];
    const merged = mergeTranscriptEvents(events, [...events, activity("a3", "usecase", "output", "图")]);
    const result = projectGenerationTranscript(merged);
    expect(result.steps[0].calls.map((call) => call.output)).toEqual(["用例图", "流程"]);
  });

  it("restores raw reasoning per call without mixing it with answers or provider summaries", () => {
    const events = [
      activity("a1", "usecase", "reasoning", "先列出"), activity("b1", "activity", "reasoning", "分析流程"),
      activity("a2", "usecase", "reasoning", "角色"), activity("a3", "usecase", "summary", "正在分析角色"),
      activity("a4", "usecase", "output", "用例答案"), activity("b2", "activity", "output", "活动答案"),
    ];
    const result = projectGenerationTranscript(mergeTranscriptEvents(events, events));
    expect(result.steps[0].calls.map((call) => [call.reasoning, call.summary, call.output])).toEqual([
      ["先列出角色", "正在分析角色", "用例答案"], ["分析流程", "", "活动答案"],
    ]);
  });

  it("keeps failed attempts and actual summaries separate from retries", () => {
    const result = projectGenerationTranscript([
      activity("a", "first", "started"), activity("b", "first", "thinking"), activity("c", "first", "failed"),
      activity("d", "retry", "started"), activity("e", "retry", "summary", "核对输入"), activity("f", "retry", "completed"),
    ]);
    expect(result.steps[0].calls.map((call) => [call.status, call.summary])).toEqual([["failed", ""], ["completed", "核对输入"]]);
  });

  it("keeps a repair explanation between the original call and its retry", () => {
    const result = projectGenerationTranscript([
      activity("start", "first", "started"), activity("fail", "first", "failed"),
      { type: "stage_progress", stage: "generate_models", progress: 50, message: "发现关系缺失，正在补全。" },
      activity("retry", "second", "started"),
    ]);
    expect(result.steps[0].entries?.map((entry) => entry.kind)).toEqual(["call", "message", "call"]);
  });

  it("only shows executed steps and groups parallel rendering under workflow order", () => {
    const result = projectGenerationTranscript([
      { type: "stage_progress", stage: "render_svg", progress: 90, subtaskId: "usecase", subtaskStatus: "running" },
      activity("a", "activity", "started"),
    ]);
    expect(result.steps.map((step) => step.stage)).toEqual(["generate_models", "render_svg"]);
    expect(result.steps).toHaveLength(2);
  });

  it("flushes to a stable terminal transcript and never adds later updates", () => {
    const original: RunEvent[] = [activity("a", "usecase", "started"), { type: "cancelled", eventId: "end", message: "停止" }];
    const events = mergeTranscriptEvents(original, [activity("late", "usecase", "output", "不可追加")]);
    expect(events).toBe(original);
    expect(projectGenerationTranscript(events).steps[0].calls[0].status).toBe("cancelled");
  });

  it("summarizes actual artifacts and leaves missing historical output absent", () => {
    const result = projectGenerationTranscript([{ type: "completed", snapshot: createRunSnapshot({ svgArtifacts: [], status: "completed" }) }]);
    expect(result.finalMessage).toBe("已生成 0 个图形预览。");
    expect(result.steps).toHaveLength(0);
    expect(readableTaskText("generate_models https://service.example/private")).not.toMatch(/generate_models|https:/);
  });
});

describe("business stage presentation queue", () => {
  const started = (stage: "generate_models" | "generate_plantuml" | "render_svg"): RunEvent => ({ type: "stage_started", stage, tracksCompletion: true });
  const finished = (stage: "generate_models" | "generate_plantuml" | "render_svg"): RunEvent => ({ type: "stage_finished", stage, status: "completed" });

  it("buffers downstream output while parallel models and repairs are still running", () => {
    const events: RunEvent[] = [started("generate_models"), activity("a", "usecase", "started"), activity("b", "activity", "started"),
      { ...activity("early", "render", "output", "提前返回的预览"), stage: "render_svg" },
      activity("c", "usecase", "completed"),
      { type: "artifact_ready", stage: "generate_models", artifactKind: "model" },
    ];
    expect(projectGenerationTranscript(events).visibleSteps.map((step) => step.stage)).toEqual(["generate_models"]);
    events.push(activity("d", "activity", "failed"), activity("e", "retry", "started"), activity("f", "retry", "completed"));
    expect(projectGenerationTranscript(events).visibleSteps).toHaveLength(1);
    events.push(finished("generate_models"));
    const result = projectGenerationTranscript(events);
    expect(result.visibleSteps.map((step) => step.stage)).toEqual(["generate_models", "render_svg"]);
    expect(result.visibleSteps[1].calls[0].output).toBe("提前返回的预览");
    expect(result.steps[0].status).toBe("completed");
  });

  it("does not let stale failure mirrors mark a new retry failed and deduplicates successful artifacts", () => {
    const first = { ...activity("a", "first", "failed"), subtaskId: "usecase" };
    const events: RunEvent[] = [first, { type: "stage_progress", stage: "generate_models", progress: 50, subtaskId: "usecase", subtaskStatus: "failed" },
      { ...activity("retry", "retry", "started"), subtaskId: "usecase" }];
    expect(projectGenerationTranscript(events).steps[0].calls.map((call) => call.status)).toEqual(["failed", "running"]);
    const finishedRetry: RunEvent[] = [...events, { ...activity("finish-retry", "retry", "completed"), subtaskId: "usecase" }, finished("generate_models")];
    expect(projectGenerationTranscript(finishedRetry, "completed").steps[0].calls.map((call) => call.status)).toEqual(["failed", "completed"]);
    events.push({ ...activity("done", "retry", "completed"), subtaskId: "usecase" }, { type: "artifact_ready", stage: "generate_models", artifactKind: "model", subtaskId: "usecase" });
    expect(projectGenerationTranscript(events).steps[0].calls).toHaveLength(2);
  });

  it("retains check, repair, recheck as three stable steps", () => {
    const events: RunEvent[] = [];
    for (const stage of ["audit_code_quality", "repair_code_files", "audit_code_quality"] as const) {
      events.push({ type: "stage_started", stage, tracksCompletion: true }, { type: "stage_finished", stage, status: "completed" });
    }
    const steps = projectGenerationTranscript(events).visibleSteps;
    expect(steps.map((step) => step.stage)).toEqual(["audit_code_quality", "repair_code_files", "audit_code_quality"]);
    expect(new Set(steps.map((step) => step.id)).size).toBe(3);
  });

  it("reveals buffered content immediately on cancellation or failure", () => {
    const events: RunEvent[] = [started("generate_models"), { ...activity("later", "render", "output", "已收到"), stage: "render_svg" }];
    for (const terminal of [{ type: "cancelled", message: "停止" }, { type: "failed", error: { code: "RUN_LEGACY_FAILURE", message: "失败", retryable: false } }] as RunEvent[]) {
      const result = projectGenerationTranscript([...events, terminal]);
      expect(result.visibleSteps).toHaveLength(2);
      expect(result.visibleSteps[1].calls[0].output).toBe("已收到");
      expect(result.visibleSteps.every((step) => step.finished)).toBe(true);
    }
  });

  it("restores old history directly and advances old live runs only at aggregate artifacts", () => {
    const events: RunEvent[] = [{ type: "stage_started", stage: "generate_models" }, { type: "stage_started", stage: "render_svg" }];
    expect(projectGenerationTranscript(events, "completed").visibleSteps).toHaveLength(2);
    expect(projectGenerationTranscript(events).visibleSteps).toHaveLength(1);
    events.push({ type: "artifact_ready", stage: "generate_models", artifactKind: "model", subtaskId: "usecase" });
    expect(projectGenerationTranscript(events).visibleSteps).toHaveLength(1);
    events.push({ type: "artifact_ready", stage: "generate_models", artifactKind: "model" });
    expect(projectGenerationTranscript(events).visibleSteps).toHaveLength(2);
  });
});
