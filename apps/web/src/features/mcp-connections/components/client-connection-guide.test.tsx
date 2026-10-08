// Verifies CLI examples stay copyable without desktop sections or illustrations.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { ClientConnectionGuide } from "./client-connection-guide";
import { clientGuide } from "../model/client-guides";

const url = "https://platform.example/api/mcp";

describe("ClientConnectionGuide", () => {
  it.each(["qoder", "cursor", "trae"] as const)("shows %s CLI steps and documentation without desktop sections or images", (clientId) => {
    render(<AppI18nProvider><ClientConnectionGuide clientId={clientId} url={url} mode="oauth" onCopy={vi.fn()} /></AppI18nProvider>);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("list")).toBeVisible();
    expect(screen.getByRole("link", { name: "查看客户端说明" })).toHaveAttribute("href", clientGuide(clientId, "cli", url, "oauth", "zh-CN")!.source);
    expect(screen.queryByText(/打开 Qoder IDE Settings|打开 Customize|TraeWork 打开头像/)).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "放大图片" })).not.toBeInTheDocument();
  });

  it("preserves CLI configuration copying and spaces documentation apart from its buttons", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    render(<AppI18nProvider><ClientConnectionGuide clientId="qoder" url={url} mode="oauth" onCopy={onCopy} /></AppI18nProvider>);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByLabelText("客户端配置")).toHaveTextContent(url);
    const copy = screen.getByLabelText("客户端配置").querySelector('button')!;
    const docs = screen.getByRole("link", { name: "查看客户端说明" });
    expect(copy.closest('[data-slot="code-block-header"]')).toBeInTheDocument();
    expect(docs.closest('[data-slot="code-block"]')).toBeNull();
    expect(docs.parentElement).toHaveClass("flex", "flex-wrap", "gap-3");
    await user.click(copy);
    expect(onCopy).toHaveBeenCalledWith(clientGuide("qoder", "cli", url, "oauth", "zh-CN")!.configuration);
    expect(screen.queryByRole("button", { name: "放大图片" })).not.toBeInTheDocument();
  });

  it("styles paths, configuration keys and complete commands as inline code without visible markup", () => {
    render(<AppI18nProvider><ClientConnectionGuide clientId="qoder" url={url} mode="pat" onCopy={vi.fn()} /></AppI18nProvider>);
    const list = screen.getByRole("list");
    expect([...list.querySelectorAll("code")].map((node) => node.textContent)).toEqual(["~/.qoder/settings.json", "mcpServers", "qoder mcp list", "/mcp reload"]);
    expect(list.textContent).not.toContain("`");
    for (const node of list.querySelectorAll("code")) expect(node).toHaveClass("bg-muted", "font-mono", "rounded");
    expect(list).toHaveTextContent("使用个人令牌完成鉴权");
    expect(list).not.toHaveTextContent("选择项目");
    expect(screen.getByText("settings.json")).toHaveAttribute("data-slot", "code-block-filename");
  });

  it("copies the unformatted shell command from the Code Block header", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    render(<AppI18nProvider><ClientConnectionGuide clientId="qoder" url={url} mode="oauth" onCopy={onCopy} /></AppI18nProvider>);
    await user.click(screen.getByLabelText("终端与会话命令").querySelector('button')!);
    expect(onCopy).toHaveBeenCalledWith("qoder mcp list\n/mcp reload");
  });

  it("keeps copying in Code Block headers and omits the standalone command/configuration buttons", () => {
    render(<AppI18nProvider><ClientConnectionGuide clientId="qoder" url={url} mode="oauth" onCopy={vi.fn()} /></AppI18nProvider>);
    expect(screen.queryByRole("button", { name: "复制命令" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制配置示例" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "复制代码" })).toHaveLength(2);
  });

  it("keeps Codex OAuth setup to one add command with automatic authorization discovery", () => {
    const command = clientGuide("codex", "cli", url, "oauth", "zh-CN")!.command!;
    expect(command).toBe(`codex mcp add uml-platform --url "${url}"`);
    expect(command).not.toContain("--oauth-client-registration");
    expect(command).not.toContain("--oauth-resource");
    expect(command).not.toContain("codex mcp login");
    expect(command.split(url)).toHaveLength(2);
    expect(clientGuide("codex", "cli", url, "pat", "zh-CN")!.command).toContain("--bearer-token-env-var UML_MCP_TOKEN");
    expect(clientGuide("codex", "cli", url, "pat", "zh-CN")!.command).not.toContain("--oauth-client-registration");
  });
});
