// Registers SDK v2 tools using JSON Schema adapters, retaining the repository's existing Zod version.
import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import {
  mcpListProjectsInputSchema,
  mcpContextInputSchema,
  mcpArtifactInputSchema,
  mcpUpdatesInputSchema,
  mcpToolResultSchema,
} from "@uml-platform/contracts";
import {
  agentInstructions,
  result,
} from "../context/implementation-context.js";
import { McpAccessError, type McpAccess } from "../auth/mcp-access.js";
import type { McpConnection } from "../records/mcp-store.js";
import { createMcpToolService } from "../tools/tool-service.js";

export function createPlatformMcpServer(
  access: McpAccess,
  principal: McpConnection,
) {
  const server = new McpServer(
    { name: "uml-platform", version: "1.0.0" },
    { instructions: agentInstructions },
  );
  const service = createMcpToolService(access, principal);
  function register<T extends z.ZodTypeAny>(
    name: keyof typeof service,
    schema: T,
    description: string,
    run: (input: z.infer<T>) => ReturnType<typeof service.list_projects>,
  ) {
    server.registerTool(
      name,
      {
        description,
        inputSchema: fromJsonSchema<z.infer<T>>(
          zodToJsonSchema(schema, { $refStrategy: "none" }) as Parameters<
            typeof fromJsonSchema
          >[0],
        ),
        outputSchema: fromJsonSchema(
          zodToJsonSchema(mcpToolResultSchema, {
            $refStrategy: "none",
          }) as Parameters<typeof fromJsonSchema>[0],
        ),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (raw) => {
        const startedAt = Date.now();
        let projectId: string | null = null;
        let outcome: "success" | "failure" = "failure";
        try {
          const input = schema.parse(raw);
          projectId = "projectId" in input ? input.projectId : null;
          await access.refresh(principal);
          if (
            !(await access.store.takeRateLimit(
              `tool:${principal.userId}`,
              120,
              60,
            ))
          )
            throw new McpAccessError(429, "rate_limited");
          const output = await run(input);
          // Validate again before returning private data if membership/grant changed during the read.
          if (projectId) await access.project(principal, projectId);
          else await access.refresh(principal);
          await access.store.touchConnection(principal.id);
          outcome = "success";
          return {
            content: [{ type: "text" as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (error) {
          const code =
            error instanceof McpAccessError
              ? error.code
              : error instanceof z.ZodError
                ? "invalid_arguments"
                : "read_failed";
          const output = result(
            "error",
            "无法读取，请检查参数、连接授权和当前项目权限。",
            { code },
          );
          return {
            isError: true,
            content: [{ type: "text" as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } finally {
          await access.authStore.recordAuditLog({
            actorUserId: principal.userId,
            action: `mcp.${name}`,
            targetType: "project",
            targetId: projectId,
            outcome,
            message: JSON.stringify({
              clientId: principal.clientId,
              connectionId: principal.id,
              durationMs: Date.now() - startedAt,
            }),
          });
        }
      },
    );
  }
  register(
    "list_projects",
    mcpListProjectsInputSchema,
    "搜索已授权项目并分页读取。使用返回的稳定 id，不按名称猜选；无结果时请学生在平台授权项目。",
    service.list_projects,
  );
  register(
    "get_implementation_context",
    mcpContextInputSchema,
    "取得已保存需求、验收条件及分析/设计/测试目录。默认整项目，或 requirementIds/artifactIds 范围及依赖；读完所有分页，合并 manifest。原型生成限制不是本地实现约束。",
    service.get_implementation_context,
  );
  register(
    "get_artifact",
    mcpArtifactInputSchema,
    "按 contextVersion 和产物 contentHash 读取完整 JSON 内容分段。chunk 按 offset 拼接后解析；refresh_required 时重新取得上下文。",
    service.get_artifact,
  );
  register(
    "check_context_updates",
    mcpUpdatesInputSchema,
    "用 .uml-platform.json 中已应用的范围与完整 manifest 检查新增、修改、删除和过期变化；读完所有分页。不要在任务失败时推进已应用版本。",
    service.check_context_updates,
  );
  return server;
}
