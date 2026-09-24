// Handles admin governance mutations after route-level high-risk permission checks.
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { AdminActor } from "../security/admin-guard.js";
import { actorLabel } from "./admin-route-presenters.js";
import { recordAdminAction } from "./admin-route-security.js";

type RolePermissionReview = {
  id: string;
  highRisk: boolean;
};

type AdminGovernanceActionResult = Promise<{
  statusCode: number;
  body: unknown;
}>;

export async function reviewAdminRoleHighRiskPermissions({
  authStore,
  actor,
  roleId,
  findRole,
}: {
  authStore: AuthStore;
  actor: AdminActor;
  roleId: string;
  findRole: (roleId: string) => RolePermissionReview | null;
}): AdminGovernanceActionResult {
  const role = findRole(roleId);
  if (!role) {
    return { statusCode: 404, body: { message: "Admin role not found" } };
  }
  if (!role.highRisk) {
    return {
      statusCode: 400,
      body: { message: "Role does not contain high-risk permissions" },
    };
  }

  const auditLog = await recordAdminAction(authStore, {
    actor,
    action: "admin.role_permissions.review",
    targetType: "admin_role",
    targetId: roleId,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} reviewed high-risk permissions for role ${roleId}`,
  });
  return {
    statusCode: 200,
    body: {
      auditLog,
      auditMessage: "审计已记录：高危角色权限已复核",
      role,
    },
  };
}
