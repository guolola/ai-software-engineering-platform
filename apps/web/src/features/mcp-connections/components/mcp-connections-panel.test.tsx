// Covers project selection guards, one-time credential display, revocation and client-specific configuration.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McpConnectionsPanel } from "./mcp-connections-panel";
import { McpConsentPage, McpConsentPanel } from "./mcp-consent-page";
import { mcpApi, McpApiError, type ConnectionInfo } from "../services/mcp-api";
import { clientConfiguration } from "../model/client-configurations";
import { FloatingAlertProvider } from "../../../shared/ui/floating-alert";
vi.mock("../services/mcp-api", async (original) => ({
  ...(await original<typeof import("../services/mcp-api")>()),
  mcpApi: {
    connections: vi.fn(),
    createToken: vi.fn(),
    revoke: vi.fn(),
    interaction: vi.fn(),
    consent: vi.fn(),
    deny: vi.fn(),
  },
}));
const info: ConnectionInfo = {
  enabled: true,
  serverUrl: "https://platform.example/api/mcp",
  csrf: "test-csrf",
  projects: [{ id: "library-id", name: "图书管理系统" }],
  connections: [
    {
      id: "connection-id",
      name: "我的工具",
      kind: "pat",
      projectIds: ["library-id"],
      createdAt: "2026-01-01",
      expiresAt: "2099-01-01",
      revokedAt: null,
      lastUsedAt: null,
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mcpApi.connections).mockResolvedValue(
    info as Awaited<ReturnType<typeof mcpApi.connections>>,
  );
  vi.mocked(mcpApi.interaction).mockResolvedValue({
    clientName: "外部客户端",
    clientId: "client-id",
  });
});
async function selectConsentProject(name = "图书管理系统") {
  fireEvent.focus(screen.getByRole("combobox", { name: "允许读取的项目" }));
  fireEvent.click(await screen.findByRole("option", { name }));
}
describe("MCP connections", () => {
  it("shows an immediate lightweight notification after copying and reports clipboard failure", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<FloatingAlertProvider><McpConnectionsPanel onNavigate={vi.fn()} /></FloatingAlertProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "复制地址" }));
    expect(screen.queryByRole("button", { name: "刷新状态" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("已复制")).toBeVisible());
    expect(writeText).toHaveBeenCalledWith(info.serverUrl);
    writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(screen.getByRole("button", { name: "复制地址" }));
    await waitFor(() => expect(screen.getByText("复制失败，请手动选择文本复制。")).toBeVisible());
  });
  it("offers unboxed expandable usage examples with a project-name placeholder and no project selector", async () => {
    const user = userEvent.setup();
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    const example = await screen.findByRole("button", { name: "如何根据项目资料开始实现？" });
    expect(screen.getAllByRole("button", { name: /如何/ })).toHaveLength(4);
    expect(screen.queryByRole("combobox", { name: "选择项目" })).not.toBeInTheDocument();
    expect(screen.queryByText("连接概况")).not.toBeInTheDocument();
    expect(example.closest('[data-slot="card"]')).toBeNull();
    expect(example).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "复制案例提示词" })).toBeEnabled();
    expect(screen.getByText(/请通过 UML 平台 MCP 读取项目 某某自己项目/)).toHaveTextContent("本次任务：先总结");
    await user.click(example);
    expect(screen.queryByRole("button", { name: "复制案例提示词" })).not.toBeInTheDocument();
    await user.click(example);
    expect(screen.getByRole("button", { name: "复制案例提示词" })).toBeEnabled();
  });
  it("omits the acceptance note and shows OAuth guidance without a card or alert", async () => {
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    const guidance = await screen.findByText("在客户端发起连接，在打开的平台页面登录并选择项目。没有跳转时可切换个人令牌方式。");
    expect(guidance.closest('[data-slot="card"], [role="alert"]')).toBeNull();
    expect(screen.queryByText("客户端版本仍需实际验收，配置示例不代表已连接。")).not.toBeInTheDocument();
  });
  it("creates an account-wide token without project selection and closes the one-time display", async () => {
    const user = userEvent.setup();
    vi.mocked(mcpApi.createToken).mockResolvedValue({
      token: "once-only-token",
    });
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    await screen.findByLabelText("使用的软件");
    screen.getByRole("combobox", { name: "连接方式" }).focus();
    await user.keyboard("[ArrowDown]");
    await user.click(
      await screen.findByRole("option", { name: "个人令牌" }),
    );
    const create = screen.getByRole("button", { name: "创建 30 天个人令牌" });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText("连接名称"), {
      target: { value: "学生客户端" },
    });
    expect(create).toBeEnabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("允许读取的项目")).not.toBeInTheDocument();
    fireEvent.click(create);
    await waitFor(() =>
      expect(mcpApi.createToken).toHaveBeenCalledWith(
        "学生客户端",
        "test-csrf",
      ),
    );
    expect(await screen.findByLabelText("新令牌（仅展示一次）")).toHaveValue(
      "once-only-token",
    );
    fireEvent.click(screen.getByRole("button", { name: "已保存，关闭展示" }));
    expect(
      screen.queryByLabelText("新令牌（仅展示一次）"),
    ).not.toBeInTheDocument();
  });
  it("allows personal token creation before any projects exist and uses plain authentication labels", async () => {
    const user = userEvent.setup();
    vi.mocked(mcpApi.connections).mockResolvedValue({ ...info, projects: [], connections: [] });
    vi.mocked(mcpApi.createToken).mockResolvedValue({ token: "account-token" });
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    const authentication = await screen.findByRole("combobox", { name: "连接方式" });
    expect(authentication).toHaveTextContent("浏览器授权");
    authentication.focus();
    await user.keyboard("[ArrowDown]");
    await user.click(await screen.findByRole("option", { name: "个人令牌" }));
    fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "我的电脑" } });
    fireEvent.click(screen.getByRole("button", { name: "创建 30 天个人令牌" }));
    await waitFor(() => expect(mcpApi.createToken).toHaveBeenCalledWith("我的电脑", "test-csrf"));
    expect(screen.queryByText("当前没有可授权项目，请先创建或加入项目。")).not.toBeInTheDocument();
  });
  it("describes account-wide connections using the account's accessible project scope", async () => {
    vi.mocked(mcpApi.connections).mockResolvedValue({ ...info, connections: [{ ...info.connections[0], kind: "pat", projectIds: [], projectScope: "account" }] });
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    expect(await screen.findByText("账号可访问的全部项目")).toBeVisible();
  });
  it("displays revoked state after revocation", async () => {
    vi.mocked(mcpApi.revoke).mockResolvedValue({});
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    const revoke = await screen.findByRole("button", { name: "撤销 我的工具" });
    vi.mocked(mcpApi.connections).mockResolvedValue({
      ...info,
      connections: [
        { ...info.connections[0], kind: "pat", revokedAt: "2026-10-08" },
      ],
    });
    fireEvent.click(revoke);
    fireEvent.click(await screen.findByRole("button", { name: "撤销" }));
    await waitFor(() =>
      expect(mcpApi.revoke).toHaveBeenCalledWith("connection-id", "test-csrf"),
    );
    await screen.findAllByText(/已撤销/);
    expect(
      screen.getByRole("button", { name: "撤销 我的工具" }),
    ).toBeDisabled();
  });
  it("consent has no default project selection and does not treat a configured client as verified", async () => {
    render(
      <McpConsentPanel
        onNavigate={vi.fn()}
        interactionId="interaction-id"
      />,
    );
    expect(await screen.findByText("授权给 外部客户端")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "授权读取所选项目" }),
    ).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "允许读取的项目" })).toHaveValue("");
    expect(screen.queryByText("library-id")).not.toBeInTheDocument();
    await selectConsentProject();
    expect(
      screen.getByRole("button", { name: "授权读取所选项目" }),
    ).toBeEnabled();
    expect(mcpApi.consent).not.toHaveBeenCalled();
    expect(screen.getByText("图书管理系统")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "移除 图书管理系统" }));
    expect(screen.getByRole("button", { name: "授权读取所选项目" })).toBeDisabled();
    expect(screen.getByText("至少选择一个项目后才能授权。")).toBeVisible();
  });
  it("preserves interaction when asking the student to log in", async () => {
    vi.mocked(mcpApi.connections).mockRejectedValue(new McpApiError(401));
    const navigate = vi.fn();
    render(
      <McpConsentPanel
        onNavigate={navigate}
        interactionId="interaction-id"
      />,
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/login?redirect=%2Faccount%2Fconnections%3Finteraction%3Dinteraction-id",
      ),
    );
  });
  it("keeps consent loading and failure recovery inside the standalone card", async () => {
    vi.mocked(mcpApi.interaction).mockRejectedValueOnce(new McpApiError(403));
    render(<McpConsentPage onNavigate={vi.fn()} interactionId="interaction-id" />);
    expect(screen.getByRole("status").closest('[data-slot="card"]')).not.toBeNull();
    const retry = await screen.findByRole("button", { name: "重试" });
    expect(screen.getByRole("alert").closest('[data-slot="card"]')).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "允许读取的项目" })).not.toBeInTheDocument();
    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { name: "授权给 外部客户端" })).toBeVisible();
    expect(await screen.findByRole("combobox", { name: "允许读取的项目" })).toHaveValue("");
  });
  it("submits selected projects and keeps cancellation connected to the OAuth interaction", async () => {
    // An invalid redirect avoids navigation in JSDOM while still exercising the actual consent actions.
    vi.mocked(mcpApi.consent).mockResolvedValue({ redirect: "https://invalid.example/" });
    vi.mocked(mcpApi.deny).mockResolvedValue({ redirect: "https://invalid.example/" });
    render(<McpConsentPage onNavigate={vi.fn()} interactionId="interaction-id" />);
    await screen.findByRole("combobox", { name: "允许读取的项目" });
    await selectConsentProject();
    fireEvent.click(screen.getByRole("button", { name: "授权读取所选项目" }));
    await waitFor(() => expect(mcpApi.consent).toHaveBeenCalledWith("interaction-id", ["library-id"], "test-csrf"));
    await waitFor(() => expect(screen.getByRole("button", { name: "取消" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(mcpApi.deny).toHaveBeenCalledWith("interaction-id", "test-csrf"));
  });
  it("searches projects by name and submits multiple selections without displaying project IDs", async () => {
    const user = userEvent.setup();
    vi.mocked(mcpApi.connections).mockResolvedValue({ ...info, projects: [...info.projects, { id: "store-id", name: "商城系统" }] });
    vi.mocked(mcpApi.consent).mockResolvedValue({ redirect: "https://invalid.example/" });
    render(<McpConsentPage onNavigate={vi.fn()} interactionId="interaction-id" />);
    const select = await screen.findByRole("combobox", { name: "允许读取的项目" });
    await user.click(select);
    await user.type(select, "图书");
    expect(screen.getByRole("option", { name: "图书管理系统" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "商城系统" })).not.toBeInTheDocument();
    expect(screen.queryByText("library-id")).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "图书管理系统" }));
    await user.type(select, "不存在的项目");
    expect(screen.getByText("未找到匹配项目")).toBeVisible();
    await user.clear(select);
    await user.click(screen.getByRole("option", { name: "商城系统" }));
    expect(screen.getByRole("button", { name: "移除 商城系统" })).toBeVisible();
    expect(screen.queryByText("store-id")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "授权读取所选项目" }));
    await waitFor(() => expect(mcpApi.consent).toHaveBeenCalledWith("interaction-id", ["library-id", "store-id"], "test-csrf"));
  });
  it("disables project selection when no projects exist and while authorization is pending", async () => {
    vi.mocked(mcpApi.connections).mockResolvedValueOnce({ ...info, projects: [] });
    const first = render(<McpConsentPage onNavigate={vi.fn()} interactionId="interaction-id" />);
    expect(await screen.findByRole("combobox", { name: "允许读取的项目" })).toBeDisabled();
    expect(screen.getByText("当前没有可授权项目，请先创建或加入项目。")).toBeVisible();
    expect(screen.getByRole("button", { name: "授权读取所选项目" })).toBeDisabled();
    first.unmount();
    let finish!: (value: { redirect: string }) => void;
    vi.mocked(mcpApi.consent).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<McpConsentPage onNavigate={vi.fn()} interactionId="interaction-id" />);
    await screen.findByRole("combobox", { name: "允许读取的项目" });
    await selectConsentProject();
    fireEvent.click(screen.getByRole("button", { name: "授权读取所选项目" }));
    expect(screen.getByRole("combobox", { name: "允许读取的项目" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "移除 图书管理系统" })).toBeDisabled();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "移除 图书管理系统" }));
    expect(screen.getByText("图书管理系统")).toBeVisible();
    finish({ redirect: "https://invalid.example/" });
    await screen.findByText("连接操作未完成，请重试。");
  });
  it("feature-off state offers no credential or consent action", async () => {
    vi.mocked(mcpApi.connections).mockResolvedValue({ enabled: false });
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    await screen.findByText("平台暂未开放 MCP 接入。");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("keeps actual client formats distinct without embedding credentials", () => {
    const url = "https://platform.example/api/mcp";
    expect(
      JSON.parse(clientConfiguration("vscode", url, "oauth")).servers[
        "uml-platform"
      ].type,
    ).toBe("http");
    expect(
      JSON.parse(clientConfiguration("qwen", url, "oauth")).mcpServers[
        "uml-platform"
      ].httpUrl,
    ).toBe(url);
    expect(clientConfiguration("codex", url, "pat")).toContain(
      'bearer_token_env_var = "UML_MCP_TOKEN"',
    );
    expect(clientConfiguration("minimax", url, "pat")).toContain(
      "${UML_MCP_TOKEN}",
    );
  });
});
