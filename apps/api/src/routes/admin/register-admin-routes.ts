// Registers admin endpoints and delegates provider key handling to secure storage.
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  adminOrganizationCreateRequestSchema,
  adminOrganizationListResponseSchema,
  adminCourseCreateRequestSchema,
  adminCourseListResponseSchema,
  adminClassCreateRequestSchema,
  adminClassListResponseSchema,
  adminTeamCreateRequestSchema,
  adminTeamListResponseSchema,
  adminOrganizationMembershipCreateRequestSchema,
  adminOrganizationMembershipListResponseSchema,
  adminQuotaCreateRequestSchema,
  adminQuotaListResponseSchema,
  adminProviderQuotaListResponseSchema,
  adminProviderUsageListResponseSchema,
  adminRateLimitPolicyCreateRequestSchema,
  adminRateLimitPolicyListResponseSchema,
  adminRateLimitPolicyUpdateRequestSchema,
  providerModelDiscoveryRequestSchema,
  providerModelDiscoveryResponseSchema,
  providerModelDiscoveryProgressEventSchema,
  providerModelCapabilityMapSchema,
  type ProviderModelDiscoveryProgressEvent,
} from "@uml-platform/contracts";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import type { BillingService } from "../../billing/billing-service.js";
import {
  buildTokenMail,
  createMailAdapterFromEnv,
  type MailAdapter,
} from "../../mail/mail-adapter.js";
import { hashPassword } from "../../security/password-hashing.js";
import {
  readAdminSessionCookie,
  readSessionCookie,
} from "../../auth/session-cookie.js";
import type { RunRecordStore } from "../../runs/records/run-record-store.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import { buildOrganizationUnits } from "../../admin/admin-route-presenters.js";
import { requireHighRiskAdmin } from "../../admin/admin-route-security.js";
import {
  buildAdminDocumentListView,
  downloadAdminDocument,
  resolveAdminDocumentProjectScope,
  restoreAdminDocument,
} from "../../admin/admin-document-actions.js";
import {
  buildAdminClassListView,
  buildAdminCourseListView,
  buildAdminMembershipListView,
  buildAdminOrganizationListView,
  buildAdminQuotaListView,
  buildAdminTeamListView,
  createAdminClass,
  createAdminCourse,
  createAdminMembership,
  createAdminOrganization,
  createAdminQuota,
  createAdminTeam,
  denyScopedAdminOrganizationCreate,
  getVisibleAdminClass,
  getVisibleAdminCourse,
  getVisibleAdminMembership,
  getVisibleAdminOrganization,
  getVisibleAdminQuota,
  getVisibleAdminTeam,
} from "../../admin/admin-academic-actions.js";
import {
  createAdminProviderConfig,
  resetAdminProviderConfigBreaker,
  revokeAdminProviderConfig,
  rotateAdminProviderConfigKey,
  updateAdminProviderConfig,
  updateAdminProviderConfigStatus,
} from "../../admin/admin-provider-config-actions.js";
import {
  disableAdminUser,
  forceLogoutAdminUser,
  freezeAdminProject,
  resetAdminUserMfa,
} from "../../admin/admin-user-project-actions.js";
import {
  mutateAdminPromptRuntime,
  reviewAdminRoleHighRiskPermissions,
  type AdminPromptRuntimeAction,
  type AdminPromptRuntimeStatus,
} from "../../admin/admin-governance-actions.js";
import {
  createAdminRateLimitPolicy,
  updateAdminRateLimitPolicy,
} from "../../admin/admin-rate-limit-actions.js";
import {
  buildAdminProviderConfigListView,
  buildAdminProviderQuotaView,
  buildAdminProviderUsageView,
  buildAdminRateLimitPolicyListView,
} from "../../admin/admin-provider-telemetry.js";
import { buildAdminAuditLogView } from "../../admin/admin-audit-log-view.js";
import { buildAdminMetricsView } from "../../admin/admin-metrics-view.js";
import {
  buildAdminEvaluationMetricsView,
  buildAdminPerformanceView,
  parseAnalyticsFilters,
} from "../../admin/admin-performance-view.js";
import {
  evaluationReportImportSchema,
  evaluationReviewRequestSchema,
  type AdminAnalyticsStore,
} from "../../admin/admin-analytics-store.js";
import {
  buildAdminRunListView,
  getAdminRunDetail,
  listAdminRunDtos,
} from "../../admin/admin-run-read-model.js";
import {
  cancelAdminRun,
  createAdminRunAction,
  type AdminRunPipelineStarter,
} from "../../admin/admin-run-actions.js";
import {
  buildAdminRiskEventsView,
  type AdminRiskEvent,
} from "../../admin/admin-risk-events-view.js";
import {
  getAdminSessionView,
  requireScopedAdminActor,
} from "../../admin/admin-session-view.js";
import {
  buildAdminProjectListView,
  buildAdminUserListView,
  getAdminProjectDetailView,
  getAdminUserLoginRecordView,
  getAdminUserProjectsView,
} from "../../admin/admin-user-project-read-model.js";
import {
  buildPromptRuntimeListView,
  buildRolePermissionsView,
  buildSystemConfigView,
  buildSystemHealthView,
  buildSystemLogsView,
  buildSystemReleasesView,
  createPromptRuntimeItems,
  findRolePermission,
  getPromptRuntimeVersionsView,
} from "./admin-console-model.js";
import {
  hasAcademicRead,
  hasAcademicWrite,
} from "../../admin/academic-scope.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { requireAdminPermission } from "../../security/admin-guard.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import {
  createInMemoryAcademicAdminRepository,
  type AcademicAdminRepository,
} from "../../db/academic-admin-repository.js";
import { createPostgresAcademicAdminRepository } from "../../db/postgres-academic-admin-repository.js";
import {
  createPostgresPoolFromEnv,
  getDatabaseUrl,
} from "../../db/postgres.js";
import {
  resolveProviderRateLimitPolicy,
  type ProviderRateLimitPolicy,
  type ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import { createRateLimitPolicyStoreWithFallback } from "../../provider-configs/fallback-rate-limit-policy-store.js";
import { testAdminProviderConfigConnection } from "../../provider-configs/admin-provider-config-test.js";
import type { LlmScheduler } from "../../adapters/llm/llm-scheduler.js";
import { ProviderHttpError } from "../../llm.js";
import { discoverOpenAiCompatibleModelCapabilities } from "../../provider-configs/provider-model-discovery.js";
import {
  normalizeManagedProviderBaseUrl,
  ProviderConfigPolicyError,
} from "../../provider-configs/provider-url-policy.js";
import {
  DEFAULT_LOCAL_CORS_ORIGINS,
  readCorsOrigins,
} from "../../server/cors.js";

export type { AdminRiskEvent };

function createAcademicAdminRepository(app: FastifyInstance): AcademicAdminRepository {
  if (!getDatabaseUrl()) {
    return createInMemoryAcademicAdminRepository();
  }

  const pool = createPostgresPoolFromEnv();
  app.addHook("onClose", async () => {
    await pool.end();
  });
  return createPostgresAcademicAdminRepository(pool);
}

const createProviderConfigRequestSchema = z.object({
  name: z.string().trim().min(1),
  provider: z.string().trim().min(1).optional(),
  baseUrl: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  defaultModel: z.string().trim().min(1),
  allowedModels: z.array(z.string().trim().min(1)).min(1),
  modelCapabilities: providerModelCapabilityMapSchema.optional(),
  keyPurpose: z.string().trim().min(1).optional(),
  quota: z.string().trim().min(1).optional(),
  scopeType: z.enum(["system", "user", "project"]).default("system"),
  scopeId: z.string().trim().min(1).nullable().optional(),
});

const updateProviderConfigRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  defaultModel: z.string().trim().min(1).optional(),
  allowedModels: z.array(z.string().trim().min(1)).min(1).optional(),
  modelCapabilities: providerModelCapabilityMapSchema.optional(),
  keyPurpose: z.string().trim().min(1).optional(),
  quota: z.string().trim().min(1).optional(),
  scopeType: z.enum(["system", "user", "project"]).optional(),
  scopeId: z.string().trim().min(1).nullable().optional(),
}).strict();

