<!-- 维护外部 coding agent 的只读 MCP 合同、授权配置和可复现验收边界。 -->
# Coding Agent MCP 接入

| 元信息 | 内容 |
| --- | --- |
| 维护状态 | 首版实现；生产默认关闭；客户端版本验收待完成 |
| 目标读者 | 平台维护者、集成人员与测试人员 |
| 事实来源 | [MCP 模块](../../apps/api/src/mcp/README.md)、[共享契约](../../packages/contracts/src/mcp/index.ts)、[协议测试](../../apps/api/src/routes/mcp/register-mcp-routes.test.ts)、下列官方客户端说明 |

## 概述

学生在自己的 coding agent 中读取平台已保存的需求、分析模型、设计模型及已有测试，再由 agent 编辑本地代码、运行和测试。首版没有写回工具，不调用平台 LLM，不启动代码原型生成流水线。学生明确提出的 React、Java、Python 等技术要求会保留，代码原型的运行环境、依赖、模拟数据和仅前端限制不进入上下文。

MCP 主体在 `apps/api/src/mcp/`，HTTP 入口在 `apps/api/src/routes/mcp/`，对外契约在 `packages/contracts/src/mcp/`。与 API 共用进程和端口，不需要独立服务或本地代理。

## 当前设计或配置

### 协议和工具

SDK 固定为 `@modelcontextprotocol/server` 2.3.1、`@modelcontextprotocol/node` 2.1.1；通过 JSON Schema 适配已有 Zod 3。HTTP 地址为公共站点的 `/api/mcp`，同时支持 SDK v2 当前协议与无会话的旧版 HTTP 协议。旧版 GET/DELETE 返回 405，不提供旧 SSE 独立入口。

| 工具 | 读取行为 |
| --- | --- |
| `list_projects` | 搜索、分页；OAuth 和指定项目令牌取成员权限与项目授权的交集，账号范围个人令牌读取当前可访问的全部项目；同名项目须按稳定 ID 选择 |
| `get_implementation_context` | 整项目或需求/产物 ID 范围，返回依赖目录、需求和验收依据、缺失项、确认状态与本页版本清单 |
| `get_artifact` | 带范围、上下文版本与产物内容哈希读取 JSON 分段，包括完整模型、源码、追踪及已有测试 |
| `check_context_updates` | 比较原范围和完整已应用清单，分页报告新增、修改、删除和过期状态变化 |

输出同时含结构化结果和 JSON 文本，便于只读取文字的客户端使用。工具没有模型、框架或供应商参数。目录中短产物直接内联，大产物须继续读取；`remaining`、`nextCursor`、`nextOffset` 明确表示未读部分。`chunk` 的 offset/length 单位为 UTF-16 code unit，顺序拼接后再解析 JSON，不逐块解析。

### 来源和版本

- 服务端已保存工作区是唯一正文来源。前端未保存修改不可见；运行记录不会覆盖工作区，也不声称已核验历史运行出处。
- 只允许领域契约字段通过，供应商配置、任务快照、原型代码与完整工作区均不输出。可行性资料中用户保存的实施环境等约束单独提供，候选实施技术方案标为待确认建议。
- 稳定产物标识包括阶段与原记录键；同图种多模型保留各自身份。追踪不唯一时保留依赖候选，无法推导的来源保留未知。
- `contentHash` 是正文、追踪和确认信息的 SHA-256；`inputFingerprint` 使用现有保存指纹判断上游过期。缺失、旧格式和无法核验的指纹不补写为有效。依赖过期向下游传播。
- 同轮请求使用相同 `scope`、`contextVersion`。翻页令牌绑定用户、授权和范围；相关内容变化返回 `refresh_required`。界面标签、进度和 SVG 重绘不构成正文变化。
- 目录 `manifest` 是本页清单；须合并所有页。未完成读取不能当作已应用全部依据。没有历史全文读取接口。
- 生成成功不等于学生确认。手动修改后源码可能冲突；即使同时存在模型与源码，也不自动声称语义一致。

