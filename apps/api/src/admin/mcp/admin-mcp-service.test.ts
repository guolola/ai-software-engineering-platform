// Verifies retained usage semantics, metadata resilience, server paging and revocation auditing.
import assert from "node:assert/strict";
import test from "node:test";
import { adminMcpQuerySchema } from "@uml-platform/contracts";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { createInMemoryMcpStore, type McpConnection } from "../../mcp/records/mcp-store.js";
import { createAdminMcpService } from "./admin-mcp-service.js";
import type { AdminActor } from "../../security/admin-guard.js";

async function fixture() {
  const authStore = createInMemoryAuthStore();
  const store = createInMemoryMcpStore();
  const alice = authStore.createUser({
    email: "alice@example.test",
    displayName: "Alice",
    passwordHash: "unused",
  });
  const bob = authStore.createUser({
    email: "bob@example.test",
    displayName: "Bob",
    passwordHash: "unused",
  });
  const unused = authStore.createUser({
    email: "unused@example.test",
    displayName: "Unused",
    passwordHash: "unused",
  });
  const usedWithoutLogs = authStore.createUser({
    email: "retained@example.test",
    displayName: "Retained",
    passwordHash: "unused",
  });
  const project = authStore.createProject({ name: "Project", ownerUserId: alice.id }).project;
  const connection = (
    userId: string,
    id: string,
    extra: Partial<McpConnection> = {},
  ): McpConnection => ({
    id,
    userId,
    clientId: "personal-token",
    name: id,
    kind: "pat",
    projectIds: [],
    tokenHash: "secret-hash-" + id,
    createdAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-12-01T00:00:00.000Z",
    revokedAt: null,
    lastUsedAt: null,
    ...extra,
  });
  await store.putConnection(connection(alice.id, "a", { lastUsedAt: "2026-10-08T00:00:00.000Z" }));
  await store.putConnection(
    connection(alice.id, "expired", {
      kind: "oauth",
      projectIds: [project.id],
      expiresAt: "2026-09-02T00:00:00.000Z",
    }),
  );
  await store.putConnection(connection(bob.id, "b", { revokedAt: "2026-10-08T00:00:00.000Z" }));
  await store.putConnection(connection(unused.id, "u"));
  await store.putConnection(
    connection(usedWithoutLogs.id, "retained", { lastUsedAt: "2026-08-01T00:00:00.000Z" }),
  );
  async function audit(
    userId: string,
    action: string,
    createdAt: string,
    message?: string,
    targetId: string | null = null,
    outcome: "success" | "failure" = "success",
  ) {
    const entry = authStore.recordAuditLog({
      actorUserId: userId,
      action,
      targetType: "project",
      targetId,
      outcome,
      message,
    });
    entry.createdAt = createdAt;
    return entry;
  }
  await audit(
    alice.id,
    "mcp.list_projects",
    "2026-08-01T00:00:00.000Z",
    JSON.stringify({ connectionId: "expired", clientId: "old", durationMs: 1 }),
  );
  await audit(
    alice.id,
    "mcp.get_artifact",
    "2026-10-08T00:00:00.000Z",
    JSON.stringify({ connectionId: "a", clientId: "personal-token", durationMs: 25 }),
    project.id,
  );
  await audit(
    bob.id,
    "mcp.list_projects",
    "2026-10-08T00:00:00.000Z",
    "{invalid-json",
    null,
    "failure",
  );
  await audit(alice.id, "mcp.authorize", "2026-10-08T00:00:00.000Z");
  await audit(alice.id, "mcp.oauth", "2026-10-08T00:00:00.000Z");
  const service = createAdminMcpService({
    authStore,
    store,
    enabled: false,
    now: () => new Date("2026-10-09T00:00:00.000Z"),
  });
  return { authStore, store, alice, bob, unused, project, service };
}
test("history separates calls from grants, retains expired users, and never invents counts", async () => {
  const s = await fixture();
  const q = adminMcpQuerySchema.parse({});
  const overview = await s.service.overview(q);
  assert.equal(overview.enabled, false);
  assert.equal(overview.historicalUserCount, 3);
  assert.equal(overview.activeConnectionCount, 3);
  assert.equal(overview.successfulCalls, 1);
  assert.equal(overview.failedCalls, 1);
  const used = await s.service.users(adminMcpQuerySchema.parse({ usage: "used" }));
  assert.equal(used.total, 3);
  const alice = used.users.find((u) => u.userId === s.alice.id)!;
  assert.equal(alice.connectionCount, 2);
  assert.equal(alice.successfulCalls, 2);
  assert.equal(used.users.find((u) => u.userName === "Retained")!.successfulCalls, 0);
  assert.deepEqual(
    (await s.service.users(adminMcpQuerySchema.parse({ usage: "unused" }))).users.map(
      (u) => u.userId,
    ),
    [s.unused.id],
  );
});
test("filters apply before pagination, timestamps allow offsets and malformed metadata stays unknown", async () => {
  const s = await fixture();
  const recent = await s.service.calls(adminMcpQuerySchema.parse({ pageSize: 1 }));
  assert.equal(recent.total, 2);
  assert.equal(recent.calls.length, 1);
  const next = await s.service.calls(adminMcpQuerySchema.parse({ pageSize: 1, page: 2 }));
  assert.notEqual(next.calls[0].id, recent.calls[0].id);
  const bob = await s.service.calls(adminMcpQuerySchema.parse({ outcome: "failure" }));
  assert.equal(bob.calls[0].connectionId, null);
  assert.equal(bob.calls[0].durationMs, null);
  assert.equal(bob.calls[0].projectId, null);
  const history = await s.service.calls(
    adminMcpQuerySchema.parse({
      userId: s.alice.id,
      from: "2026-07-31T20:00:00-04:00",
      to: "2026-08-01T08:00:00+08:00",
    }),
  );
  assert.equal(history.total, 1);
  const account = await s.service.connections(
    adminMcpQuerySchema.parse({ projectId: s.project.id, kind: "pat" }),
  );
  assert.equal(account.total, 1);
  assert.equal(account.connections[0].projectScope, "account");
  assert.ok(!JSON.stringify(account).includes("secret-hash"));
  assert.ok(!JSON.stringify(account).includes("tokenHash"));
  const selected = await s.service.connections(adminMcpQuerySchema.parse({ kind: "oauth" }));
  assert.equal(selected.connections[0].projects[0].name, "Project");
  s.authStore.updateUser(s.alice.id, { status: "disabled" });
  assert.equal(
    (await s.service.connections(adminMcpQuerySchema.parse({ connectionId: "a" }))).connections[0]
      .status,
    "user_disabled",
  );
});
test("revocation is idempotent and records the administrator, owner and outcome", async () => {
  const s = await fixture();
  const actor: AdminActor = {
    id: s.alice.id,
    name: "Admin",
    role: "security_admin",
    roles: ["security_admin"],
    permissions: ["admin.mcp.revoke"],
    dataScopes: ["system"],
  };
  assert.equal((await s.service.revoke(actor, "a"))!.alreadyRevoked, false);
  assert.equal((await s.service.revoke(actor, "a"))!.alreadyRevoked, true);
  assert.equal(await s.service.revoke(actor, "missing"), null);
  const logs = s.authStore.listAuditLogs().filter((l) => l.action === "admin.mcp.revoke");
  assert.equal(logs.length, 3);
  assert.equal(logs[0].actorUserId, actor.id);
  assert.equal(JSON.parse(logs[0].message!).userId, s.alice.id);
  assert.equal(logs[2].outcome, "failure");
  const connections = await s.service.connections(adminMcpQuerySchema.parse({ connectionId: "a" }));
  assert.equal(connections.connections[0].status, "revoked");
  assert.equal(connections.connections[0].activities.length, 2);
});
