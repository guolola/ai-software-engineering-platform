// Exercises stable prose, reader-owned process folding and viewport scrolling.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "../../../shared/i18n";
import { GenerationTranscript } from "./generation-transcript";
import type { TranscriptStep } from "../lib/generation-transcript";

const steps: TranscriptStep[] = [{ stage: "generate_models", title: "生成模型", status: "running", messages: ["正在整理用例。"], calls: [{
  id: "a", title: "分析参与者与用例", status: "running", output: "模型正文", summary: "核对参与者", thinking: true, technical: false,
}] }];
afterEach(async () => { await act(async () => { await i18n.changeLanguage("zh-CN"); }); });

describe("stage reading surface", () => {
  it("shows verified evidence, actual attempts and rejected changes under the review call", () => {
    const reviewSteps: TranscriptStep[] = [{ ...steps[0], stage: "verify_diagram_visual", title: "视觉检查", status: "completed", finished: true, messages: [], calls: [{
      ...steps[0].calls[0], title: "领域模型 · 视觉检查", status: "pending_review", output: "", summary: "", thinking: false,
      review: { status: "pending_review", issues: ["字段标记与约束不同"], reason: "待确认", checkedAt: "check-1", attempts: 1, structureAttempts: 2, repairAttempts: 1, checkOutcome: "differences",
        findings: [{ id: "f1", modelId: "table", layer: "model", code: "constraint-marker", observation: "字段标记与约束不同", evidence: [{ source: "constraint", reference: "fk-order", detail: "明确外键" }], verification: "verified", repairable: true }],
        repairHistory: [{ round: 1, target: "model", issueIds: ["f1"], beforeFingerprint: "old", status: "rejected", changes: ["候选改变了模型标题"], reason: "越过授权字段" }], stopReason: "候选越界，保留上一份有效模型" },
    }] }];
    const { container } = render(<GenerationTranscript taskKey="review-details" steps={reviewSteps} active={false} finalMessage="生成完成，问题待确认。" />);
    const details = container.querySelector('[data-slot="diagram-review-details"]') as HTMLElement;
    expect(details).toHaveTextContent("结构核对 2 次 · 图片检查 1 次 · 纠错尝试 1 次");
    expect(details).toHaveTextContent("业务约束（1）");
    expect(details).toHaveTextContent("已核实：字段标记与约束不同");
    fireEvent.click(within(details).getByText("查看问题依据与处理详情"));
    expect(within(details).getByText("依据：fk-order · 明确外键")).toBeVisible();
    expect(details).toHaveTextContent("第 1 轮结构纠错：已拒绝 · 越过授权字段");
    expect(details).toHaveTextContent("停止原因：候选越界，保留上一份有效模型");
    expect(details.closest('[data-slot="chain-of-thought-step-content"]')).not.toBeNull();
    expect(screen.getByRole("region", { name: "输出总结" })).toHaveTextContent("生成完成，问题待确认。");
  });
  it("retains the user's disclosure choice when prose starts and the stage finishes", () => {
    const { rerender } = render(<GenerationTranscript taskKey="a" steps={steps} active finalMessage="" />);
    const toggle = screen.getByRole("button", { name: "正在思考" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const output = [{ ...steps[0], calls: [{ ...steps[0].calls[0], thinking: false, output: "开始输出正文" }] }];
    rerender(<GenerationTranscript taskKey="a" steps={output} active finalMessage="" />);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    rerender(<GenerationTranscript taskKey="a" steps={[{ ...output[0], finished: true, status: "completed" }]} active={false} finalMessage="完成" />);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName("思考过程");
    expect(screen.getByText("模型推理摘要：核对参与者")).not.toBeVisible();
    expect(screen.getByText("开始输出正文")).not.toBeVisible();
    expect(screen.getByRole("region", { name: "输出总结" })).toHaveTextContent("完成");
    expect(screen.getByRole("region", { name: "输出总结" })).toBeVisible();
  });

  it("animates only the active stage and preserves existing Markdown paragraph nodes", () => {
    const calls = [steps[0].calls[0], { ...steps[0].calls[0], id: "b", title: "生成活动图", thinking: false }];
    const { container, rerender } = render(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], calls }]} active finalMessage="" />);
    const heading = screen.getByText("生成模型");
    const paragraph = screen.getAllByText("模型正文")[0];
    expect(container.querySelectorAll('[data-slot="ai-shimmer"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="chain-of-thought-step"][data-status="active"]')).toHaveLength(1);
    expect(screen.getAllByText("分析参与者与用例")[0]).not.toHaveAttribute("data-slot", "ai-shimmer");
    rerender(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], calls: [{ ...calls[0], output: "模型正文新增\n\n- **要点**\n\n```ts\nconst x = 1\n```" }, calls[1]] }]} active finalMessage="" />);
    expect(screen.getByText("生成模型")).toBe(heading);
    expect(screen.getByText("模型正文新增")).toBe(paragraph);
    expect(screen.getByText("要点").tagName).toBe("STRONG");
    expect(screen.getByText("const x = 1").closest("pre")).not.toBeNull();
  });

  it("keeps failures and retry controls visible when the process is folded", () => {
    render(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], status: "failed", calls: [{ ...steps[0].calls[0], status: "failed", subtaskId: "usecase", message: "关系缺失，需要修复。" }] }]} active={false} finalMessage="" onRetry={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "思考过程" }));
    expect(screen.getByText(/关系缺失，需要修复/)).toBeVisible();
    expect(screen.getByRole("button", { name: "重试此模型" })).toBeVisible();
    expect(document.querySelector('[data-slot="spinner"]')).toBeNull();
  });

  it("uses the shared viewport and preserves manual up-scroll until return to latest", () => {
    const { container, rerender } = render(<GenerationTranscript taskKey="a" steps={steps} active finalMessage="" />);
    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement;
    expect(container.querySelector('[data-slot="scroll-area-scrollbar"]')).toBeNull();
    Object.defineProperties(viewport, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
    fireEvent.wheel(viewport, { deltaY: -100 });
    viewport.scrollTop = 100; fireEvent.scroll(viewport);
    rerender(<GenerationTranscript taskKey="a" steps={[...steps]} active finalMessage="新增结果" />);
    expect(viewport.scrollTop).toBe(100);
    fireEvent.click(screen.getByRole("button", { name: "回到最新" }));
    expect(viewport.scrollTop).toBe(700);
    expect(screen.queryByRole("button", { name: "回到最新" })).not.toBeInTheDocument();
  });

  it("shows actual streamed reasoning separately and keeps it available after completion", () => {
    const withReasoning: TranscriptStep[] = [{ ...steps[0], calls: [{ ...steps[0].calls[0], reasoning: "先检查参与者。", thinking: true }] }];
    const { rerender } = render(<GenerationTranscript taskKey="reasoning" steps={withReasoning} active finalMessage="" />);
    const trigger = screen.getByRole("button", { name: "思考过程 · 分析参与者与用例" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("先检查参与者。")).toBeVisible();
    expect(screen.getByText("先检查参与者。").closest('[data-slot="collapsible-content"]')).toHaveClass("text-muted-foreground");
    expect(screen.getByText("模型推理摘要：核对参与者")).toHaveClass("text-muted-foreground");
    expect(screen.getByText("模型正文").closest('[data-slot="transcript-prose"]')).toHaveClass("text-black", "dark:text-foreground");
    rerender(<GenerationTranscript taskKey="reasoning" steps={[{ ...withReasoning[0], status: "completed", finished: true, calls: [{ ...withReasoning[0].calls[0], status: "completed", thinking: false, output: "模型正文" }] }]} active={false} finalMessage="完成" />);
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(screen.getByText("先检查参与者。")).toBeVisible();
    expect(screen.getAllByText("模型正文").length).toBeGreaterThan(0);
  });

  it("shows provider summaries without inventing reasoning for calls without it", () => {
    render(<GenerationTranscript taskKey="summary-only" steps={[{ ...steps[0], calls: [{ ...steps[0].calls[0], reasoning: "", summary: "核对参与者", thinking: false }] }]} active finalMessage="" />);
    expect(screen.getByText("模型推理摘要：核对参与者")).toBeVisible();
    expect(screen.queryByRole("button", { name: /思考过程/ })).not.toBeInTheDocument();
  });

  it("marks all unfinished parallel stages as active", () => {
    render(<GenerationTranscript taskKey="parallel" steps={[steps[0], { ...steps[0], stage: "render_svg", title: "生成图形预览", messages: [], calls: [] }]} active finalMessage="" />);
    expect(screen.queryByText(/任务状态/)).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="chain-of-thought-step"][data-status="active"]')).toHaveLength(2);
  });

  it("groups generation, rendering and visual review into one timeline with compact stage descriptions", () => {
    const description = "展示学生和管理员与预约系统的交互关系。";
    const contextSteps: TranscriptStep[] = [
      { ...steps[0], stage: "generate_context", title: "生成系统环境图", finished: true, status: "completed", messages: [], calls: [{ ...steps[0].calls[0], output: description, status: "completed", thinking: false }] },
      { ...steps[0], stage: "render_context", title: "渲染系统环境图", finished: true, status: "completed", messages: [], calls: [] },
      { ...steps[0], stage: "verify_diagram_visual", title: "视觉检查", finished: true, status: "completed", messages: [], calls: [{ ...steps[0].calls[0], id: "visual", output: "", reasoning: "对照图片核对节点。", status: "completed", thinking: false,
        inputImages: [{ url: "data:image/png;base64,cG5n", caption: "视觉检查使用的环境图" }] }] },
    ];
    const { container } = render(<GenerationTranscript taskKey="context" steps={contextSteps} active={false} finalMessage="系统环境图已生成。" />);
    const chain = container.querySelector('[data-slot="chain-of-thought"]')!;
    expect(screen.getAllByRole("button", { name: "思考过程" })).toHaveLength(1);
    expect(within(chain as HTMLElement).getAllByTestId("generation-task-step")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "执行过程" })).not.toBeInTheDocument();
    expect(screen.getByText(description).closest('[data-slot="transcript-prose"]')).toHaveClass("text-sm", "text-black", "dark:text-foreground");
    expect(screen.getByText(description).closest('[data-slot="chain-of-thought-step-content"]')).not.toBeNull();
    const image = screen.getByRole("img", { name: "视觉检查使用的环境图" });
    expect(image.closest('[data-testid="generation-task-step"]')).toHaveAttribute("aria-label", "视觉检查");
    expect(image.closest('[data-slot="chain-of-thought-image"]')).toHaveTextContent("视觉检查使用的环境图");
    const summary = screen.getByRole("region", { name: "输出总结" });
    expect(chain.contains(summary)).toBe(false);
    expect(summary).toHaveTextContent("系统环境图已生成。");
    expect(summary).toHaveClass("text-black", "dark:text-foreground");
    expect(chain.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("preserves nested reasoning choices through task folding and new streamed content", () => {
    const withReasoning = [{ ...steps[0], calls: [{ ...steps[0].calls[0], reasoning: "先检查参与者。" }] }];
    const { rerender } = render(<GenerationTranscript taskKey="folding" steps={withReasoning} active finalMessage="" />);
    const reasoning = screen.getByRole("button", { name: "思考过程 · 分析参与者与用例" });
    fireEvent.click(reasoning);
    const chain = screen.getByRole("button", { name: "正在思考" });
    fireEvent.click(chain);
    rerender(<GenerationTranscript taskKey="folding" steps={[{ ...withReasoning[0], calls: [{ ...withReasoning[0].calls[0], reasoning: "先检查参与者。再核对关系。" }] }]} active finalMessage="" />);
    expect(chain).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chain);
    expect(reasoning).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(reasoning);
    expect(screen.getByText("先检查参与者。再核对关系。")).toBeVisible();
  });

  it("shows real queue metadata and collapses queued items", () => {
    render(<GenerationTranscript taskKey="queued" steps={[]} active finalMessage="" queue={{
      position: 2, ahead: 1, estimatedWaitMs: 60_000, reason: "project",
      items: [{ id: "class", label: "领域概念模型", ahead: 0, reason: "run" }],
    }} />);
    expect(screen.getByText("队列第 2 位")).toBeVisible();
    expect(screen.getByText(/前方 1 个模型调用/)).toBeVisible();
    expect(screen.getByText("领域概念模型")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "查看排队项目" }));
    expect(screen.getByRole("button", { name: "查看排队项目" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("领域概念模型")).not.toBeVisible();
  });

  it.each([
    ["requirements", "需求建模助手", "Requirements Modeling Assistant"],
    ["design", "设计建模助手", "Design Modeling Assistant"],
    ["code", "代码生成助手", "Code Generation Assistant"],
    ["document", "文档编写助手", "Documentation Assistant"],
    ["feasibility", "可研分析助手", "Feasibility Study Assistant"],
    ["unknown", "生成助手", "Generation Assistant"],
  ])("localizes the %s assistant and its thought header alongside the recorded model", async (kind, chinese, english) => {
    const { container } = render(<GenerationTranscript taskKey="localized" kind={kind} model="deepseek-flash" steps={steps} active finalMessage="" />);
    const header = container.querySelector('[data-slot="generation-assistant-header"]')!;
    expect(header).toHaveTextContent(chinese);
    expect(header).toHaveTextContent("deepseek-flash");
    expect(screen.queryByText(i18n.t(`generation.taskKinds.${kind}`))).not.toBeInTheDocument();
    expect(screen.queryByText("Agent")).not.toBeInTheDocument();
    expect(screen.queryByText(/任务状态/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "正在思考" })).toBeVisible();
    await act(async () => { await i18n.changeLanguage("en-US"); });
    expect(header).toHaveTextContent(english);
    expect(screen.queryByText(i18n.t(`generation.taskKinds.${kind}`))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thinking" })).toBeVisible();
  });

  it("does not invent a model label for older tasks without recorded metadata", () => {
    const { container } = render(<GenerationTranscript taskKey="legacy" steps={steps} active={false} finalMessage="" />);
    expect(container.querySelector('[data-slot="generation-model"]')).toBeNull();
    expect(screen.getByRole("button", { name: "思考过程" })).toBeVisible();
  });
});
