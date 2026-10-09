// Exercises real admin sessions, all MCP governance roles and feature-off historical access.
import assert from "node:assert/strict";
import test from "node:test";
import {
  type AdminRole,
  adminMcpOverviewSchema,
  adminMcpUsersResponseSchema,
  adminMcpConnectionsResponseSchema,
  adminMcpCallsResponseSchema,
} from "@uml-platform/contracts";
import { createConfiguredFastifyApp } from "../../server/fastify-app.js";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { createInMemoryMcpStore } from "../../mcp/records/mcp-store.js";
import { registerMcpModule } from "../../mcp/server/register-mcp-module.js";
test("admin MCP read/write roles, validation, secret boundary and feature-off access", async (t) => {
  const app = await createConfiguredFastifyApp();
  app.log.level = "silent";
  t.after(() => app.close());
  const authStore = createInMemoryAuthStore();
  const store = createInMemoryMcpStore();
  await registerMcpModule({ app, authStore, store, pool: null, production: false, config: null });
  const owner = authStore.createUser({
    email: "owner@example.test",
    displayName: "Owner",
    passwordHash: "private-password",
  });
  await store.putConnection({
    id: "grant",
    userId: owner.id,
    name: "Coding agent",
    clientId: "test-client",
    kind: "oauth",
    projectIds: [],
    tokenHash: "secret-hash",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    revokedAt: null,
    lastUsedAt: null,
  });
  await store.putEntity({
    model: "RefreshToken",
    id: "private-refresh",
    payload: { grantId: "grant" },
    expiresAt: null,
  });
  assert.equal((await app.inject({ url: "/api/admin/mcp/users" })).statusCode, 401);
  for (const role of [
    "super_admin",
    "security_admin",
    "system_operator",
    "auditor",
    "course_admin",
    "project_admin",
    "teacher_assistant",
    "model_admin",
  ] as AdminRole[]) {
    const user = authStore.createUser({
      email: role + "@example.test",
      displayName: role,
      passwordHash: "private",
      systemRoles: [role],
    });
    authStore.updateUser(user.id, { mfaEnabled: true });
    const session = authStore.createSession({ userId: user.id, ipAddress: null, userAgent: null });
    const headers = { cookie: "uml_admin_session=" + session.id };
    const canRead = ["super_admin", "security_admin", "system_operator", "auditor"].includes(role);
    const schemas = {
      overview: adminMcpOverviewSchema,
      users: adminMcpUsersResponseSchema,
      connections: adminMcpConnectionsResponseSchema,
      calls: adminMcpCallsResponseSchema,
    };
    for (const [path, schema] of Object.entries(schemas)) {
      const response = await app.inject({ url: "/api/admin/mcp/" + path, headers });
      assert.equal(response.statusCode, canRead ? 200 : 403, role + "/" + path);
      if (canRead) {
        schema.parse(response.json());
        assert.ok(!/secret-hash|private-password|private-refresh|tokenHash/.test(response.body));
      }
    }
    const revoke = await app.inject({
      method: "POST",
      url: "/api/admin/mcp/connections/grant/revoke",
      headers,
    });
    assert.equal(
      revoke.statusCode,
      ["super_admin", "security_admin"].includes(role) ? 200 : 403,
      role,
    );
    if (role === "super_admin") {
      assert.equal(
        (await app.inject({ url: "/api/admin/mcp/calls?pageSize=101", headers })).statusCode,
        400,
      );
      assert.equal(
        (await app.inject({ url: "/api/admin/mcp/overview", headers })).json().enabled,
        false,
      );
      assert.equal(
        (
          await app.inject({
            url: "/api/admin/mcp/users",
            headers: { cookie: "uml_session=" + session.id },
          })
        ).statusCode,
        401,
      );
      authStore.updateUser(user.id, { mfaEnabled: false });
      assert.equal((await app.inject({ url: "/api/admin/mcp/users", headers })).statusCode, 403);
    }
  }
  const ordinary = authStore.createSession({ userId: owner.id, ipAddress: null, userAgent: null });
  assert.equal(
    (
      await app.inject({
        url: "/api/admin/mcp/users",
        headers: { cookie: "uml_admin_session=" + ordinary.id },
      })
    ).statusCode,
    403,
  );
  assert.equal(await store.findEntity("RefreshToken", "id", "private-refresh"), undefined);
  assert.ok(
    authStore
      .listAuditLogs()
      .some((log) => log.action === "admin.mcp.revoke" && log.outcome === "failure"),
  );
});
