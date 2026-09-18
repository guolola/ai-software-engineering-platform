// Builds admin console display models for roles, prompt runtime status, and system summaries.
import {
  adminRoleDataScopes,
  adminRolePermissions,
  type AdminRole,
} from "@uml-platform/contracts";
import { ADMIN_ROLES } from "../../security/admin-rbac.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";

const ADMIN_ROLE_NAMES: Record<AdminRole, string> = {
  super_admin: "超级管理员",
  system_operator: "系统运维",
  course_admin: "教务/课程管理员",
  project_admin: "项目管理员",
  auditor: "审计员",
  security_admin: "安全管理员",
  model_admin: "模型管理员",
  teacher_assistant: "教师/助教",
};

export type PromptRuntimeKind = "prompt" | "skill";
export type PromptRuntimeStatus = "stable" | "canary" | "rollback-ready" | "disabled";
export type PromptRuntimeItem = {
  id: string;
  name: string;
  kind: PromptRuntimeKind;
  version: string;
  status: PromptRuntimeStatus;
  approver: string;
  updatedAt: string;
};

export function buildRolePermissions() {
  return ADMIN_ROLES.map((role) => {
    const permissions = Array.from(adminRolePermissions[role]);
    return {
      id: role,
      name: ADMIN_ROLE_NAMES[role],
      scope: Array.from(adminRoleDataScopes[role]).join(", "),
      permissions,
      highRisk: permissions.some((permission) => permission.endsWith(".write")),
    };
  });
}

export function findRolePermission(roleId: string) {
  return buildRolePermissions().find((role) => role.id === roleId) ?? null;
}

export function buildRolePermissionsView() {
  return {
    generatedAt: new Date().toISOString(),
    roles: buildRolePermissions(),
  };
}

function buildPromptRuntimeItems(): Array<Omit<PromptRuntimeItem, "updatedAt">> {
  return [
    {
      id: "requirements-modeling-prompt",
      name: "需求建模 Prompt 包",
      kind: "prompt",
      version: "v1",
      status: "stable" as const,
      approver: "system",
    },
    {
      id: "design-modeling-prompt",
      name: "设计建模 Prompt 包",
      kind: "prompt",
      version: "v1",
      status: "stable" as const,
      approver: "system",
    },
    {
      id: "ui-ux-pro-max-skill",
      name: "代码生成 UI/UX Skill",
      kind: "skill",
      version: "v1",
      status: "stable" as const,
      approver: "system",
    },
  ];
}

export function createPromptRuntimeItems(): PromptRuntimeItem[] {
  const now = new Date().toISOString();
  return buildPromptRuntimeItems().map((item) => ({ ...item, updatedAt: now }));
}

export function buildPromptRuntimeListView(
  promptRuntimeItems: PromptRuntimeItem[],
) {
  return {
    generatedAt: new Date().toISOString(),
    promptRuntimeItems,
  };
}

export function getPromptRuntimeVersionsView(
  promptRuntimeItems: PromptRuntimeItem[],
  promptRuntimeItemId: string,
) {
  const item = promptRuntimeItems.find(
    (entry) => entry.id === promptRuntimeItemId,
  );
  if (!item) {
    return {
      statusCode: 404,
      body: { message: "Prompt runtime item not found" },
    };
  }

  return {
    statusCode: 200,
    body: {
      generatedAt: new Date().toISOString(),
      versions: [
        {
          id: `${item.id}-${item.version}`,
          itemId: item.id,
          version: item.version,
          status: item.status,
          createdAt: item.updatedAt,
        },
      ],
    },
  };
}

function safeConfigValue(value: string | undefined, fallback = "not configured") {
  return value?.trim() ? value.trim() : fallback;
}

export function buildSystemConfig() {
  return [
    {
      id: "admin-api",
      name: "Admin API",
      value: `port ${safeConfigValue(process.env.API_PORT, "4101")}`,
      status: "healthy",
      auditRequired: false,
    },
    {
      id: "render-service",
      name: "Render Service",
      value: safeConfigValue(process.env.RENDER_SERVICE_URL),
      status: process.env.RENDER_SERVICE_URL ? "healthy" : "degraded",
      auditRequired: false,
    },
    {
      id: "onlyoffice",
      name: "OnlyOffice",
      value: safeConfigValue(process.env.ONLYOFFICE_DOCUMENT_SERVER_URL),
      status: process.env.ONLYOFFICE_DOCUMENT_SERVER_URL ? "healthy" : "degraded",
      auditRequired: true,
    },
    {
      id: "plantuml",
      name: "PlantUML",
      value: safeConfigValue(process.env.PLANTUML_SERVER_URL),
      status: process.env.PLANTUML_SERVER_URL ? "healthy" : "degraded",
      auditRequired: false,
    },
    {
      id: "document-storage",
      name: "Document storage",
      value: safeConfigValue(process.env.UML_DOCUMENT_STORAGE_DIR, ".local-documents"),
      status: "healthy",
      auditRequired: true,
    },
    {
      id: "cors-origins",
      name: "CORS allowlist",
      value: safeConfigValue(process.env.API_CORS_ORIGINS),
      status: process.env.API_CORS_ORIGINS ? "healthy" : "degraded",
      auditRequired: true,
    },
    {
      id: "alerting",
      name: "Alerting",
      value: safeConfigValue(process.env.UML_ALERT_WEBHOOK_URL, "not configured"),
      status: process.env.UML_ALERT_WEBHOOK_URL ? "healthy" : "degraded",
      auditRequired: true,
    },
  ];
}

