// Exercises stable prose, reader-owned process folding and viewport scrolling.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GenerationTranscript } from "./generation-transcript";
import type { TranscriptStep } from "../lib/generation-transcript";

const steps: TranscriptStep[] = [{ stage: "generate_models", title: "生成模型", status: "running", messages: ["正在整理用例。"], calls: [{
  id: "a", title: "分析参与者与用例", status: "running", output: "模型正文", summary: "核对参与者", thinking: true, technical: false,
}] }];

describe("stage reading surface", () => {
  it("retains the user's disclosure choice when prose starts and the stage finishes", () => {
    const { rerender } = render(<GenerationTranscript taskKey="a" steps={steps} active introduction="开始生成。" finalMessage="" />);
    const toggle = screen.getByRole("button", { name: "思考与执行过程" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const output = [{ ...steps[0], calls: [{ ...steps[0].calls[0], thinking: false, output: "开始输出正文" }] }];
    rerender(<GenerationTranscript taskKey="a" steps={output} active introduction="开始生成。" finalMessage="" />);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    rerender(<GenerationTranscript taskKey="a" steps={[{ ...output[0], finished: true, status: "completed" }]} active={false} introduction="开始生成。" finalMessage="完成" />);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("核对参与者")).not.toBeVisible();
    expect(screen.getByText("开始输出正文")).toBeVisible();
  });

  it("animates only the active stage and preserves existing Markdown paragraph nodes", () => {
    const calls = [steps[0].calls[0], { ...steps[0].calls[0], id: "b", title: "生成活动图", thinking: false }];
    const { container, rerender } = render(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], calls }]} active introduction="开始生成。" finalMessage="" />);
    const heading = screen.getByText("生成模型");
    const paragraph = screen.getAllByText("模型正文")[0];
    expect(container.querySelectorAll('.ui-text-shimmer')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="spinner"]')).toHaveLength(1);
    expect(screen.getAllByText("分析参与者与用例")[0]).not.toHaveClass("ui-text-shimmer");
    rerender(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], calls: [{ ...calls[0], output: "模型正文新增\n\n- **要点**\n\n```ts\nconst x = 1\n```" }, calls[1]] }]} active introduction="开始生成。" finalMessage="" />);
    expect(screen.getByText("生成模型")).toBe(heading);
    expect(screen.getByText("模型正文新增")).toBe(paragraph);
    expect(screen.getByText("要点").tagName).toBe("STRONG");
    expect(screen.getByText("const x = 1").closest("pre")).not.toBeNull();
  });

  it("keeps failures and retry controls visible when the process is folded", () => {
    render(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], status: "failed", calls: [{ ...steps[0].calls[0], status: "failed", subtaskId: "usecase", message: "关系缺失，需要修复。" }] }]} active={false} introduction="生成需求" finalMessage="" onRetry={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "思考与执行过程" }));
    expect(screen.getByText(/关系缺失，需要修复/)).toBeVisible();
    expect(screen.getByRole("button", { name: "重试此模型" })).toBeVisible();
    expect(document.querySelector('[data-slot="spinner"]')).toBeNull();
  });

  it("uses the shared viewport and preserves manual up-scroll until return to latest", () => {
    const { container, rerender } = render(<GenerationTranscript taskKey="a" steps={steps} active introduction="开始生成。" finalMessage="" />);
    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement;
    expect(container.querySelector('[data-slot="scroll-area-scrollbar"]')).not.toBeNull();
    Object.defineProperties(viewport, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
    fireEvent.wheel(viewport, { deltaY: -100 });
    viewport.scrollTop = 100; fireEvent.scroll(viewport);
    rerender(<GenerationTranscript taskKey="a" steps={[...steps]} active introduction="开始生成。" finalMessage="新增结果" />);
    expect(viewport.scrollTop).toBe(100);
    fireEvent.click(screen.getByRole("button", { name: "回到最新" }));
    expect(viewport.scrollTop).toBe(700);
    expect(screen.queryByRole("button", { name: "回到最新" })).not.toBeInTheDocument();
  });
});