### 授权及存储

OAuth 使用固定版本 `oidc-provider` 9.12.2 的授权码与 PKCE；资源为公共 `/api/mcp`，签发方为公共 `/api/mcp/oauth`。访问令牌有效期 10 分钟，授权与刷新令牌上限 30 天并轮换刷新令牌。OAuth 每次新授权都要求学生明确选择项目。连接页面创建的个人令牌默认 30 天，按账号当前权限读取全部可访问项目，包括之后创建或加入的项目；无需勾选项目。明文只在创建响应中出现，数据库保存摘要。

创建个人令牌时省略 `projectIds` 表示账号范围；存储记录使用 `kind=pat` 且 `projectIds=[]` 表达该范围，管理接口返回 `projectScope=account`。显式提供非空项目列表的接口请求与原有令牌保持指定项目范围；OAuth 的空项目授权仍不允许。账号范围令牌仍在每次读取时检查账号状态、有效期、撤销、成员权限和项目状态。

支持预注册客户端、CIMD 和 DCR。未配置可信源时，发现元数据不声明 CIMD 支持，客户端可自动选择 DCR；无需在默认 Codex 添加命令中强制指定注册方式。CIMD 仅从管理员配置的可信 HTTPS 源获取；组件阻止私网获取与重定向，回调须 HTTPS 或 loopback HTTP，不接收任意协议回调。DCR 限流，不能扩展为写入权限。CIMD 不在白名单的客户端可以使用 DCR、预注册或个人令牌。

迁移 `029_mcp_authorization` 新增 `mcp_connections`、`mcp_oauth_entities`、`mcp_rate_limits`。所有 API 实例共享 PostgreSQL、签名密钥和公共 URL；无需黏性会话。授权范围与当下用户状态、成员身份和项目状态取交集，撤销记录后立即拒绝后续请求。原子消费防止多实例重复使用授权码/刷新凭据。

### 环境变量

| 名称 | 用途 |
| --- | --- |
| `MCP_ENABLED` | 只有 `true` 才注册外部入口；默认关闭 |
| `MCP_PUBLIC_ORIGIN` | 外部实际访问的公共源，例如 `https://platform.example`，生产须 HTTPS |
| `MCP_WEB_ORIGIN` | 平台登录与授权页面的公共源，默认采用显式配置的公共源；未配置地址的开发环境使用 `http://localhost:4003`；建议同源部署 |
| `MCP_SHARED_SECRET` | 至少 32 字符随机密钥，供签名 cookie、CSRF 与分页使用；实例间一致 |
| `MCP_JWKS` | JSON 私有签名 JWK 集，生产必填；保存到部署密钥环境，不提交仓库 |
| `MCP_OAUTH_CLIENTS` | 预注册客户端 JSON 数组，默认空；字段使用组件标准客户端元数据 |
| `MCP_CIMD_ORIGINS` | 逗号分隔的受信任 CIMD HTTPS 源，默认空；只允许核验过的客户端来源 |
| `DATABASE_URL` | 复用 API PostgreSQL；生产启用 MCP 时必须提供 |

开发环境可使用临时密钥和内存存储，重启后授权失效；生产缺少持久化或签名配置会拒绝启动。所有实例通过 PM2 的 `mcpEnv` 获取同一配置。`API_CORS_ORIGINS` 应覆盖实际平台 Web 源；无需为本地 CLI 放开任意浏览器源。

发现路径包含 `/.well-known/oauth-protected-resource/api/mcp`、`/.well-known/oauth-authorization-server/api/mcp/oauth` 和 `/.well-known/openid-configuration/api/mcp/oauth`；兼容签发方路径下的发现地址。Next 开发代理和 Nginx 模板均将这些请求送往 API，不能回退到网页 HTML。现有部署的 Nginx 迁移也会补充窄范围发现代理。

## 操作与维护

