// Verifies the shadcn.io/ai-style reasoning and agent turn primitives.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CpuIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { AgentTurn } from "./agent-turn";
import { Reasoning } from "./reasoning";

describe("Reasoning", () => {
  it("collapses and expands streaming stage output", async () => {
    render(<Reasoning title="思考过程">正在补齐依赖</Reasoning>);

    const trigger = screen.getByRole("button", { name: /思考过程/u });
    expect(screen.queryByText("正在补齐依赖")).not.toBeVisible();
    await userEvent.click(trigger);
    expect(screen.getByText("正在补齐依赖")).toBeVisible();
  });

  it("opens by default for running stages", () => {
    render(
      <Reasoning title="思考过程" defaultOpen>
        流式输出
      </Reasoning>,
    );

    expect(screen.getByText("流式输出")).toBeVisible();
  });
});

describe("AgentTurn", () => {
  it("renders stage title, badge and loader while running", () => {
    render(
      <AgentTurn icon={CpuIcon} title="用例实现设计" badge="运行中" running>
        <span>阶段输出</span>
      </AgentTurn>,
    );

    expect(screen.getByText("用例实现设计")).toBeInTheDocument();
    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.getByText("阶段输出")).toBeInTheDocument();
  });
});
