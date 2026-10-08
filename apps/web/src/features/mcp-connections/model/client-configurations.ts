// Keeps product-specific remote HTTP configuration separate from unverified client acceptance claims.
export const mcpClients = [
  {
    id: "deepseek",
    name: "DeepSeek Harness",
    mode: "pat",
    location: "Harness profile 的 MCP 插件配置",
    source:
      "https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md",
  },
  {
    id: "qoder",
    name: "Qoder",
    mode: "oauth",
    location: ".qoder/settings.json 的 mcpServers",
    source: "https://docs.qoder.com/cli/mcp-reference",
  },
  {
    id: "kimi",
    name: "Kimi Code",
    mode: "oauth",
    location: "MCP 配置文件；连接后使用 /mcp-config login",
    source:
      "https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html",
  },
  {
    id: "minimax",
    name: "MiniMax Code",
    mode: "pat",
    location: "项目根目录 .mcp.json",
    source:
      "https://github.com/MiniMax-AI/minimax-code/blob/main/docs/examples.md",
  },
  {
    id: "workbuddy",
    name: "WorkBuddy",
    mode: "manual",
    location:
      "设置 → MCP → 添加自定义服务；请确认当前版本支持远程 HTTP 与鉴权头",
    source:
      "https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide",
  },
  {
    id: "trae",
    name: "TRAE",
    mode: "pat",
    location: "MCP 自定义服务（Code / Work 版本分别验证）",
    source: "https://docs.trae.cn/work_remote-mcp-server",
  },
  {
    id: "qwen",
    name: "Qwen Code",
    mode: "oauth",
    location: ".qwen/settings.json；HTTP 使用 httpUrl 字段",
    source:
      "https://qwenlm.github.io/qwen-code-docs/en/developers/tools/mcp-server/",
  },
  {
    id: "cursor",
    name: "Cursor",
    mode: "oauth",
    location: ".cursor/mcp.json",
    source: "https://cursor.com/docs/mcp",
  },
  {
    id: "vscode",
    name: "VS Code MCP Agent",
    mode: "oauth",
    location: ".vscode/mcp.json；顶层字段为 servers",
    source:
      "https://code.visualstudio.com/docs/agents/reference/mcp-configuration",
  },
  {
    id: "codex",
    name: "Codex",
    mode: "oauth",
    location: "用户配置 config.toml；随后进行 MCP 登录",
    source: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
  },
  {
    id: "claude",
    name: "Claude（Desktop / Code）",
    mode: "oauth",
    location: "项目 .mcp.json；随后在 /mcp 中授权",
    source: "https://code.claude.com/docs/en/mcp",
  },
  {
    id: "minimax-cloud",
    name: "MiniMax Agent（云端）",
    mode: "manual",
    location: "云端版本单独验收，不能沿用 MiniMax Code 的连接结论",
    source: "https://agent.minimax.io/",
  },
] as const;
export type McpClientId = (typeof mcpClients)[number]["id"];
export function clientConfiguration(
  id: McpClientId,
  url: string,
  mode: "oauth" | "pat",
) {
  const bearer = "Bearer <YOUR_PERSONAL_TOKEN>";
  if (id === "deepseek")
    return `- id: uml-platform\n  name: '@deepseek-ai/dsh-mcp-client'\n  config:\n    serverName: uml-platform\n    transport: streamable-http\n    url: ${JSON.stringify(url)}\n    headers:\n      Authorization: ${JSON.stringify(bearer)}`;
  if (id === "workbuddy" || id === "minimax-cloud")
    return `服务地址：${url}\n传输：Streamable HTTP\n鉴权：优先 OAuth；仅支持请求头时使用 Authorization: ${bearer}\n需在实际客户端确认配置入口和支持能力。`;
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
