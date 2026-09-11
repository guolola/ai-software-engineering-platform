# 软件工程实践平台

面向软件工程课程与项目实践的全流程平台，将需求、可行性分析、UML、设计、原型、测试和说明书组织成可追踪的交付链路。

## 项目简介

本仓库采用 TypeScript monorepo，包含 Web 应用、API、PlantUML 渲染服务、共享契约与测试工具。平台强调“先确认上游事实，再生成下游产物”，并通过任务记录、覆盖关系和追踪矩阵保留生成证据。

## 在线访问

- 平台入口：[jianglisoftware.com](https://jianglisoftware.com)
- 使用手册：[在线教程](https://jianglisoftware.com/tutorial)
- 服务状态：[健康检查](https://jianglisoftware.com/api/health)

## 核心能力

- 需求录入、规则确认、质量检查与基线管理
- 可行性分析、系统环境图、实施方案与报告
- 需求 UML、设计模型、PlantUML/SVG 渲染与人工修订
- 需求到设计、测试和文档的追踪与覆盖检查
- React 代码原型生成、预览和质量诊断
- 测试用例、需求规格说明书和软件设计说明书生成
- 项目成员、生成任务、运行历史、模型供应商与权益管理

## 界面预览

### 平台首页

![平台首页](docs/images/readme-homepage.png)

### 项目首页

![项目首页](docs/images/readme-project-home.png)

### 需求工作台

![需求工作台](docs/images/readme-requirements-workbench.png)

### 可行性分析

![可行性分析](docs/images/readme-feasibility.png)

### 代码原型

![代码原型](docs/images/readme-code-prototype.png)

### 文档交付

![文档交付](docs/images/readme-documents.png)

## 技术架构

| 区域 | 技术与职责 |
| --- | --- |
| `apps/web` | React、Vite；页面、功能、实体、服务与共享 UI |
| `apps/api` | Fastify；路由、生成流水线、记录存储、外部适配器与文档组装 |
| `apps/render-service` | PlantUML 渲染与健康检查 |
| `packages/contracts` | 前后端共享类型与接口契约 |
| `packages/prompts` | 生成提示与结构约束 |
| `packages/harness-*` | 端到端验证与质量评估 |

生产环境使用 PostgreSQL、Redis/BullMQ、PM2、Nginx 和可选的 OnlyOffice Document Server。详细边界见[平台架构](docs/architecture/platform-overview.md)。

## 快速开始

准备 Node.js 22、npm 10、Java 21、Graphviz，并在需要在线编辑文档时启动 Docker Desktop。

```bash
git clone <repository-url>
cd uml-experimental-platform
npm ci
npm run dev
```

本地默认入口通常为 `http://localhost:5173`。完整开发命令会启动 Web、API、渲染服务，并检查本地 OnlyOffice；安全开发配置下 API 使用 `4101`，渲染服务使用 `4002`，OnlyOffice 使用 `8080`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动完整本地开发环境 |
| `npm run build` | 构建共享包和全部应用 |
| `npm run build:web:production` | 按生产站点配置构建 Web |
| `npm run test:web` | 运行 Web 测试 |
| `npm run test:api` | 运行 API 测试 |
| `npm run typecheck:web` | 检查 Web 类型 |
| `npm run audit:architecture` | 检查架构边界 |
| `npm run audit:docs` | 检查文档命名、结构、链接与仓库杂物 |

## 文档导航

- [文档索引](docs/README.md)
- [平台架构](docs/architecture/platform-overview.md)
- [可信生成链路](docs/architecture/trusted-generation.md)
- [宝塔与 PM2 部署](docs/deployment/baota-pm2.md)
- [生产环境配置](docs/deployment/production-environment.md)
- [模型供应商集成](docs/integrations/openai-compatible-provider.md)
- [仓库治理规范](docs/development/repository-hygiene.md)

## 授权

本项目不是开源软件。版权及其他权利均由权利人保留，详情见 [LICENSE](LICENSE)。
