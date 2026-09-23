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