const rotateProviderKeyRequestSchema = z.object({
  apiKey: z.string().trim().min(1),
});

const providerTestRequestSchema = z
  .object({
    model: z.string().trim().min(1).optional(),
  })
  .strict()
  .default({});

const invitationalAdminRoleSchema = z.enum([
  "system_operator",
  "course_admin",
  "project_admin",
  "auditor",
  "security_admin",
  "model_admin",
  "teacher_assistant",
]);

const createAdminInvitationRequestSchema = z
  .object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    displayName: z.string().trim().min(1).max(120).optional(),
    role: invitationalAdminRoleSchema,
  })
  .strict();

const acceptAdminInvitationRequestSchema = z
  .object({
    token: z.string().trim().min(16).max(256),
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/u).optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
    password: z.string().min(8).max(128).optional(),
  })
  .strict();

const ADMIN_ROLE_LABELS = {
  system_operator: "系统运维",
  course_admin: "教务/课程管理员",
  project_admin: "项目管理员",
  auditor: "审计员",
  security_admin: "安全管理员",
  model_admin: "模型管理员",
  teacher_assistant: "教师/助教",
} as const;

function sendAdminOnly(
  app: FastifyInstance,
  path: string,
  handler: (request: FastifyRequest, reply: FastifyReply) => unknown,
) {
  app.get(path, handler);
}

