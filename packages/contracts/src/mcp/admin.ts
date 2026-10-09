// Defines secret-free admin MCP queries, retained usage summaries and connection governance DTOs.
import { z } from "zod";

export const adminMcpTools = [
  "list_projects",
  "get_implementation_context",
  "get_artifact",
  "check_context_updates",
] as const;
export const adminMcpQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().max(200).default(""),
    userId: z.string().max(512).optional(),
    connectionId: z.string().max(512).optional(),
    clientId: z.string().max(512).optional(),
    projectId: z.string().max(512).optional(),
    tool: z.enum(adminMcpTools).optional(),
    outcome: z.enum(["success", "failure"]).optional(),
    kind: z.enum(["oauth", "pat"]).optional(),
    status: z.enum(["active", "expired", "revoked", "user_disabled"]).optional(),
    usage: z.enum(["used", "unused"]).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), {
    message: "开始时间不能晚于结束时间",
    path: ["from"],
  });
export type AdminMcpQuery = z.infer<typeof adminMcpQuerySchema>;
const userFields = {
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  userEmail: z.string().nullable(),
};
export const adminMcpCallSchema = z.object({
  id: z.string(),
  ...userFields,
  connectionId: z.string().nullable(),
  connectionName: z.string().nullable(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  tool: z.enum(adminMcpTools),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  createdAt: z.string(),
  durationMs: z.number().nonnegative().nullable(),
  outcome: z.enum(["success", "failure"]),
});
export const adminMcpActivitySchema = z.object({
  id: z.string(),
  action: z.string(),
  actorUserId: z.string().nullable(),
  createdAt: z.string(),
  outcome: z.enum(["success", "failure"]),
});
export const adminMcpConnectionSchema = z.object({
  id: z.string(),
  ...userFields,
  clientId: z.string(),
  clientName: z.string().nullable(),
  name: z.string(),
  kind: z.enum(["oauth", "pat"]),
  projectScope: z.enum(["account", "selected"]),
  projects: z.array(z.object({ id: z.string(), name: z.string().nullable() })),
  createdAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  status: z.enum(["active", "expired", "revoked", "user_disabled"]),
  activities: z.array(adminMcpActivitySchema),
});
export const adminMcpUserSchema = z.object({
  ...userFields,
  connectionCount: z.number().int().nonnegative(),
  activeConnectionCount: z.number().int().nonnegative(),
  successfulCalls: z.number().int().nonnegative(),
  failedCalls: z.number().int().nonnegative(),
  lastCalledAt: z.string().nullable(),
  lastSuccessfulUseAt: z.string().nullable(),
  hasUsed: z.boolean(),
});
export const adminMcpOverviewSchema = z.object({
  enabled: z.boolean(),
  generatedAt: z.string(),
  historicalUserCount: z.number().int().nonnegative(),
  activeConnectionCount: z.number().int().nonnegative(),
  successfulCalls: z.number().int().nonnegative(),
  failedCalls: z.number().int().nonnegative(),
  from: z.string(),
  to: z.string(),
  retentionNote: z.string(),
});
const pageFields = {
  generatedAt: z.string(),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
};
export const adminMcpUsersResponseSchema = z.object({
  ...pageFields,
  users: z.array(adminMcpUserSchema),
});
export const adminMcpConnectionsResponseSchema = z.object({
  ...pageFields,
  connections: z.array(adminMcpConnectionSchema),
});
export const adminMcpCallsResponseSchema = z.object({
  ...pageFields,
  calls: z.array(adminMcpCallSchema),
});
export const adminMcpRevokeResponseSchema = z.object({
  revoked: z.literal(true),
  connectionId: z.string(),
  userId: z.string(),
  alreadyRevoked: z.boolean(),
});
export type AdminMcpCall = z.infer<typeof adminMcpCallSchema>;
export type AdminMcpConnection = z.infer<typeof adminMcpConnectionSchema>;
export type AdminMcpUser = z.infer<typeof adminMcpUserSchema>;
export type AdminMcpOverview = z.infer<typeof adminMcpOverviewSchema>;
