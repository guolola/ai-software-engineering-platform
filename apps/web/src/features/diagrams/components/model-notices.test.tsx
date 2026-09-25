// Verifies that model notices disclose details and visual acceptance only when requested.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelNotices, type ModelNotice } from "./model-notices";

const notices: ModelNotice[] = [
  { id: "stale", title: "模型已过期", detail: "上游需求已变化" },
  { id: "visual", title: "视觉检查待确认", detail: "图面有问题", issues: ["标签不可读", "连线交叉"], checks: 3, repairs: 2, reviewCheckedAt: "check-1" },
];

describe("model notices", () => {
  it("keeps all notice content in one dialog and only closes nonvisual notices", () => {
    render(<ModelNotices notices={notices} canConfirm onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "提示（2）" })).toBeVisible();
    expect(screen.queryByText("标签不可读")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "提示（2）" }));
    const dialog = screen.getByRole("dialog", { name: "模型提示" });
    expect(within(dialog).getByText("上游需求已变化")).toBeVisible();
    expect(within(dialog).getByText("标签不可读")).toBeVisible();
    expect(within(dialog).getByText("已检查 3 次；已尝试自动修复 2 次")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "知道了" }));
    expect(screen.queryByRole("dialog", { name: "模型提示" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提示（2）" })).toBeVisible();
  });

  it("keeps the dialog open with an error when acceptance cannot be saved", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("保存失败"));
    render(<ModelNotices notices={notices} canConfirm onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "提示（2）" }));
    fireEvent.click(screen.getByRole("button", { name: "确认当前图" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
    expect(screen.getByRole("dialog", { name: "模型提示" })).toBeVisible();
    expect(screen.getByRole("button", { name: "确认当前图" })).toBeEnabled();
    expect(onConfirm).toHaveBeenCalledWith("check-1");
  });

  it("explains missing permission and does not call acceptance", async () => {
    const onConfirm = vi.fn();
    render(<ModelNotices notices={notices} canConfirm={false} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "提示（2）" }));
    expect(screen.getByRole("button", { name: "确认当前图" })).toBeDisabled();
    expect(screen.getByText("当前没有确认视觉检查的权限。")).toBeVisible();
    await waitFor(() => expect(onConfirm).not.toHaveBeenCalled());
  });
});
