// Locks admin pagination, query validation, and least-privilege MCP grants.
import assert from "node:assert/strict";
import test from "node:test";
import { adminMcpQuerySchema } from "./admin.js";
import { adminRolePermissions, adminRoleCapabilities } from "../admin-rbac.js";
test("admin MCP query defaults and bounds", () => {
  assert.deepEqual(adminMcpQuerySchema.parse({}), { page: 1, pageSize: 20, q: "" });
  assert.equal(adminMcpQuerySchema.parse({ page: "2", pageSize: "100" }).page, 2);
  for (const value of [
    { page: 0 },
    { pageSize: 101 },
    { tool: "mcp.oauth" },
    { from: "2026-10-09T00:00:00Z", to: "2026-10-08T00:00:00Z" },
    { token: "secret" },
  ]) {
    assert.equal(adminMcpQuerySchema.safeParse(value).success, false);
  }
});
test("MCP governance is global operations/security/audit only", () => {
  for (const [role, grants] of Object.entries(adminRolePermissions)) {
    assert.equal(
      (grants as readonly string[]).includes("admin.mcp.read"),
      ["super_admin", "security_admin", "system_operator", "auditor"].includes(role),
      role,
    );
    assert.equal(
      (grants as readonly string[]).includes("admin.mcp.revoke"),
      ["super_admin", "security_admin"].includes(role),
      role,
    );
  }
  assert.ok(adminRoleCapabilities.security_admin.includes("revokeMcp"));
  assert.ok(adminRoleCapabilities.auditor.includes("viewMcp"));
});