function hasEvaluationIngestToken(request: FastifyRequest) {
  const expected = process.env.UML_EVAL_INGEST_TOKEN?.trim();
  const actual = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function registerAdminRoutes({
  app,
  authStore,
  runs,
  documentLibrary,
  providerConfigs,
  providerUsageTracker,
  llmScheduler,
  startRunPipeline,
  riskEvents = () => [],
  providerRateLimitPolicy = resolveProviderRateLimitPolicy(),
  academicStore: providedAcademicStore,
  billingService,
  analyticsStore,
  mailAdapter = createMailAdapterFromEnv(),
  databaseProbe,
  renderClient,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
  runs: RunRecordStore;
  documentLibrary: DocumentLibrary;
  providerConfigs: ProviderConfigStore;
  providerUsageTracker?: ProviderUsageTracker;
  llmScheduler?: LlmScheduler;
  startRunPipeline?: AdminRunPipelineStarter;
  riskEvents?: () => AdminRiskEvent[];
  providerRateLimitPolicy?: ProviderRateLimitPolicy;
  academicStore?: AcademicAdminRepository;
  billingService?: Pick<BillingService, "getSummary">;
  analyticsStore: AdminAnalyticsStore;
  mailAdapter?: MailAdapter;
  databaseProbe?: () => Promise<void>;
  renderClient?: RenderClient;
}) {
  const rateLimitPolicyStore =
    createRateLimitPolicyStoreWithFallback(providerUsageTracker);
  const academicStore = providedAcademicStore ?? createAcademicAdminRepository(app);
  const promptRuntimeItems = createPromptRuntimeItems();

  async function requireAcademicRead(request: FastifyRequest, reply: FastifyReply) {
    const actor = await requireScopedAdminActor(request, reply, authStore);
    if ("message" in actor) return actor;
    if (!hasAcademicRead(actor)) {
      reply.code(403);
      return { message: "Admin project read capability required" } as const;
    }
    return actor;
  }

  async function requireAcademicWrite(request: FastifyRequest, reply: FastifyReply) {
    const actor = await requireScopedAdminActor(request, reply, authStore);
    if ("message" in actor) return actor;
    if (!hasAcademicWrite(actor)) {
      reply.code(403);
      return { message: "Admin project write capability required" } as const;
    }
    return actor;
  }

  sendAdminOnly(app, "/api/admin/session", async (request, reply) => {
    return getAdminSessionView(request, reply, authStore);
  });

  sendAdminOnly(app, "/api/admin/metrics", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.metrics.read",
    );
    if ("message" in actor) return actor;

    const query = request.query as { date?: unknown };
    const metrics = await buildAdminMetricsView({
      authStore,
      documentLibrary,
      providerUsageTracker,
      queryDate: query.date,
      runs,
    });
    if (!metrics.ok) {
      reply.code(400);
      return { message: metrics.message };
    }
    return metrics.view;
  });

  sendAdminOnly(app, "/api/admin/performance-metrics", async (request, reply) => {
    const actor = await requireAdminPermission(request, reply, authStore, "admin.metrics.read");
    if ("message" in actor) return actor;
    const parsed = parseAnalyticsFilters(request.query as Record<string, unknown>);
    if (!parsed.ok) {
      reply.code(400);
      return { message: parsed.message };
    }
    return buildAdminPerformanceView({ analyticsStore, filters: parsed.filters, runs });
  });

  sendAdminOnly(app, "/api/admin/evaluation-metrics", async (request, reply) => {
    const actor = await requireAdminPermission(request, reply, authStore, "admin.evaluations.read");
    if ("message" in actor) return actor;
    const parsed = parseAnalyticsFilters(request.query as Record<string, unknown>);
    if (!parsed.ok) {
      reply.code(400);
      return { message: parsed.message };
    }
    return buildAdminEvaluationMetricsView({ analyticsStore, filters: parsed.filters });
  });

  sendAdminOnly(app, "/api/admin/evaluation-reviews", async (request, reply) => {
    const actor = await requireAdminPermission(request, reply, authStore, "admin.evaluations.read");
    if ("message" in actor) return actor;
    const parsed = parseAnalyticsFilters(request.query as Record<string, unknown>);
    if (!parsed.ok) {
      reply.code(400);
      return { message: parsed.message };
    }
    const query = request.query as { status?: unknown };
    const attempts = await analyticsStore.listEvaluationAttempts(parsed.filters);
    return {
      generatedAt: new Date().toISOString(),
      attempts: query.status === "pending"
        ? attempts.filter((attempt) => attempt.reviewVerdict === null)
        : attempts,
    };
  });

  app.post("/api/admin/evaluation-reviews/:id", async (request, reply) => {
    const actor = await requireAdminPermission(request, reply, authStore, "admin.evaluations.review");
    if ("message" in actor) return actor;
    const parsed = evaluationReviewRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { message: "Invalid evaluation review", issues: parsed.error.issues };
    }
    const { id } = request.params as { id: string };
    const attempt = await analyticsStore.reviewEvaluationAttempt({
      attemptId: id,
      reviewerId: actor.id,
      review: parsed.data,
    });
    if (!attempt) {
      reply.code(404);
      return { message: "Evaluation attempt not found" };
    }
    await authStore.recordAuditLog({
      actorUserId: actor.id,
      action: "admin.evaluation.review",
      targetType: "evaluation_attempt",
      targetId: id,
      outcome: "success",
      message: `Evaluation verdict reviewed as ${parsed.data.verdict}`,
    });
    return { attempt };
  });

  app.post("/api/internal/evaluations/import", async (request, reply) => {
    if (!hasEvaluationIngestToken(request)) {
      reply.code(401);
      return { message: "Valid evaluation ingest token required" };
    }
    const parsed = evaluationReportImportSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { message: "Invalid evaluation report", issues: parsed.error.issues };
    }
    return analyticsStore.importEvaluationReport(parsed.data);
  });

  sendAdminOnly(app, "/api/admin/users", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.users.read",
    );
    if ("message" in actor) return actor;
    return buildAdminUserListView({
      academicStore,
      authStore,
      billingService,
      actor,
    });
  });

  sendAdminOnly(app, "/api/admin/admin-invitations", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.admin_invitations.write",
    );
    if ("message" in actor) return actor;
    return { invitations: await authStore.listAdminInvitations() };
  });

  app.post("/api/admin/admin-invitations", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.admin_invitations.write",
    );
    if ("message" in actor) return actor;
    const input = createAdminInvitationRequestSchema.parse(request.body);
    const existingUser = await authStore.findUserByEmail(input.email);
    if (existingUser?.systemRoles.includes(input.role)) {
      reply.code(409);
      return { message: "该账号已经拥有此管理员角色" };
    }
    const created = await authStore.createAdminInvitation({
      ...input,
      invitedByUserId: actor.id,
    });
    if (!created) {
      reply.code(409);
      return { message: "相同邮箱和角色已有待处理邀请" };
    }
    await mailAdapter.send(
      buildTokenMail({
        email: input.email,
        purpose: "admin_invitation",
        token: created.token,
        expiresAt: created.invitation.expiresAt,
        adminRoleLabel: ADMIN_ROLE_LABELS[input.role],
      }),
    );
    await authStore.recordAuditLog({
      actorUserId: actor.id,
      action: "admin.invitation.create",
      targetType: "admin_invitation",
      targetId: created.invitation.id,
      outcome: "success",
      message: `管理员邀请已创建：${input.role}`,
    });
    reply.code(201);
    return {
      invitation: created.invitation,
      ...(process.env.NODE_ENV === "production" ? {} : { devToken: created.token }),
    };
  });

  app.post("/api/admin/admin-invitations/:id/resend", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.admin_invitations.write",
    );
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const resent = await authStore.resendAdminInvitation(id, actor.id);
    if (!resent) {
      reply.code(404);
      return { message: "待处理邀请不存在" };
    }
    await mailAdapter.send(
      buildTokenMail({
        email: resent.invitation.email,
        purpose: "admin_invitation",
        token: resent.token,
        expiresAt: resent.invitation.expiresAt,
        adminRoleLabel: ADMIN_ROLE_LABELS[resent.invitation.role],
      }),
    );
    await authStore.recordAuditLog({
      actorUserId: actor.id,
      action: "admin.invitation.resend",
      targetType: "admin_invitation",
      targetId: id,
      outcome: "success",
      message: "管理员邀请已重发，旧令牌已失效",
    });
    return { invitation: resent.invitation };
  });

  app.delete("/api/admin/admin-invitations/:id", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.admin_invitations.write",
    );
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const invitation = await authStore.revokeAdminInvitation(id);
    if (!invitation) {
      reply.code(404);
      return { message: "待处理邀请不存在" };
    }
    await authStore.recordAuditLog({
      actorUserId: actor.id,
      action: "admin.invitation.revoke",
      targetType: "admin_invitation",
      targetId: id,
      outcome: "success",
      message: "管理员邀请已撤销",
    });
    return { invitation };
  });

  app.get("/api/admin-invitations/inspect", async (request, reply) => {
    const token = String((request.query as { token?: unknown }).token ?? "").trim();
    const invitation = token ? await authStore.findActiveAdminInvitationToken(token) : null;
    if (!invitation) {
      reply.code(404);
      return { message: "邀请无效或已过期" };
    }
    return {
      invitation: {
        email: invitation.email,
        displayName: invitation.displayName,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        existingAccount: Boolean(await authStore.findUserByEmail(invitation.email)),
      },
    };
  });

  app.post("/api/admin-invitations/accept", async (request, reply) => {
    const input = acceptAdminInvitationRequestSchema.parse(request.body);
    const invitation = await authStore.findActiveAdminInvitationToken(input.token);
    if (!invitation) {
      reply.code(404);
      return { message: "邀请无效或已过期" };
    }
    let user = await authStore.findUserByEmail(invitation.email);
    if (user) {
      const sessionId = readSessionCookie(request) ?? readAdminSessionCookie(request);
      const session = sessionId ? await authStore.getActiveSession(sessionId) : null;
      if (!session || session.userId !== user.id) {
        reply.code(401);
        return { message: "请先使用被邀请邮箱登录后再接受邀请" };
      }
    } else {
      if (!input.username || !input.displayName || !input.password) {
        reply.code(400);
        return { message: "新账号必须填写用户名、显示名称和密码" };
      }
      user = await authStore.createUser({
        email: invitation.email,
        username: input.username,
        displayName: input.displayName,
        passwordHash: hashPassword(input.password),
        emailVerified: true,
        status: "active",
      });
      if (!user) {
        reply.code(409);
        return { message: "用户名或邮箱已被使用" };
      }
    }
    const accepted = await authStore.acceptAdminInvitation(input.token, user.id);
    if (!accepted || "error" in accepted) {
      reply.code(accepted?.error === "email_mismatch" ? 403 : 409);
      return { message: accepted?.error === "email_mismatch" ? "登录邮箱与邀请不一致" : "邀请已被处理" };
    }
    await authStore.recordAuditLog({
      actorUserId: accepted.user.id,
      action: "admin.invitation.accept",
      targetType: "admin_invitation",
      targetId: accepted.invitation.id,
      outcome: "success",
      message: `管理员邀请已接受：${accepted.invitation.role}`,
    });
    return { accepted: true, role: accepted.invitation.role };
  });

  sendAdminOnly(app, "/api/admin/users/:id/login-records", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.users.read",
    );
    if ("message" in actor) return actor;

    const { id } = request.params as { id: string };
    const result = await getAdminUserLoginRecordView({
      academicStore,
      authStore,
      billingService,
      actor,
      userId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/users/:id/projects", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.users.read",
    );
    if ("message" in actor) return actor;
    if (!actor.permissions.includes("admin.projects.read")) {
      reply.code(403);
      return { message: "Missing admin permission: admin.projects.read" };
    }
    const { id } = request.params as { id: string };
    const result = await getAdminUserProjectsView({
      academicStore,
      authStore,
      actor,
      userId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/projects", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.projects.read",
    );
    if ("message" in actor) return actor;
    return buildAdminProjectListView({
      academicStore,
      authStore,
      actor,
    });
  });

  sendAdminOnly(app, "/api/admin/projects/:id", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.projects.read",
    );
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getAdminProjectDetailView({
      academicStore,
      authStore,
      actor,
      projectId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/projects/:id/runs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.runs.read",
    );
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const visible = await getAdminProjectDetailView({
      academicStore,
      authStore,
      actor,
      projectId: id,
    });
    if (visible.statusCode !== 200) {
      reply.code(visible.statusCode);
      return visible.body;
    }
    const projectRuns = (await listAdminRunDtos({
      academicStore,
      authStore,
      actor,
      runs,
      providerConfigs,
    })).filter((run) => run.projectId === id);
    return { generatedAt: new Date().toISOString(), runs: projectRuns };
  });

  sendAdminOnly(app, "/api/admin/organizations", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminOrganizationListResponseSchema.parse(
      await buildAdminOrganizationListView({ academicStore, actor }),
    );
  });

  app.get("/api/admin/organizations/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getVisibleAdminOrganization({
      academicStore,
      actor,
      organizationId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/organizations", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const denied = denyScopedAdminOrganizationCreate(actor);
    if (denied) {
      reply.code(denied.statusCode);
      return denied.body;
    }
    const input = adminOrganizationCreateRequestSchema.parse(request.body);
    const result = await createAdminOrganization({ academicStore, input });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/courses", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminCourseListResponseSchema.parse(
      await buildAdminCourseListView({ academicStore, actor }),
    );
  });

  app.get("/api/admin/courses/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getVisibleAdminCourse({
      academicStore,
      actor,
      courseId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/courses", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminCourseCreateRequestSchema.parse(request.body);
    const result = await createAdminCourse({ academicStore, actor, input });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/classes", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminClassListResponseSchema.parse(
      await buildAdminClassListView({ academicStore, actor }),
    );
  });

  app.get("/api/admin/classes/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getVisibleAdminClass({
      academicStore,
      actor,
      classId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/classes", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminClassCreateRequestSchema.parse(request.body);
    const result = await createAdminClass({ academicStore, actor, input });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/teams", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminTeamListResponseSchema.parse(
      await buildAdminTeamListView({ academicStore, actor }),
    );
  });

  app.get("/api/admin/teams/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getVisibleAdminTeam({
      academicStore,
      actor,
      teamId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/teams", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminTeamCreateRequestSchema.parse(request.body);
    const result = await createAdminTeam({ academicStore, actor, input });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/organization-members", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminOrganizationMembershipListResponseSchema.parse(
      await buildAdminMembershipListView({ academicStore, actor }),
    );
  });

  app.get("/api/admin/organization-members/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getVisibleAdminMembership({
      academicStore,
      actor,
      membershipId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/organization-members", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminOrganizationMembershipCreateRequestSchema.parse(request.body);
    const result = await createAdminMembership({
      academicStore,
      authStore,
      actor,
      input,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/quotas", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminQuotaListResponseSchema.parse(
      await buildAdminQuotaListView({ academicStore, actor }),
    );
  });

  app.get("/api/admin/quotas/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = await getVisibleAdminQuota({
      academicStore,
      actor,
      quotaId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/quotas", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminQuotaCreateRequestSchema.parse(request.body);
    const result = await createAdminQuota({ academicStore, actor, input });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/roles", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.users.read",
    );
    if ("message" in actor) return actor;
    return buildRolePermissionsView();
  });

  app.post("/api/admin/roles/:id/high-risk-permissions/review", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.role_permissions.review";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "admin_role",
      id,
      "admin.roles.write",
    );
    if ("message" in actor) return actor;

    const result = await reviewAdminRoleHighRiskPermissions({
      authStore,
      actor,
      roleId: id,
      findRole: findRolePermission,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/prompt-runtime", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return buildPromptRuntimeListView(promptRuntimeItems);
  });

  app.get("/api/admin/prompt-runtime/:id/versions", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const result = getPromptRuntimeVersionsView(promptRuntimeItems, id);
    reply.code(result.statusCode);
    return result.body;
  });

  async function mutatePromptRuntime(
    request: FastifyRequest,
    reply: FastifyReply,
    nextStatus: AdminPromptRuntimeStatus,
    action: AdminPromptRuntimeAction,
  ) {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      `admin.prompt_runtime.${action}`,
      "prompt_runtime",
      id,
      "admin.prompt_runtime.write",
    );
    if ("message" in actor) return actor;
    const result = await mutateAdminPromptRuntime({
      authStore,
      actor,
      promptRuntimeItems,
      promptRuntimeItemId: id,
      nextStatus,
      action,
    });
    reply.code(result.statusCode);
    return result.body;
  }

  app.post("/api/admin/prompt-runtime/:id/submit", (request, reply) =>
    mutatePromptRuntime(request, reply, "canary", "submit"),
  );
  app.post("/api/admin/prompt-runtime/:id/approve", (request, reply) =>
    mutatePromptRuntime(request, reply, "stable", "approve"),
  );
  app.post("/api/admin/prompt-runtime/:id/rollback", (request, reply) =>
    mutatePromptRuntime(request, reply, "rollback-ready", "rollback"),
  );
  app.post("/api/admin/prompt-runtime/:id/disable", (request, reply) =>
    mutatePromptRuntime(request, reply, "disabled", "disable"),
  );

  sendAdminOnly(app, "/api/admin/documents", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.documents.read",
    );
    if ("message" in actor) return actor;
    const visibleProjectIds = await resolveAdminDocumentProjectScope({
      academicStore,
      authStore,
      actor,
    });
    return buildAdminDocumentListView({
      documentLibrary,
      visibleProjectIds,
    });
  });

  app.get("/api/admin/documents/:id/download", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.documents.read",
    );
    if ("message" in actor) return actor;

    const visibleProjectIds = await resolveAdminDocumentProjectScope({
      academicStore,
      authStore,
      actor,
    });
    const result = await downloadAdminDocument({
      authStore,
      documentLibrary,
      actor,
      documentId: id,
      visibleProjectIds,
    });
    reply.code(result.statusCode);
    if ("buffer" in result) {
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", result.contentDisposition);
      return result.buffer;
    }
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/risk-events", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.risk_events.read",
    );
    if ("message" in actor) return actor;
    return buildAdminRiskEventsView(riskEvents);
  });

  sendAdminOnly(app, "/api/admin/rate-limits", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.rate_limits.read",
    );
    if ("message" in actor) return actor;
    return adminRateLimitPolicyListResponseSchema.parse(
      await buildAdminRateLimitPolicyListView({
        rateLimitPolicyStore,
        providerRateLimitPolicy,
      }),
    );
  });

  sendAdminOnly(app, "/api/admin/provider-usage", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.read",
    );
    if ("message" in actor) return actor;
    return adminProviderUsageListResponseSchema.parse(
      await buildAdminProviderUsageView({ providerUsageTracker }),
    );
  });

  sendAdminOnly(app, "/api/admin/provider-quotas", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.read",
    );
    if ("message" in actor) return actor;
    return adminProviderQuotaListResponseSchema.parse(
      await buildAdminProviderQuotaView({
        providerUsageTracker,
        providerConfigs,
        rateLimitPolicyStore,
      }),
    );
  });

  app.post("/api/admin/rate-limits", async (request, reply) => {
    const action = "admin.rate_limit.create";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "rate_limit_policy",
      null,
      "admin.rate_limits.write",
    );
    if ("message" in actor) return actor;
    const input = adminRateLimitPolicyCreateRequestSchema.parse(request.body);
    const result = await createAdminRateLimitPolicy({
      authStore,
      rateLimitPolicyStore,
      actor,
      input,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.patch("/api/admin/rate-limits/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.rate_limit.update";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "rate_limit_policy",
      id,
      "admin.rate_limits.write",
    );
    if ("message" in actor) return actor;
    const input = adminRateLimitPolicyUpdateRequestSchema.parse(request.body);
    const result = await updateAdminRateLimitPolicy({
      authStore,
      rateLimitPolicyStore,
      actor,
      rateLimitPolicyId: id,
      input,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/runs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.runs.read",
    );
    if ("message" in actor) return actor;

    return buildAdminRunListView({
      academicStore,
      authStore,
      actor,
      runs,
      providerConfigs,
    });
  });

  app.get("/api/admin/runs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.runs.read",
    );
    if ("message" in actor) return actor;

    const result = await getAdminRunDetail({
      academicStore,
      authStore,
      actor,
      runs,
      providerConfigs,
      renderClient,
      runId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/runs/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.runs.write",
    );
    if ("message" in actor) return actor;
    const result = await cancelAdminRun({
      academicStore,
      authStore,
      actor,
      runs,
      runId: id,
      llmScheduler,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  async function createAdminRunActionResponse(
    request: FastifyRequest,
    reply: FastifyReply,
    actionKind: "retry" | "rerun",
  ) {
    const { id } = request.params as { id: string };
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.runs.write",
    );
    if ("message" in actor) return actor;
    const result = await createAdminRunAction({
      academicStore,
      authStore,
      actor,
      runs,
      runId: id,
      actionKind,
      request,
      startRunPipeline,
    });
    reply.code(result.statusCode);
    return result.body;
  }

  app.post("/api/admin/runs/:id/retry", (request, reply) =>
    createAdminRunActionResponse(request, reply, "retry"),
  );

  app.post("/api/admin/runs/:id/rerun", (request, reply) =>
    createAdminRunActionResponse(request, reply, "rerun"),
  );

  app.post("/api/admin/users/:id/disable", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.user.disable";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "user",
      id,
      "admin.users.write",
    );
    if ("message" in actor) return actor;

    const result = await disableAdminUser({
      academicStore,
      authStore,
      billingService,
      actor,
      userId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/users/:id/force-logout", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.user.force_logout";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "user",
      id,
      "admin.users.write",
    );
    if ("message" in actor) return actor;

    const result = await forceLogoutAdminUser({
      academicStore,
      authStore,
      billingService,
      actor,
      userId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/users/:id/reset-mfa", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.user.reset_mfa";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "user",
      id,
      "admin.users.write",
    );
    if ("message" in actor) return actor;

    const result = await resetAdminUserMfa({
      academicStore,
      authStore,
      billingService,
      actor,
      userId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/projects/:id/freeze", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.project.freeze";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "project",
      id,
      "admin.projects.write",
    );
    if ("message" in actor) return actor;

    const result = await freezeAdminProject({
      academicStore,
      authStore,
      actor,
      projectId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/documents/:id/restore", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.document.restore";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "document",
      id,
      "admin.documents.write",
    );
    if ("message" in actor) return actor;

    const result = await restoreAdminDocument({
      authStore,
      documentLibrary,
      actor,
      documentId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  function createProviderModelDiscoveryStream(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const allowedOrigins = new Set(
      readCorsOrigins("API_CORS_ORIGINS", DEFAULT_LOCAL_CORS_ORIGINS),
    );
    const origin = request.headers.origin;
    const abortController = new AbortController();
    let closed = false;
    let completed = false;

    reply.hijack();
    const response = reply.raw;
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    if (origin && allowedOrigins.has(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Credentials", "true");
    }
    response.flushHeaders?.();

    const heartbeat = setInterval(() => {
      if (closed || response.writableEnded || response.destroyed) return;
      response.write(": heartbeat\n\n");
    }, 15_000);

    request.raw.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      if (!completed) abortController.abort();
    });

    return {
      abortSignal: abortController.signal,
      close() {
        completed = true;
        closed = true;
        clearInterval(heartbeat);
        if (!response.writableEnded && !response.destroyed) {
          response.end();
        }
      },
      send(event: ProviderModelDiscoveryProgressEvent) {
        if (closed || response.writableEnded || response.destroyed) return;
        const parsed = providerModelDiscoveryProgressEventSchema.parse(event);
        response.write(`event: ${parsed.type}\n`);
        response.write(`data: ${JSON.stringify(parsed)}\n\n`);
      },
    };
  }

  function isAbortError(error: unknown) {
    return error instanceof Error && error.name === "AbortError";
  }

  async function runProviderModelDiscoveryStream({
    apiBaseUrl,
    apiKey,
    onFailure,
    onSuccess,
    reply,
    request,
  }: {
    apiBaseUrl: string;
    apiKey: string;
    onFailure?: () => Promise<void>;
    onSuccess?: () => Promise<void>;
    reply: FastifyReply;
    request: FastifyRequest;
  }) {
    const stream = createProviderModelDiscoveryStream(request, reply);
    stream.send({ type: "started", sourceBaseUrl: apiBaseUrl });
    try {
      const discovery = await discoverOpenAiCompatibleModelCapabilities({
        apiBaseUrl,
        apiKey,
        abortSignal: stream.abortSignal,
        onProgress: stream.send,
      });
      const result = providerModelDiscoveryResponseSchema.parse({
        ...discovery,
        fetchedAt: new Date().toISOString(),
        sourceBaseUrl: apiBaseUrl,
      });
      await onSuccess?.();
      stream.send({ type: "completed", result });
    } catch (error) {
      if (!isAbortError(error)) {
        await onFailure?.();
        const providerStatus =
          error instanceof ProviderHttpError ? error.status : undefined;
        stream.send({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Provider model discovery failed",
          status: providerStatus ?? 502,
        });
      }
    } finally {
      stream.close();
    }
  }

  sendAdminOnly(app, "/api/admin/provider-configs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.read",
    );
    if ("message" in actor) return actor;
    return buildAdminProviderConfigListView({ providerConfigs, authStore });
  });

  app.post("/api/admin/provider-configs/discover-models", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;

    const input = providerModelDiscoveryRequestSchema.parse(request.body);
    let sourceBaseUrl: string;
    try {
      sourceBaseUrl = normalizeManagedProviderBaseUrl(input.baseUrl);
    } catch (error) {
      if (error instanceof ProviderConfigPolicyError) {
        reply.code(400);
        return { message: error.message };
      }
      throw error;
    }

    try {
      const discovery = await discoverOpenAiCompatibleModelCapabilities({
        apiBaseUrl: sourceBaseUrl,
        apiKey: input.apiKey,
      });
      return providerModelDiscoveryResponseSchema.parse({
        ...discovery,
        fetchedAt: new Date().toISOString(),
        sourceBaseUrl,
      });
    } catch (error) {
      const providerStatus =
        error instanceof ProviderHttpError ? error.status : null;
      reply.code(providerStatus ?? 502);
      return {
        message:
          error instanceof Error
            ? error.message
            : "Provider model discovery failed",
      };
    }
  });

  app.post("/api/admin/provider-configs/discover-models/stream", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;

    const input = providerModelDiscoveryRequestSchema.parse(request.body);
    let sourceBaseUrl: string;
    try {
      sourceBaseUrl = normalizeManagedProviderBaseUrl(input.baseUrl);
    } catch (error) {
      if (error instanceof ProviderConfigPolicyError) {
        reply.code(400);
        return { message: error.message };
      }
      throw error;
    }

    return runProviderModelDiscoveryStream({
      apiBaseUrl: sourceBaseUrl,
      apiKey: input.apiKey,
      reply,
      request,
    });
  });

  app.post("/api/admin/provider-configs", async (request, reply) => {
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.create",
      "provider_config",
      null,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const input = createProviderConfigRequestSchema.parse(request.body);
    const result = await createAdminProviderConfig({
      authStore,
      providerConfigs,
      actor,
      input,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.patch("/api/admin/provider-configs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.update",
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const input = updateProviderConfigRequestSchema.parse(request.body);
    const result = await updateAdminProviderConfig({
      authStore,
      providerConfigs,
      actor,
      providerConfigId: id,
      input,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/provider-configs/:id/rotate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.rotate",
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const input = rotateProviderKeyRequestSchema.parse(request.body);
    const result = await rotateAdminProviderConfigKey({
      authStore,
      providerConfigs,
      actor,
      providerConfigId: id,
      apiKey: input.apiKey,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.post("/api/admin/provider-configs/:id/revoke", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.revoke",
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const result = await revokeAdminProviderConfig({
      authStore,
      providerConfigs,
      actor,
      providerConfigId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  async function updateProviderConfigStatus(
    request: FastifyRequest,
    reply: FastifyReply,
    nextStatus: "active" | "disabled",
    action: "enable" | "disable",
  ) {
    const { id } = request.params as { id: string };
    const adminAction = `admin.provider_config.${action}`;
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      adminAction,
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;

    const result = await updateAdminProviderConfigStatus({
      authStore,
      providerConfigs,
      actor,
      providerConfigId: id,
      nextStatus,
      action,
    });
    reply.code(result.statusCode);
    return result.body;
  }

  app.post("/api/admin/provider-configs/:id/disable", (request, reply) =>
    updateProviderConfigStatus(request, reply, "disabled", "disable"),
  );

  app.post("/api/admin/provider-configs/:id/enable", (request, reply) =>
    updateProviderConfigStatus(request, reply, "active", "enable"),
  );

  app.post("/api/admin/provider-configs/:id/reset-breaker", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.reset_breaker",
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const result = await resetAdminProviderConfigBreaker({
      authStore,
      providerConfigs,
      actor,
      providerConfigId: id,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  app.get("/api/admin/provider-configs/:id/models", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;

    const { id } = request.params as { id: string };
    const providerConfig = await providerConfigs.get(id);
    if (!providerConfig) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    if (providerConfig.scopeType === "user") {
      reply.code(403);
      return { message: "User-owned provider configs cannot be tested by admins" };
    }
    if (!providerConfig.allowlisted) {
      reply.code(400);
      return { message: "Provider Base URL is not allowlisted" };
    }
    if (providerConfig.status !== "active") {
      reply.code(400);
      return { message: "Provider config is revoked, disabled, or inactive" };
    }
    if (providerConfig.breakerState === "open") {
      reply.code(503);
      return { message: "Provider circuit breaker is open" };
    }

    const apiKey = await providerConfigs.getSecret(id);
    if (!apiKey) {
      reply.code(400);
      return { message: "Provider config secret is revoked" };
    }

    try {
      const discovery = await discoverOpenAiCompatibleModelCapabilities({
        apiBaseUrl: providerConfig.baseUrl,
        apiKey,
      });
      await providerConfigs.markUsed(id);
      await providerConfigs.resetBreaker?.(id);
      return providerModelDiscoveryResponseSchema.parse({
        ...discovery,
        fetchedAt: new Date().toISOString(),
        sourceBaseUrl: providerConfig.baseUrl,
      });
    } catch (error) {
      const breaker = await providerConfigs.recordFailure?.(id);
      const providerStatus =
        error instanceof ProviderHttpError ? error.status : null;
      reply.code(providerStatus ?? 502);
      return {
        message:
          error instanceof Error
            ? error.message
            : "Provider model discovery failed",
        breaker: breaker
          ? {
              state: breaker.breakerState,
              failureCount: breaker.breakerFailureCount,
              openedAt: breaker.breakerOpenedAt,
              lastFailureAt: breaker.breakerLastFailureAt,
            }
          : undefined,
      };
    }
  });

  app.get("/api/admin/provider-configs/:id/models/stream", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;

    const { id } = request.params as { id: string };
    const providerConfig = await providerConfigs.get(id);
    if (!providerConfig) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    if (providerConfig.scopeType === "user") {
      reply.code(403);
      return { message: "User-owned provider configs cannot be tested by admins" };
    }
    if (!providerConfig.allowlisted) {
      reply.code(400);
      return { message: "Provider Base URL is not allowlisted" };
    }
    if (providerConfig.status !== "active") {
      reply.code(400);
      return { message: "Provider config is revoked, disabled, or inactive" };
    }
    if (providerConfig.breakerState === "open") {
      reply.code(503);
      return { message: "Provider circuit breaker is open" };
    }

    const apiKey = await providerConfigs.getSecret(id);
    if (!apiKey) {
      reply.code(400);
      return { message: "Provider config secret is revoked" };
    }

    return runProviderModelDiscoveryStream({
      apiBaseUrl: providerConfig.baseUrl,
      apiKey,
      onFailure: async () => {
        await providerConfigs.recordFailure?.(id);
      },
      onSuccess: async () => {
        await providerConfigs.markUsed(id);
        await providerConfigs.resetBreaker?.(id);
      },
      reply,
      request,
    });
  });

  app.post("/api/admin/provider-configs/:id/test", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const input = providerTestRequestSchema.parse(request.body ?? {});
    const result = await testAdminProviderConfigConnection({
      providerConfigs,
      providerUsageTracker,
      rateLimitPolicies: await rateLimitPolicyStore.listRateLimitPolicies(),
      providerRateLimitPolicy,
      providerConfigId: id,
      actor,
      ipAddress: request.ip,
      model: input.model,
    });
    reply.code(result.statusCode);
    return result.body;
  });

  sendAdminOnly(app, "/api/admin/audit-logs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.audit_logs.read",
    );
    if ("message" in actor) return actor;
    return buildAdminAuditLogView({
      academicStore,
      authStore,
      providerConfigs,
      actor,
    });
  });

  sendAdminOnly(app, "/api/admin/system/health", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return buildSystemHealthView({ providerConfigs, databaseProbe });
  });

  sendAdminOnly(app, "/api/admin/system/config", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return buildSystemConfigView();
  });

  sendAdminOnly(app, "/api/admin/system/logs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return buildSystemLogsView();
  });

  sendAdminOnly(app, "/api/admin/system/releases", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return buildSystemReleasesView();
  });
}
