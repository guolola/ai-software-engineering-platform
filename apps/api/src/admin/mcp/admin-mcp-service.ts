// Projects retained MCP authorization and tool audits into secret-free admin read models.
import {
  adminMcpTools,
  type AdminMcpQuery,
  type AdminMcpCall,
  type AdminMcpConnection,
  type AdminMcpUser,
} from "@uml-platform/contracts";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import type { McpStore } from "../../mcp/records/mcp-store.js";
import { hasAccountProjectScope } from "../../mcp/records/mcp-store.js";
import type { AdminActor } from "../../security/admin-guard.js";
import { recordAdminAction } from "../admin-route-security.js";

const toolActions = new Map(adminMcpTools.map((tool) => [`mcp.${tool}`, tool]));
const governanceActions = new Set([
  "mcp.authorize",
  "mcp.create_pat",
  "mcp.revoke",
  "admin.mcp.revoke",
]);
const latest = (dates: Array<string | null>) =>
  dates
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1) ?? null;
function metadata(message: string | null | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(message ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
const textField = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;
const timeMatches = (createdAt: string, q: AdminMcpQuery) =>
  (!q.from || Date.parse(createdAt) >= Date.parse(q.from)) &&
  (!q.to || Date.parse(createdAt) <= Date.parse(q.to));
function page<T>(rows: T[], q: AdminMcpQuery, generatedAt: string) {
  return {
    generatedAt,
    total: rows.length,
    page: q.page,
    pageSize: q.pageSize,
    rows: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
  };
}
export function createAdminMcpService(input: {
  authStore: AuthStore;
  store: McpStore;
  enabled: boolean;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  async function snapshot(q: AdminMcpQuery) {
    const [rawConnections, users, projects, logs] = await Promise.all([
      input.store.listAdminConnections(),
      input.authStore.listUsers(),
      input.authStore.listProjects(),
      input.authStore.listAuditLogs(),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const connectionMap = new Map(rawConnections.map((c) => [c.id, c]));
    const generatedAt = now().toISOString();
    const userFields = (userId: string | null) => ({
      userId,
      userName: userId ? (userMap.get(userId)?.displayName ?? null) : null,
      userEmail: userId ? (userMap.get(userId)?.email ?? null) : null,
    });
    const calls: AdminMcpCall[] = logs.flatMap((log) => {
      const tool = toolActions.get(log.action);
      if (!tool) return [];
      const meta = metadata(log.message);
      const connectionId = textField(meta.connectionId);
      const connection = connectionId ? connectionMap.get(connectionId) : undefined;
      const projectId = log.targetType === "project" ? log.targetId : null;
      return [
        {
          id: log.id,
          ...userFields(log.actorUserId),
          connectionId,
          connectionName: connection?.name ?? null,
          clientId: textField(meta.clientId) ?? connection?.clientId ?? null,
          clientName: connection
            ? connection.kind === "pat"
              ? "个人令牌"
              : connection.name
            : null,
          tool,
          projectId,
          projectName: projectId ? (projectMap.get(projectId)?.name ?? null) : null,
          createdAt: log.createdAt,
          outcome: log.outcome,
          durationMs:
            typeof meta.durationMs === "number" &&
            Number.isFinite(meta.durationMs) &&
            meta.durationMs >= 0
              ? meta.durationMs
              : null,
        },
      ];
    });
    const accountProjectUsers = new Set<string>();
    if (q.projectId) {
      // Account-wide PAT scope follows live memberships, never an empty stored project list.
      for (const userId of new Set(
        rawConnections.filter(hasAccountProjectScope).map((c) => c.userId),
      )) {
        if ((await input.authStore.listProjectsForUser(userId)).some((p) => p.id === q.projectId))
          accountProjectUsers.add(userId);
      }
    }
    const connections: AdminMcpConnection[] = rawConnections.map((c) => ({
      id: c.id,
      ...userFields(c.userId),
      clientId: c.clientId,
      clientName: c.kind === "pat" ? "个人令牌" : c.name,
      name: c.name,
      kind: c.kind,
      projectScope: hasAccountProjectScope(c) ? "account" : "selected",
      projects: c.projectIds.map((id) => ({ id, name: projectMap.get(id)?.name ?? null })),
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
      revokedAt: c.revokedAt,
      lastUsedAt: c.lastUsedAt,
      status: c.revokedAt
        ? "revoked"
        : Date.parse(c.expiresAt) <= Date.parse(generatedAt)
          ? "expired"
          : userMap.get(c.userId)?.status !== "active"
            ? "user_disabled"
            : "active",
      activities: logs
        .filter(
          (log) =>
            governanceActions.has(log.action) &&
            log.targetType === "mcp_connection" &&
            log.targetId === c.id,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .map((log) => ({
          id: log.id,
          action: log.action,
          actorUserId: log.actorUserId,
          createdAt: log.createdAt,
          outcome: log.outcome,
        })),
    }));
    const matchesSearch = (values: Array<string | null>) =>
      !q.q || values.join(" ").toLocaleLowerCase().includes(q.q.toLocaleLowerCase());
    const matchingConnections = connections.filter(
      (c) =>
        (!q.userId || c.userId === q.userId) &&
        (!q.connectionId || c.id === q.connectionId) &&
        (!q.clientId || c.clientId === q.clientId) &&
        (!q.kind || c.kind === q.kind) &&
        (!q.status || c.status === q.status) &&
        (!q.projectId ||
          c.projects.some((p) => p.id === q.projectId) ||
          (c.projectScope === "account" && accountProjectUsers.has(c.userId!))) &&
        matchesSearch([c.userId, c.userName, c.userEmail, c.id, c.name, c.clientId, c.clientName]),
    );
    const matchingCalls = calls.filter(
      (c) =>
        (!q.userId || c.userId === q.userId) &&
        (!q.connectionId || c.connectionId === q.connectionId) &&
        (!q.clientId || c.clientId === q.clientId) &&
        (!q.projectId || c.projectId === q.projectId) &&
        (!q.tool || c.tool === q.tool) &&
        (!q.outcome || c.outcome === q.outcome) &&
        matchesSearch([
          c.userId,
          c.userName,
          c.userEmail,
          c.connectionId,
          c.connectionName,
          c.clientId,
          c.tool,
          c.projectId,
          c.projectName,
        ]),
    );
    return { generatedAt, connections: matchingConnections, calls: matchingCalls };
  }
  function summaries(connections: AdminMcpConnection[], calls: AdminMcpCall[]): AdminMcpUser[] {
    const userIds = new Set(
      [...connections.map((c) => c.userId), ...calls.map((c) => c.userId)].filter(
        (id): id is string => id !== null,
      ),
    );
    return [...userIds].map((userId) => {
      const userConnections = connections.filter((c) => c.userId === userId);
      const userCalls = calls.filter((c) => c.userId === userId);
      const identity = userConnections[0] ?? userCalls[0];
      const lastSuccessfulUseAt = latest([
        ...userConnections.map((c) => c.lastUsedAt),
        ...userCalls.filter((c) => c.outcome === "success").map((c) => c.createdAt),
      ]);
      return {
        userId,
        userName: identity.userName,
        userEmail: identity.userEmail,
        connectionCount: userConnections.length,
        activeConnectionCount: userConnections.filter((c) => c.status === "active").length,
        successfulCalls: userCalls.filter((c) => c.outcome === "success").length,
        failedCalls: userCalls.filter((c) => c.outcome === "failure").length,
        lastCalledAt: latest(userCalls.map((c) => c.createdAt)),
        lastSuccessfulUseAt,
        hasUsed: userCalls.length > 0 || lastSuccessfulUseAt !== null,
      };
    });
  }
  return {
    async overview(q: AdminMcpQuery) {
      const s = await snapshot(q);
      const from = q.from ?? new Date(Date.parse(s.generatedAt) - 30 * 86400000).toISOString();
      const to = q.to ?? s.generatedAt;
      const recent = s.calls.filter((c) => timeMatches(c.createdAt, { ...q, from, to }));
      return {
        enabled: input.enabled,
        generatedAt: s.generatedAt,
        historicalUserCount: summaries(s.connections, s.calls).filter((u) => u.hasUsed).length,
        activeConnectionCount: s.connections.filter((c) => c.status === "active").length,
        successfulCalls: recent.filter((c) => c.outcome === "success").length,
        failedCalls: recent.filter((c) => c.outcome === "failure").length,
        from,
        to,
        retentionNote:
          "调用次数仅覆盖当前留存的工具审计；最近使用时间可证明曾使用，不能还原已清理的调用次数。",
      };
    },
    async users(q: AdminMcpQuery) {
      const s = await snapshot(q);
      const filteredCalls = s.calls.filter((c) => timeMatches(c.createdAt, q));
      let rows = summaries(s.connections, filteredCalls);
      if (q.from || q.to || q.tool || q.outcome)
        rows = rows.filter((u) => filteredCalls.some((c) => c.userId === u.userId));
      rows = rows.filter((u) => !q.usage || (q.usage === "used" ? u.hasUsed : !u.hasUsed));
      // A retained last-use timestamp proves use but must not masquerade as a retained call date.
      rows.sort(
        (a, b) =>
          (b.lastCalledAt ?? "").localeCompare(a.lastCalledAt ?? "") ||
          b.userId!.localeCompare(a.userId!),
      );
      const { rows: users, ...pagination } = page(rows, q, s.generatedAt);
      return { ...pagination, users };
    },
    async connections(q: AdminMcpQuery) {
      const s = await snapshot(q);
      const rows = s.connections
        .filter((c) => timeMatches(c.createdAt, q))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      const { rows: connections, ...pagination } = page(rows, q, s.generatedAt);
      return { ...pagination, connections };
    },
    async calls(q: AdminMcpQuery) {
      const s = await snapshot(q);
      const window = {
        ...q,
        from: q.from ?? new Date(Date.parse(s.generatedAt) - 30 * 86400000).toISOString(),
        to: q.to ?? s.generatedAt,
      };
      const rows = s.calls
        .filter((c) => timeMatches(c.createdAt, window))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      const { rows: calls, ...pagination } = page(rows, q, s.generatedAt);
      return { ...pagination, calls };
    },
    async revoke(actor: AdminActor, id: string) {
      const connection = await input.store.getConnection(id);
      if (!connection) {
        await recordAdminAction(input.authStore, {
          actor,
          action: "admin.mcp.revoke",
          targetType: "mcp_connection",
          targetId: id,
          outcome: "failure",
          message: JSON.stringify({ code: "not_found" }),
        });
        return null;
      }
      const alreadyRevoked = connection.revokedAt !== null;
      try {
        // Revoke the shared grant first, so concurrent token issuance cannot restore access.
        await input.store.revokeGrant(id);
      } catch (error) {
        await recordAdminAction(input.authStore, {
          actor,
          action: "admin.mcp.revoke",
          targetType: "mcp_connection",
          targetId: id,
          outcome: "failure",
          message: JSON.stringify({ userId: connection.userId, code: "revoke_failed" }),
        });
        throw error;
      }
      await recordAdminAction(input.authStore, {
        actor,
        action: "admin.mcp.revoke",
        targetType: "mcp_connection",
        targetId: id,
        outcome: "success",
        message: JSON.stringify({ userId: connection.userId, alreadyRevoked }),
      });
      return {
        revoked: true as const,
        connectionId: id,
        userId: connection.userId,
        alreadyRevoked,
      };
    },
  };
}
