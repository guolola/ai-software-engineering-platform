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
  it("switches from analysis to output while retaining the received thinking summary", () => {
    const events = [activity("start", "a", "started"), activity("think", "a", "thinking"), activity("summary", "a", "summary", "正在核对需求。")];
    expect(projectGenerationTranscript(events).steps[0].calls[0].thinking).toBe(true);
    const call = projectGenerationTranscript([...events, activity("out", "a", "output", "正文片段")]).steps[0].calls[0];
    expect(call.thinking).toBe(false);
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
