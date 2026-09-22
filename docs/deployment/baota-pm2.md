<!-- 说明 main 分支通过 GitHub Actions 发布到宝塔与 PM2 的当前流程。 -->

# 宝塔与 PM2 部署

| 元信息 | 内容 |
| --- | --- |
| 维护状态 | 生产使用 |
| 目标读者 | 部署与运维人员 |
| 事实来源 | `.github/workflows/deploy.yml` 与 `scripts/deploy/baota-pm2-git-deploy.sh` |

## 概述

推送 `main` 后，部署工作流会测试、构建并通过 SSH 在服务器创建按提交 SHA 命名的 release。Web 由 Nginx 托管，API 和 PlantUML 渲染服务由 PM2 管理。

## 当前设计或配置

### GitHub Secrets

| 名称 | 用途 |
| --- | --- |
| `DEPLOY_HOST` | 目标服务器地址 |
| `DEPLOY_USER` | SSH 用户 |
| `DEPLOY_PORT` | SSH 端口 |
| `DEPLOY_SSH_KEY` | SSH 私钥 |
| `DEPLOY_PATH` | 部署根目录，可使用脚本默认值 |

### 目录与进程

部署根目录默认包含 `releases/<sha>`、`current` 软链接和 `shared/production.env`。PM2 进程为 `uml-api` 与 `uml-render-service`；API 监听 `4001`，渲染服务监听 `4002`。

### Nginx

站点根目录指向 `current/apps/web/dist`。`/api/` 原样反向代理到 API，业务页面使用不索引的 `app.html`，首页使用预渲染的 `index.html`；SSE 路径需要关闭代理缓冲并设置足够长的读取超时。

v2 只保留单页营销首页，旧的 `/features`、`/workflow`、`/cases` 和 `/pricing` 返回 404。部署脚本通过 `nginx -T` 定位唯一匹配当前 Web 根目录的站点，只迁移已知的旧营销路由块，保留 TLS 与代理配置。原配置备份到 release 目录的 `nginx-routing-backup.json`，通过 `nginx -t` 后才重载；健康或 SEO 检查失败时同时恢复应用和路由配置。非标准配置会停止部署，需人工核对；可用 `NGINX_BIN` 指定 Nginx 可执行文件。

## 操作与维护

1. 在服务器准备 Node.js 22、Java 21、Graphviz、PM2、PostgreSQL、Redis 和 Nginx。
2. 将生产变量保存在 `shared/production.env`，权限设为 `600`。
3. 在仓库配置五项部署 Secret，推送 `main`。
4. 工作流切换 `current` 后重启 PM2，并自动检查 API 与渲染服务健康状态。
5. 需要回滚时把 `current` 切回已验证的 release，并重新加载同一份外部环境文件后重启进程。

不要把生产环境文件、服务器地址、账号或私钥提交到 Git。

## 验证

```bash
pm2 status
curl http://127.0.0.1:4001/api/health
curl http://127.0.0.1:4001/api/version
curl http://127.0.0.1:4002/health
```

`/api/version` 的 `releaseSha` 应与部署提交一致。公网还应检查首页、`/tutorial`、登录流程和一次完整生成。

路由迁移的本地回归检查为 `node --test scripts/deploy/nginx-marketing-routes.test.mjs`。

## 相关文档

- [生产环境配置](production-environment.md)
- [生成任务 Worker](generation-workers.md)
- [SEO 运维](seo.md)
- [平台架构](../architecture/platform-overview.md)
