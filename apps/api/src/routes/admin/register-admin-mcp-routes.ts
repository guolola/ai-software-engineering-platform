// Registers admin-only MCP governance independently from the external protocol feature flag.
import type { FastifyInstance } from "fastify";
import {
  adminMcpQuerySchema,
  adminMcpOverviewSchema,
  adminMcpUsersResponseSchema,
  adminMcpConnectionsResponseSchema,
  adminMcpCallsResponseSchema,
  adminMcpRevokeResponseSchema,
} from "@uml-platform/contracts";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import type { McpStore } from "../../mcp/records/mcp-store.js";
import { requireScopedAdminActor } from "../../admin/admin-session-view.js";
import { recordAdminAction } from "../../admin/admin-route-security.js";
import { createAdminMcpService } from "../../admin/mcp/admin-mcp-service.js";

export function registerAdminMcpRoutes(
  app: FastifyInstance,
  input: { authStore: AuthStore; store: McpStore; enabled: boolean },
) {
  const service = createAdminMcpService(input);
  const routes = [
    ["overview", service.overview, adminMcpOverviewSchema],
    ["users", service.users, adminMcpUsersResponseSchema],
    ["connections", service.connections, adminMcpConnectionsResponseSchema],
    ["calls", service.calls, adminMcpCallsResponseSchema],
  ] as const;
  for (const [path, read, response] of routes) {
    app.get(`/api/admin/mcp/${path}`, async (request, reply) => {
      const actor = await requireScopedAdminActor(request, reply, input.authStore);
      if ("message" in actor) return actor;
      if (!actor.permissions.includes("admin.mcp.read"))
        return reply.code(403).send({ message: "需要 MCP 查看权限" });
      const query = adminMcpQuerySchema.parse(request.query);
      return response.parse(await read(query));
    });
  }
  app.post<{ Params: { id: string } }>(
    "/api/admin/mcp/connections/:id/revoke",
    async (request, reply) => {
      const actor = await requireScopedAdminActor(request, reply, input.authStore);
      if ("message" in actor) return actor;
      if (!actor.permissions.includes("admin.mcp.revoke")) {
        await recordAdminAction(input.authStore, {
          actor,
          action: "admin.mcp.revoke",
          targetType: "mcp_connection",
          targetId: request.params.id,
          outcome: "failure",
          message: JSON.stringify({ code: "permission_denied" }),
        });
        return reply.code(403).send({ message: "需要 MCP 撤销权限" });
      }
      const revoked = await service.revoke(actor, request.params.id);
      if (!revoked) return reply.code(404).send({ message: "MCP 连接不存在" });
      return adminMcpRevokeResponseSchema.parse(revoked);
    },
  );
}
