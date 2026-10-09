# 平台 MCP 模块

## 职责

为外部 coding agent 提供经用户授权的已保存项目依据。提供四个只读工具、技术栈中立的上下文、实施任务与代码映射契约、独立本地验证器、来源版本、OAuth 与个人令牌。

## 边界

`context/` 提取白名单领域数据、当前项目说明书正文、范围与依赖，并组织实施任务和分发产物；`verification/` 提供无需平台依赖的本地验证器源码，服务器不执行该源码；`tools/` 负责读取及分页；`auth/` 负责协议配置、身份和项目授权；`records/` 负责授权与 OAuth 持久化；`server/` 组装 SDK 和依赖。HTTP 适配在 [`routes/mcp/`](../routes/mcp/register-mcp-routes.ts)，合同在 [`packages/contracts/src/mcp/`](../../../../packages/contracts/src/mcp/index.ts)。

不导入前端状态、不使用原型生成提示、不读取供应商密钥，不启动 LLM 或代码流水线。工具没有本地文件写入能力；本地关联文件由 agent 自己维护。

### 映射与一致性验证

以 `taskId` 关联需求、设计元素、实际代码、测试与来源版本。目前是任务级多对多登记，尚无设计元素到代码符号的逐对绑定。现有本地验证器核对引用、文件哈希，并在显式启用 `--run-checks` 后执行登记命令；自定义一致性算法可通过 `checks` 接入，逐规则结果和算法版本仍需后续扩展。

参见[中文 README 映射图](../../../../readme-zh-cn.md#需求设计与代码映射)、[借阅映射示例](../../../../docs/integrations/coding-agent-mcp.md#映射示例与证据边界)与[一致性算法接入](../../../../docs/integrations/coding-agent-mcp.md#接入自定义一致性算法)。

## 使用或常用命令

从仓库根目录运行 `npm run build:contracts`、`npm run build:api`。针对性测试运行 `npx tsx --test apps/api/src/mcp/context/implementation-context.test.ts apps/api/src/mcp/records/postgres-mcp-store.test.ts apps/api/src/routes/mcp/register-mcp-routes.test.ts`。

## 配置

默认关闭。通过 `MCP_ENABLED=true` 注册 `/api/mcp` 与 OAuth/发现入口。生产复用 PostgreSQL，所有实例共用 `MCP_PUBLIC_ORIGIN`、`MCP_SHARED_SECRET`、`MCP_JWKS`；预注册客户端和 CIMD 可信源按部署设置。详见[集成文档](../../../../docs/integrations/coding-agent-mcp.md)。

## 验证

工具和 OAuth 集成测试使用真实 SDK 与授权组件；数据库测试执行实际 PostgreSQL SQL。UI、部署路由、契约分别有测试。正式客户端名单必须依据实际版本验收，不能由配置示例推导。生产开关、反向代理和真实代码生成仍需部署环境验收。

## 相关文档

- [Coding Agent MCP 接入](../../../../docs/integrations/coding-agent-mcp.md)
- [共享契约](../../../../packages/contracts/src/mcp/index.ts)
