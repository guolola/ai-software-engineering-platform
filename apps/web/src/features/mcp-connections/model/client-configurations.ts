// Keeps product-specific remote HTTP configuration separate from unverified client acceptance claims.
export const mcpClients = [
  {
    id: "deepseek",
    name: "DeepSeek Harness",
    mode: "pat",
    location: "桌面 profile 的 ~/.dsh/profiles/desktop/cordis.patch.yml",
    source:
      "https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md",
  },
  {
    id: "qoder",
    name: "Qoder",
    mode: "oauth",
    location: "Extensions → Connectors → Add Connector → Add custom MCP",
    source: "https://docs.qoder.com/qoder/connectors",
  },
  {
    id: "kimi",
    name: "Kimi Code",
    mode: "pat",
    location: "桌面端 ~/.kimi-code/mcp.json 或项目 .kimi-code/mcp.json",
    source:
      "https://www.kimi.com/code/docs/en/kimi-code-desktop/settings-and-extensions.html",
  },
  {
    id: "minimax",
    name: "MiniMax Code",
    mode: "pat",
    location: "插件管理 → MCP Servers；~/.minimax/mcp.json",
    source:
      "https://agent.minimax.io/docs/code/agents/mcp",
  },
  {
    id: "workbuddy",
    name: "WorkBuddy",
    mode: "oauth",
    location: "插件 → MCP 服务器 → 配置 MCP；~/.workbuddy/mcp.json",
    source:
      "https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide",
  },
  {
    id: "trae",
    name: "TRAE",
    mode: "oauth",
    location: "TRAE IDE 设置 → MCP → 添加 → 手动添加",
    source: "https://docs.trae.cn/ide_add-mcp-servers",
  },
  {
    id: "qwen",
    name: "Qwen Code",
    mode: "oauth",
    location: "桌面端 ~/.qwen/settings.json 或项目 .qwen/settings.json",
    source:
      "https://github.com/QwenLM/qwen-code/blob/main/packages/desktop/README.md",
  },
  {
    id: "cursor",
    name: "Cursor",
    mode: "oauth",
    location: "Cursor 桌面端 .cursor/mcp.json 或 ~/.cursor/mcp.json",
    source: "https://cursor.com/docs/mcp",
  },
  {
    id: "vscode",
    name: "VS Code MCP Agent",
    mode: "oauth",
    location: "VS Code 命令面板 → MCP: Add Server",
    source:
      "https://code.visualstudio.com/docs/agent-customization/mcp-servers",
  },
  {
    id: "codex",
    name: "Codex",
    mode: "oauth",
    location: "Codex 桌面应用设置中的 MCP 服务管理",
    source: "https://learn.chatgpt.com/docs/developer-settings",
  },
  {
    id: "claude",
    name: "Claude",
    mode: "oauth",
    location: "Customize → Connectors → Add custom connector",
    source: "https://claude.com/docs/connectors/custom/add-unlisted",
  },
  {
    id: "minimax-cloud",
    name: "MiniMax Agent",
    mode: "manual",
    location: "MiniMax Agent 网页端；自定义 MCP 接入方式尚待官方确认",
    source: "https://agent.minimax.io/",
  },
] as const;
export type McpClientId = (typeof mcpClients)[number]["id"];

// Only offer authentication modes documented for the selected product's default surface.
export function clientAuthModes(id: McpClientId): readonly ("oauth" | "pat")[] {
  if (id === "deepseek" || id === "minimax") return ["pat"];
  if (id === "kimi") return ["pat", "oauth"];
  if (id === "qoder" || id === "workbuddy") return ["oauth"];
  if (id === "minimax-cloud") return [];
  return ["oauth", "pat"];
}

export function clientConfiguration(
  id: McpClientId,
  url: string,
  mode: "oauth" | "pat",
) {
  const bearer = "Bearer <YOUR_PERSONAL_TOKEN>";
  if (id === "deepseek")
    return `- insert:\n    - id: uml-platform\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: uml-platform\n        transport: streamable-http\n        url: ${JSON.stringify(url)}\n        headers:\n          Authorization: ${JSON.stringify(bearer)}`;
  // MiniMax Agent has no verified custom remote MCP configuration to copy.
  if (id === "minimax-cloud") return "";
  if (id === "codex")
    return `[mcp_servers.uml_platform]\nurl = ${JSON.stringify(url)}${mode === "pat" ? '\nbearer_token_env_var = "UML_MCP_TOKEN"' : ""}`;
  const entry: Record<string, unknown> =
    id === "qwen"
      ? { httpUrl: url }
      : {
          ...(id === "cursor" || id === "kimi" || id === "trae"
            ? {}
            : { type: "http" }),
          url,
        };
  if (mode === "pat") {
    if (id === "kimi") entry.bearerTokenEnvVar = "UML_MCP_TOKEN";
    else
      entry.headers = {
        Authorization: id === "minimax" ? "Bearer ${UML_MCP_TOKEN}" : bearer,
      };
  }
  if (mode === "oauth" && id === "qoder")
    entry.oauth = { enabled: true, scopes: ["mcp:read"] };
  return JSON.stringify(
    { [id === "vscode" ? "servers" : "mcpServers"]: { "uml-platform": entry } },
    null,
    2,
  );
}
export const projectAgentPrompt = (projectId: string, language = "zh-CN") =>
  language.startsWith("en") ?
  `Read saved requirements, analysis, design and tests for project ${projectId} through the UML platform MCP. Inspect the current repository first, implement according to my technical requirements and report missing or conflicting sources. Read all catalog pages and artifact chunks. Run tests and report actual results. Use your file tools to maintain .uml-platform.json at the repository root with only the server URL, project ID, implementation scope and applied source versions. Never save credentials or requirement contents there. Check source changes before future edits and preserve existing code.` :
  `请通过 UML 平台 MCP 读取项目 ${projectId} 的已保存需求、分析与设计。先检查当前仓库，依据我的技术要求实现功能，指出缺失或冲突，不继承平台原型限制。读完目录分页和相关产物分段，完成后运行测试，报告实际结果。用你的文件工具在根目录维护 .uml-platform.json，只记录服务地址、项目标识、实现范围和已应用来源版本；不保存令牌或需求正文。以后修改先检查来源变化，保留我已有的代码。`;
