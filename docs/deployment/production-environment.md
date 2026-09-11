<!-- 汇总生产环境变量分组、保管边界与验证方法。 -->

# 生产环境配置

| 元信息 | 内容 |
| --- | --- |
| 维护状态 | 生产使用 |
| 目标读者 | 后端开发、部署与安全运维人员 |
| 事实来源 | 源码中的环境变量读取、部署脚本与工作流 |

## 概述

生产配置保存在部署目录外的 `shared/production.env`，由部署脚本在启动 PM2 前加载。仓库只记录变量名称和用途，不保存真实值。

## 当前设计或配置

### 基础服务

| 变量 | 用途 |
| --- | --- |
| `NODE_ENV` | 生产环境应为 `production` |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `DATABASE_POOL_MAX` | 数据库连接池上限 |
| `REDIS_URL` | BullMQ 与生成 Worker 使用的 Redis |
| `API_HOST`、`API_PORT` | API 监听地址与端口 |
| `RENDER_SERVICE_URL` | API 调用渲染服务的地址 |
| `PLANTUML_SERVER_URL` | 可选的外部 PlantUML 服务地址 |

### 公网与跨域

| 变量 | 用途 |
| --- | --- |
| `PUBLIC_WEB_BASE_URL` | 对外 Web 根地址 |
| `PUBLIC_API_BASE_URL` | 对外 API 根地址 |
| `API_CORS_ORIGINS` | API 允许的 Web 来源 |
| `RENDER_SERVICE_CORS_ORIGINS` | 渲染服务允许的来源 |

### 邮件、文档与支付

| 变量 | 用途 |
| --- | --- |
| `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE` | SMTP 服务器连接 |
| `SMTP_USER`、`SMTP_PASS`、`SMTP_FROM` | 发信账号、凭据与发件人 |
| `ONLYOFFICE_DOCUMENT_SERVER_URL` | OnlyOffice 对外地址 |
| `ONLYOFFICE_JWT_SECRET` | 与 Document Server 一致的 JWT 密钥 |
| `ONLYOFFICE_ACCESS_TOKEN_SECRET` | 文档访问令牌签名密钥 |
| `ONLYOFFICE_CALLBACK_MAX_BYTES` | 回调体积上限 |
| `UML_DOCUMENT_STORAGE_DIR` | 文档存储目录 |
| `UML_AVATAR_STORAGE_DIR` | 头像存储目录 |
| `EPAY_*` | 支付网关、商户、签名与回调配置 |

### 模型与生成

`UML_PROVIDER_SECRET_KEY` 用于保护供应商凭据；`UML_LLM_*` 控制模型请求并发、超时和重试；`UML_*_STORAGE_DIR` 指定持久化目录。具体可选项以源码读取和部署环境模板为准。

## 操作与维护

- 将文件放在 release 目录之外，并设置为仅部署用户可读写的 `600` 权限。
- 变量变更后通过部署脚本或 PM2 重新加载环境，不在终端历史中直接暴露密钥。
- SMTP 使用专用发信服务与授权凭据，不使用个人邮箱密码。
- 定期轮换供应商、邮件、支付与 OnlyOffice 密钥；变更后完成专项验证。
- 禁用生产环境中的开发回退、演示账号和宽松供应商策略。

## 验证

```bash
test "$(stat -c %a shared/production.env)" = "600"
curl http://127.0.0.1:4001/api/health
curl http://127.0.0.1:4001/api/version
curl http://127.0.0.1:4002/health
```

另外验证注册邮件、模型连通性、文档编辑回调和支付回调。日志只能记录配置是否存在，不能输出密钥值。

## 相关文档

- [宝塔与 PM2 部署](baota-pm2.md)
- [生成任务 Worker](generation-workers.md)
- [OpenAI 兼容供应商](../integrations/openai-compatible-provider.md)