本地 PostgreSQL 演示验收使用 `npm run dev:postgres:demo`，首次使用须安装项目依赖并启动 Docker Desktop（或已有兼容的数据库与文档服务）。命令检查并启动所需服务，显式开启 MCP，固定网页与授权入口为 `http://localhost:3000`，MCP 地址为 `http://localhost:3000/api/mcp`，由 Next 转发到本地 API 的 4101 端口，图形渲染固定使用 4002 端口。

启动前会检查 3000、4101、4002 的 IPv4/IPv6 端口占用；发现旧服务或其他程序时直接报错退出，不自动结束进程。请先在原开发终端按 Ctrl+C 停止服务再重试。启动后会实际检查网页、API 转发、图形渲染、MCP/OAuth 发现及连接管理鉴权，全部通过才输出 `[demo] 启动成功`。检查超时或子服务异常退出时停止本次启动的开发服务；数据库和文档容器保留。正常使用时保留终端，退出使用 Ctrl+C。单独刷新网页或热更新不会改变旧进程的环境变量；普通启动与生产部署仍需显式配置 MCP 开关。

API 开发进程使用 Node 自带文件监听，通过 `tsx` 加载 TypeScript，修改源文件后自动重启。演示命令同时设置已有的 `UML_API_AUTOSTART` 开关，显式触发 API 入口启动。

1. 配置持久化、公共地址、共享随机密钥和私有签名 JWK 集；首次开通先在隔离环境验收。为需要预注册或 CIMD 的客户端配置准确的元数据及可信源。
2. 构建 API/Web，运行迁移，应用仓库 Nginx 迁移。确认 MCP 的 `Host` 传到 API 时仍与公共源一致；不同端口的反向代理需保留原 Host。
3. 学生进入项目列表侧栏 → Coding Agent，复制 MCP 地址和对应客户端示例。OAuth 从客户端发起后返回平台登录，选择项目并授权；个人令牌方式填写名称即可创建，读取范围遵循账号当前项目权限。
4. 项目设置提供带项目 ID 的指引。先让 agent 检查本地仓库，再读取目录、所需分段，实施并测试。资料中的命令或索取凭据不是服务指令。
5. agent 自行维护根目录 `.uml-platform.json`，字段仅为 `version: 1`、`serverUrl`、`projectId`、`scope`、`appliedManifest`。不能放入令牌、密码或正文。成功应用后推进对应版本，失败/中断保留原基线。
6. 下次开发调用更新检查；保留学生已有修改。局部实现只更新已实际应用的产物，不能直接把整项目清单记为完成。
7. 在连接记录中检查最近使用、到期时间和授权项目，撤销不用的连接。工具审计记录用户、客户端、项目、工具、耗时和结果；OAuth 记录端点结果，不记录令牌或需求正文。
8. 维护时清理已过期的 `mcp_oauth_entities` 和 `mcp_rate_limits`，依据平台审计保留策略清理旧连接记录。备份授权表及密钥，签名密钥轮换时保留仍在使用的旧公钥。
9. 停止外部接入：设置 `MCP_ENABLED=false` 并重启所有 API 实例。只停一个实例不足以停止整个集群。需要彻底撤销时同时撤销授权记录，避免重新开启后恢复尚未到期的授权。

### 客户端配置与验收范围

账号页面为下列客户端分别提供配置。OAuth 为有文档支持的客户端首选；文档只确认请求头方式时提供 PAT。所有产品的实际版本、工具调用和编码效果仍须分别验收，不能把下表当作正式支持名单。