export function buildSystemConfigView() {
  return {
    generatedAt: new Date().toISOString(),
    systemConfig: buildSystemConfig(),
  };
}

export function buildSystemLogs() {
  return [
    {
      id: "recent-errors",
      level: "info",
      message: "No centralized error log adapter configured",
      source: "api",
      createdAt: new Date().toISOString(),
    },
  ];
}

export function buildSystemLogsView() {
  return {
    generatedAt: new Date().toISOString(),
    logs: buildSystemLogs(),
  };
}

type ServiceHealthItem = {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number | null;
  measuredAt: string;
  note: string;
  source: string;
};

let healthCache: { expiresAt: number; services: ServiceHealthItem[] } | null = null;

async function timedProbe({
  name,
  source,
  probe,
}: {
  name: string;
  source: string;
  probe?: () => Promise<void>;
}): Promise<ServiceHealthItem> {
  const measuredAt = new Date().toISOString();
  if (!probe) {
    return { name, source, measuredAt, latencyMs: null, status: "degraded", note: "未配置探测" };
  }
  const startedAt = performance.now();
  try {
    await probe();
    const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
    return {
      name,
      source,
      measuredAt,
      latencyMs,
      status: latencyMs >= 1_000 ? "degraded" : "healthy",
      note: latencyMs >= 1_000 ? "服务可用，但响应偏慢" : "服务探测成功",
    };
  } catch {
    return {
      name,
      source,
      measuredAt,
      latencyMs: null,
      status: "down",
      note: "服务探测失败或超时",
    };
  }
}

function httpProbe(baseUrl: string | undefined, path = "/") {
  if (!baseUrl?.trim()) return undefined;
  return async () => {
    const url = new URL(path, `${baseUrl.replace(/\/+$/u, "")}/`).toString();
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(3_000),
      redirect: "manual",
    });
    if (!response.ok && response.status !== 301 && response.status !== 302) {
      throw new Error("health probe failed");
    }
  };
}

export async function buildSystemHealthView({
  providerConfigs,
  databaseProbe,
}: {
  providerConfigs: ProviderConfigStore;
  databaseProbe?: () => Promise<void>;
}) {
  if (healthCache && healthCache.expiresAt > Date.now()) {
    return { generatedAt: new Date().toISOString(), services: healthCache.services };
  }
  const services = await Promise.all([
    timedProbe({ name: "管理 API", source: "internal", probe: async () => undefined }),
    timedProbe({ name: "数据库", source: "postgres", probe: databaseProbe }),
    timedProbe({
      name: "供应商配置存储",
      source: "provider_config_store",
      probe: async () => {
        await providerConfigs.list();
      },
    }),
    timedProbe({
      name: "Render Service",
      source: "render_service",
      probe: httpProbe(process.env.RENDER_SERVICE_URL, "/health"),
    }),
    timedProbe({
      name: "PlantUML",
      source: "plantuml",
      probe: httpProbe(process.env.PLANTUML_SERVER_URL),
    }),
    timedProbe({
      name: "OnlyOffice",
      source: "onlyoffice",
      probe: httpProbe(process.env.ONLYOFFICE_DOCUMENT_SERVER_URL, "/healthcheck"),
    }),
  ]);
  healthCache = { expiresAt: Date.now() + 30_000, services };
  return { generatedAt: new Date().toISOString(), services };
}

export function buildSystemReleases() {
  return [
    {
      id: "api-release",
      name: "API",
      version: safeConfigValue(process.env.npm_package_version, "0.0.1"),
      sha: safeConfigValue(process.env.GIT_COMMIT_SHA, "not configured"),
      directory: process.cwd(),
      createdAt: new Date().toISOString(),
    },
    {
      id: "admin-web-release",
      name: "Admin Web",
      version: safeConfigValue(process.env.UML_ADMIN_WEB_VERSION, "not configured"),
      sha: safeConfigValue(process.env.UML_ADMIN_WEB_SHA, "not configured"),
      directory: safeConfigValue(process.env.UML_ADMIN_WEB_DIR),
      createdAt: new Date().toISOString(),
    },
  ];
}

export function buildSystemReleasesView() {
  return {
    generatedAt: new Date().toISOString(),
    releases: buildSystemReleases(),
  };
}
