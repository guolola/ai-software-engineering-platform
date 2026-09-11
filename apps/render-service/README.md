<!-- 说明 PlantUML 渲染服务的运行边界与维护方式。 -->

# PlantUML 渲染服务

## 职责

接收 PlantUML 文本并输出 SVG 等渲染结果，同时通过健康检查报告 Java、Graphviz 和 PlantUML JAR 是否可用。

## 边界

渲染服务只负责语法渲染与运行时诊断，不解释业务模型，也不保存项目数据。API 负责调用它并把结果纳入生成流水线。

## 使用或常用命令

```bash
npm run dev --workspace @uml-platform/render-service
npm run build --workspace @uml-platform/render-service
npm run test --workspace @uml-platform/render-service
```

服务默认监听 `4002`。

## 配置

核心配置包括监听地址、端口、跨域来源和 PlantUML JAR 路径。仓库保留 CI 与部署需要的固定 JAR；Graphviz 和 Java 由运行环境提供。

## 验证

```bash
npm run test:render
curl http://127.0.0.1:4002/health
```

健康响应应为成功状态并表明 JAR 可用。

## 相关文档

- [平台架构](../../docs/architecture/platform-overview.md)
- [宝塔与 PM2 部署](../../docs/deployment/baota-pm2.md)
- [生产环境配置](../../docs/deployment/production-environment.md)
