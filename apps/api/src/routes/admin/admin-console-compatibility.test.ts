// Exercises the independently deployed console client against real platform routes when its checkout is available.
import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createApiServer } from "../../index.js";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { createProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import { createFileDocumentLibrary } from "../../documents/library/document-library.js";
import { createRunRecordStore } from "../../runs/records/run-record-store.js";
import { createEmptySnapshot } from "../../runs/records/snapshots.js";

const consoleRoot = process.env.UML_ADMIN_CONSOLE_ROOT;
test(
  "independent admin client consumes current platform responses across all existing domains",
  { skip: !consoleRoot },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "uml-admin-compat-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const authStore = createInMemoryAuthStore();
    const admin = authStore.createUser({
      email: "admin@example.test",
      displayName: "Compatibility Admin",
      passwordHash: "unused",
      systemRoles: ["super_admin"],
    });
    authStore.updateUser(admin.id, { mfaEnabled: true });
    const session = authStore.createSession({ userId: admin.id, ipAddress: null, userAgent: null });
    const project = authStore.createProject({
      ownerUserId: admin.id,
      name: "Compatibility Project",
      description: "Isolated contract fixture",
      visibility: "private",
    }).project;
    const runs = createRunRecordStore();
    const snapshot = createEmptySnapshot("compat-run", "compatibility requirements", ["usecase"]);
    snapshot.status = "completed";
    runs.set("compat-run", {
      snapshot,
      events: [],
      listeners: new Set(),
      terminal: true,
      metadata: { projectId: project.id, userId: admin.id, createdAt: new Date().toISOString() },
    });
    authStore.recordAuditLog({
      actorUserId: admin.id,
      action: "mcp.list_projects",
      targetType: "project",
      targetId: null,
      outcome: "success",
      message: JSON.stringify({
        connectionId: "historical-grant",
        clientId: "test-client",
        durationMs: 10,
      }),
    });
    const app = await createApiServer({
      authStore,
      runRecordStore: runs,
      providerConfigStore: createProviderConfigStore(),
      documentLibrary: createFileDocumentLibrary(directory),
      nodeEnv: "test",
    });
    app.log.level = "silent";
    t.after(() => app.close());
    // No build/runtime dependency on the independent console: the optional checkout is used only for interoperability testing.
    const { createAdminApiClient } = await import(
      pathToFileURL(join(consoleRoot!, "src/services/admin-api.ts")).href
    );
    const client = createAdminApiClient({
      apiBaseUrl: "http://platform.test",
      fetcher: async (url: string, init?: RequestInit) => {
        const request = new URL(url);
        const response = await app.inject({
          method: (init?.method ?? "GET") as "GET" | "POST",
          url: request.pathname + request.search,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers)),
            cookie: "uml_admin_session=" + session.id,
          },
          ...(init?.body ? { payload: String(init.body) } : {}),
        });
        assert.equal(response.statusCode, 200, request.pathname + ": " + response.body);
        return new Response(response.body, {
          status: response.statusCode,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    assert.ok((await client.getMetrics()).metrics.length > 0);
    assert.ok(
      (await client.getUsers()).some(
        (u: { id: string; name: string }) => u.id === admin.id && u.name === "Compatibility Admin",
      ),
    );
    assert.equal((await client.getProjectDetail(project.id)).project.id, project.id);
    assert.equal((await client.getRun("compat-run")).status, "completed");
    assert.ok(
      (await client.getRoles()).some(
        (role: { id: string; permissions: string[] }) =>
          role.id === "security_admin" && role.permissions.includes("admin.mcp.revoke"),
      ),
    );
    for (const method of [
      "getOrganizationUnits",
      "getProjects",
      "getRuns",
      "getDocuments",
      "getModelProviders",
      "getPromptRuntimeItems",
      "getAuditLogs",
      "getRiskEvents",
      "getRateLimits",
      "getSystemConfig",
      "getServiceHealth",
      "getSystemNotices",
      "getBillingOrders",
      "getBillingNotifications",
      "getAdminInvitations",
    ]) {
      assert.ok(Array.isArray(await client[method]()), method);
    }
    const window = {
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
      to: new Date().toISOString(),
    };
    await client.getPerformanceMetrics(window);
    await client.getEvaluationMetrics(window);
    await client.getEvaluationReviews(window);
    await client.getBillingUserLedger(admin.id);
    assert.equal((await client.getMcpUsers({ userId: admin.id })).users[0].successfulCalls, 1);
    assert.equal((await client.getMcpCalls()).calls[0].clientId, "test-client");
    assert.equal((await client.getMcpOverview()).historicalUserCount, 1);
    await client.getMcpConnections();
  },
);
