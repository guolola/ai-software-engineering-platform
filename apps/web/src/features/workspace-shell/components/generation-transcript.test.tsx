// Checks the card-free reading surface, expandable calls and manual scroll following.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GenerationTranscript } from "./generation-transcript";
import type { TranscriptStep } from "../lib/generation-transcript";

const steps: TranscriptStep[] = [{ stage: "generate_models", title: "生成模型", status: "running", messages: ["正在整理用例。"], calls: [{
  id: "a", title: "分析参与者与用例", status: "running", startedAt: "2026-09-21T00:00:00.000Z", output: "模型正文", summary: "核对参与者", thinking: true, technical: false,
}] }];

describe("borderless generation conversation", () => {
  it("opens the live thinking summary, then folds it when prose starts and allows reopening", () => {
    const { rerender } = render(<GenerationTranscript taskKey="a" steps={steps} active introduction="开始生成。" finalMessage="" />);
    const summary = screen.getByText("思考摘要").closest("details")!;
    expect(summary).toHaveAttribute("open");
    rerender(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], calls: [{ ...steps[0].calls[0], thinking: false, output: "开始输出正文" }] }]} active introduction="开始生成。" finalMessage="" />);
    expect(summary).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("思考摘要"));
    expect(summary).toHaveAttribute("open");
  });
  it("animates only running titles and keeps their nodes stable as parallel output arrives", () => {
    const calls = [steps[0].calls[0], { ...steps[0].calls[0], id: "b", title: "生成活动图", thinking: false }];
    const { container, rerender } = render(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], calls }]} active introduction="开始生成。" finalMessage="" />);
    const title = screen.getByText("分析参与者与用例");
    const spinner = container.querySelector('[data-slot="spinner"]');
    expect(container.querySelectorAll('.ui-text-shimmer')).toHaveLength(2);
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(spinner).not.toHaveAttribute("role");
    expect(screen.getByText(/正在分析/)).not.toHaveClass("ui-text-shimmer");
    expect(screen.getAllByText("模型正文")[0]).not.toHaveClass("ui-text-shimmer");
    fireEvent.click(screen.getByRole("button", { name: /分析参与者与用例/ }));
    rerender(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], calls: [{ ...calls[0], output: "新收到的正文" }, { ...calls[1], status: "completed" }] }]} active introduction="开始生成。" finalMessage="" />);
    expect(screen.getByText("分析参与者与用例")).toBe(title);
    expect(container.querySelector('[data-slot="spinner"]')).toBe(spinner);
    expect(container.querySelectorAll('.ui-text-shimmer')).toHaveLength(1);
    expect(screen.getByText("生成活动图")).not.toHaveClass("ui-text-shimmer");
    expect(screen.getByRole("button", { name: /分析参与者与用例/ })).toHaveAttribute("aria-expanded", "true");
  });

  it.each(["completed", "failed", "cancelled", "queued", "pending_review"] as const)("uses static titles and icons for %s calls", (status) => {
    const { container, rerender } = render(<GenerationTranscript taskKey="a" steps={steps} active introduction="开始生成。" finalMessage="" />);
    rerender(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], calls: [{ ...steps[0].calls[0], status }] }]} active={false} introduction="开始生成。" finalMessage="" />);
    expect(container.querySelector('[data-slot="spinner"]')).toBeNull();
    expect(container.querySelector('.ui-text-shimmer')).toBeNull();
  });

  it("shows a small decorative spinner while waiting for the first step", () => {
    const { container } = render(<GenerationTranscript taskKey="a" steps={[]} active introduction="开始生成。" finalMessage="" />);
    expect(screen.getByRole("status")).toHaveTextContent("等待任务开始");
    expect(container.querySelector('[data-slot="spinner"]')).toHaveClass("size-3.5");
  });

  it("shows one agent and expandable rows without cards, badges or a common log box", () => {
    const { container } = render(<GenerationTranscript taskKey="a" steps={steps} active introduction="开始生成。" finalMessage="" />);
    expect(screen.getAllByText("Agent")).toHaveLength(1);
    expect(container.querySelector('[data-slot="card"], [data-slot="badge"], [data-testid="generation-task-execution-box"]')).toBeNull();
    expect(screen.getByText("模型正文")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /分析参与者与用例/ }));
    expect(screen.getByText("模型正文")).toBeInTheDocument();
    expect(screen.getByText("思考摘要")).toBeInTheDocument();
  });

  it("preserves reader position while new text arrives and provides return to latest", () => {
    const { container, rerender } = render(<GenerationTranscript taskKey="a" steps={steps} active introduction="开始生成。" finalMessage="" />);
    const viewport = container.querySelector('[data-slot="ai-conversation"]') as HTMLDivElement;
    Object.defineProperties(viewport, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
    viewport.scrollTop = 100; fireEvent.scroll(viewport);
    rerender(<GenerationTranscript taskKey="a" steps={[...steps]} active introduction="开始生成。" finalMessage="新增结果" />);
    expect(viewport.scrollTop).toBe(100);
    fireEvent.click(screen.getByRole("button", { name: "回到最新" }));
    expect(viewport.scrollTop).toBe(1000);
    expect(screen.queryByRole("button", { name: "回到最新" })).not.toBeInTheDocument();
  });
});