| 产品形态 | 首选配置 | 依据 | 本平台实测 |
| --- | --- | --- | --- |
| DeepSeek Harness 本地 | Streamable HTTP 插件 + Bearer | [官方 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md) | 待验证具体版本与四工具 |
| Qoder CLI | `mcpServers` + `type: http` + OAuth | [官方参考](https://docs.qoder.com/cli/mcp-reference) | 待验证；IDE 形态另测 |
| Kimi Code CLI | URL + OAuth，或环境变量 Bearer | [官方文档](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html) | 待验证 |
| MiniMax Code 本地 | `.mcp.json` + HTTP + 环境变量请求头 | [官方示例](https://github.com/MiniMax-AI/minimax-code/blob/main/docs/examples.md) | 待验证 |
| WorkBuddy | 设置中的自定义 MCP，先确认远程 HTTP 与鉴权头能力 | [官方指南](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide) | 待验证能力和版本 |
| TRAE Code / Work | URL + 请求头；产品形态分开验证 | [官方远程 MCP 说明](https://docs.trae.cn/work_remote-mcp-server) | 待验证 |
| Qwen Code | `httpUrl` + OAuth | [官方文档](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/mcp-server/) | 待验证 |
| Cursor 桌面 | `mcpServers` + URL + OAuth | [官方文档](https://cursor.com/docs/mcp) | 待验证；云端另测 |
| VS Code MCP Agent | 顶层 `servers` + `type: http` | [官方参考](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) | 待验证 |
| Codex CLI / 桌面 | TOML 的 `mcp_servers`，OAuth 或 `bearer_token_env_var` | [官方文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) | 待验证具体版本 |
| Claude Code | `.mcp.json` 的 HTTP 服务 + OAuth | [官方文档](https://code.claude.com/docs/en/mcp) | 待验证 |
| MiniMax Agent 云端 | 云端连接器能力单独确认 | [产品入口](https://agent.minimax.io/) | 待验证，不复用本地结论 |

## 验证

自动化测试覆盖契约、明确技术栈保留、生成器配置排除、多模型身份、依赖循环、保存的确认状态、分段重组、UI 状态变化、上游过期、版本冲突、用户与分页隔离、令牌撤销和过期、OAuth PKCE 登录/刷新/撤销、DCR 与发现 JSON。官方 SDK v2 客户端完成四工具调用并检测图书借阅上限从 5 改为 8 的来源变化。

PostgreSQL 适配器测试在隔离的 PGlite PostgreSQL 引擎中执行真实迁移 SQL，验证共享存储、并发消费、到期和导出重载后的持久化；这不替代生产 PostgreSQL 集群和真实反向代理验收。前端测试覆盖 OAuth 默认不勾选项目、个人令牌无需项目选择、提交守卫、登录返回、一次性令牌展示和撤销。协议测试覆盖账号范围令牌读取后续创建的项目、空项目账号创建令牌、跨账号隔离及成员权限变化。

验证命令：`npm run test:contracts`、`npm run test:api`、`npm run test:web`、`npm run typecheck:web`、`npm run build:api`、`npm run build:web`、`npm run test:deploy`、`npm run audit:architecture`、`npm run audit:docs`。开发者可先按对应文件运行针对性测试。Web 脚本可能重建文档生成文件，执行前保留已有工作区改动。

演示启动检查使用 `node --test scripts/dev/*.test.mjs`，覆盖数据库复用、端口冲突、MCP 未开启、发现路径返回 HTML、授权地址不匹配及启动超时。启动成功只表示平台入口就绪，真实客户端授权和四工具调用仍需单独验收。

正式开放前还需记录每个真实客户端版本、产品形态、鉴权方式、四工具结果；完成空目录 Spring Boot + Vue + MySQL 图书管理项目、已有仓库借阅归还增量开发、5 本改 8 本的代码与测试更新，以及非 JavaScript 技术栈任务。上述真实客户端和真实生成代码验收尚未完成；协议通过不等于生成代码正确。客户端验收完成后再将对应版本加入正式支持名单。

## 相关文档

- [MCP 模块说明](../../apps/api/src/mcp/README.md)
- [平台架构](../architecture/platform-overview.md)
- [生产环境配置](../deployment/production-environment.md)
- [官方 SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
- [OAuth 组件](https://github.com/panva/node-oidc-provider)
