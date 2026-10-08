// Keeps desktop paths and CLI commands separate, with official sources for each client surface.
import { clientConfiguration, mcpClients, type McpClientId } from "./client-configurations";
export type ClientSurface = "desktop" | "cli";
type Guide = { source: string; steps: string[]; configuration?: string; command?: string; usesConfiguration: boolean };
const sources = {
  codex: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
  claude: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
  qoder: "https://docs.qoder.com/user-guide/chat/model-context-protocol",
  vscode: "https://code.visualstudio.com/docs/agent-customization/mcp-servers",
  cursor: "https://cursor.com/docs/mcp",
  trae: "https://docs.trae.cn/work_remote-mcp-server",
  workbuddy: "https://www.codebuddy.cn/docs/workbuddy/Plugins",
};
export function clientGuide(id: McpClientId, surface: ClientSurface, url: string, mode: "oauth" | "pat", language: string): Guide | null {
  const en = language.startsWith("en");
  const client = mcpClients.find((item) => item.id === id)!;
  const config = clientConfiguration(id, url, mode);
  const authorize = mode === "pat"
    ? en ? "Authenticate with your personal token, then ask the agent to read a project accessible to your account." : "使用个人令牌完成鉴权，再让 Agent 读取账号可访问的项目。"
    : en ? "Authenticate, explicitly select projects on the platform, then ask the agent to read a project." : "发起鉴权，在平台明确选择项目并授权，再让 Agent 读取项目。";
  const guide = (source: string, zh: string[], english: string[], usesConfiguration = false, command?: string, configuration?: string): Guide => ({ source, steps: [...(en ? english : zh), authorize], usesConfiguration, command, configuration });
  if (surface === "desktop") {
    switch (id) {
      case "codex": return guide(sources.codex, ["打开设置 → MCP servers → Add server。", "填写名称，选择 Streamable HTTP，粘贴本页 MCP 地址；保存并 Restart。"], ["Open Settings → MCP servers → Add server.", "Name the server, choose Streamable HTTP, paste this page's MCP address; save and Restart."]);
      case "claude": return guide(sources.claude, ["Claude Desktop 打开 Customize → Connectors → + Add → Add custom connector。", "填写名称与 MCP 地址，按 Continue 检查鉴权；连接器通过 Claude 云端访问地址。"], ["In Claude Desktop, open Customize → Connectors → + Add → Add custom connector.", "Enter a name and MCP address, then Continue to review authentication. Remote connectors access the address from Claude's cloud."]);
      case "vscode": return guide(sources.vscode, ["按 Ctrl / Cmd + Shift + P，运行 MCP: Add Server，选择 HTTP。", "填写地址与服务名，选择配置范围；在 MCP: List Servers 中启动服务。"], ["Press Ctrl / Cmd + Shift + P, run MCP: Add Server, and choose HTTP.", "Enter the address and name, choose a configuration scope, then start it in MCP: List Servers."]);
      case "qoder": return guide(sources.qoder, ["打开 Qoder IDE Settings → MCP → My Servers → + Add。", "在打开的配置编辑器中粘贴以下配置并保存；桌面端此入口仍需编辑配置。"], ["Open Qoder IDE Settings → MCP → My Servers → + Add.", "Paste the configuration below into the editor and save. This desktop flow still uses a configuration editor."], true, undefined, config);
      case "cursor": return guide(sources.cursor, ["打开 Customize → MCPs，管理 MCP 服务。", "自定义地址通过项目 .cursor/mcp.json 或用户 ~/.cursor/mcp.json 配置。"], ["Open Customize → MCPs to manage servers.", "Configure a custom address in .cursor/mcp.json or ~/.cursor/mcp.json."], true, undefined, config);
      case "trae": return guide(sources.trae, ["TraeWork 打开头像 → 设置 → MCP，选择本地或云端环境。", "选择创建 → 手动配置，在弹窗填入以下 HTTP 配置后确认。"], ["In TraeWork, open avatar → Settings → MCP and choose the local or cloud environment.", "Choose Create → Manual configuration, paste the HTTP configuration below, and confirm."], true, undefined, config);
      case "workbuddy": return guide(sources.workbuddy, ["打开 WorkBuddy 插件管理，进入 MCP / 连接器页面。", "添加自定义远程服务，填写 MCP 地址；需要令牌时在客户端凭据表单填写。"], ["Open WorkBuddy plugin management and its MCP / connectors page.", "Add a custom remote server with the MCP address. Enter a token in the client credential form if requested."]);
      default: return null;
    }
  }
  switch (id) {
    case "codex": return guide(sources.codex,
      mode === "pat" ? ["先在终端设置 `UML_MCP_TOKEN`。", "执行以下添加命令，使用环境变量中的个人令牌。"] : ["在终端执行以下添加命令。", "按终端提示打开浏览器登录平台。"],
      mode === "pat" ? ["Set `UML_MCP_TOKEN` in the terminal first.", "Run the add command below using the personal token from the environment."] : ["Run the add command below in a terminal.", "Follow the terminal prompt to sign in to the platform in your browser."], false,
      `codex mcp add uml-platform --url ${JSON.stringify(url)}${mode === "pat" ? " --bearer-token-env-var UML_MCP_TOKEN" : ""}`);
    case "claude": return guide(client.source, ["在项目终端执行添加命令。", "启动 Claude Code，输入 `/mcp` 并选择服务完成鉴权。"], ["Run the add command from your project terminal.", "Start Claude Code and use `/mcp` to authenticate the server."], false,
      mode === "oauth" ? `claude mcp add --transport http uml-platform ${JSON.stringify(url)}\nclaude\n/mcp` : undefined, mode === "pat" ? config : undefined);
    case "qwen": return guide(client.source, ["在终端添加 HTTP 服务。", "启动 `qwen`，在 `/mcp` 中检查服务与鉴权。"], ["Add the HTTP server from your terminal.", "Start `qwen` and inspect the server and authentication in `/mcp`."], false,
      mode === "oauth" ? `qwen mcp add --transport http uml-platform ${JSON.stringify(url)}\nqwen\n/mcp` : undefined, mode === "pat" ? config : undefined);
    case "qoder": return guide(client.source, ["将配置写入 `~/.qoder/settings.json` 的 `mcpServers`。", "终端运行 `qoder mcp list`；会话内使用 `/mcp reload`。"], ["Add the configuration under `mcpServers` in `~/.qoder/settings.json`.", "Run `qoder mcp list`; use `/mcp reload` inside a session."], true, "qoder mcp list\n/mcp reload", config);
    case "kimi": return guide(client.source, ["将以下配置保存为单独的 MCP 配置文件。", "启动 `kimi --mcp-config-file mcp.json`；会话内使用 `/mcp-config login`。"], ["Save the configuration below as a separate MCP configuration file.", "Start `kimi --mcp-config-file mcp.json`; use `/mcp-config login` inside the session."], true, "kimi --mcp-config-file mcp.json\n/mcp-config login", config);
    case "cursor": return guide("https://cursor.com/docs/cli/mcp", ["配置项目 `.cursor/mcp.json` 或用户 `~/.cursor/mcp.json`。", "终端运行 `agent mcp list`；通过 `agent mcp list-tools` 查看工具。"], ["Configure `.cursor/mcp.json` or `~/.cursor/mcp.json`.", "Run `agent mcp list`, then inspect tools with `agent mcp list-tools`."], true, "agent mcp list\nagent mcp list-tools uml-platform", config);
    case "minimax": return guide(client.source, ["在启动目录保存 `.mcp.json`；将令牌存入 `UML_MCP_TOKEN` 环境变量。", "启动 MCode，在 `/mcp` 中检查配置，并发起真实工具调用。"], ["Save `.mcp.json` in the launch directory; set the token in `UML_MCP_TOKEN`.", "Start MCode, inspect `/mcp`, then make a real tool call."], true, "/mcp", config);
    case "deepseek": return guide(client.source, ["在 Harness profile 中配置 MCP client 插件。", "选择 `streamable-http`，使用以下 YAML 配置；从 Harness 发起工具调用。"], ["Configure the MCP client plugin in your Harness profile.", "Use the YAML below with `streamable-http`, then invoke a tool through Harness."], true, undefined, config);
    // TRAE generations use different CLI formats; the desktop JSON must never be presented as CLI YAML/TOML.
    case "trae": return guide("https://docs.trae.cn/cli_model-context-protocol", ["先确认 TraeCode CLI 版本；1.x 使用 `traecli config edit` 编辑 YAML。", "2.x 配置格式不同，请使用本页官方文档入口核对当前版本，再在 `/mcp` 中检查服务。"], ["Check your TraeCode CLI version; 1.x uses `traecli config edit` with YAML.", "2.x uses a different format. Follow the official documentation for your version, then inspect `/mcp`."], false, "/mcp");
    default: return null;
  }
}
