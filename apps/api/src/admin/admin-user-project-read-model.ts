// Builds admin user/project list views after route-level permission checks.
import type { BillingService } from "../billing/billing-service.js";
import { toLoginEventDto, toProjectDto, toProjectMemberDto } from "../auth/dto.js";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { AcademicAdminRepository } from "../db/academic-admin-repository.js";
import type { AdminActor } from "../security/admin-guard.js";
import {
  visibleProjectsForAdmin,
  visibleUserIdsForAdmin,
} from "./academic-scope.js";
import { toAdminUserDto } from "./admin-route-presenters.js";

type AdminBillingSummaryProvider = Pick<BillingService, "getSummary">;

export async function listVisibleAdminUserDtos({
  academicStore,
  authStore,
  billingService,
  actor,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  billingService?: AdminBillingSummaryProvider;
  actor: AdminActor;
}) {
  const visibleUserIds = await visibleUserIdsForAdmin(academicStore, authStore, actor);
  const visibleUsers = (await authStore.listUsers()).filter(
    (user) => visibleUserIds === null || visibleUserIds.has(user.id),
  );
  const latestLogins = new Map(
    (await authStore.listLatestSuccessfulLoginEvents(visibleUsers.map((user) => user.id)))
      .map(toLoginEventDto)
      .flatMap((event) => (event.userId ? [[event.userId, event] as const] : [])),
  );
  return Promise.all(
    visibleUsers.map((user) => toAdminUserDto(user, billingService, latestLogins.get(user.id))),
  );
}

export async function buildAdminUserListView({
  academicStore,
  authStore,
  billingService,
  actor,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  billingService?: AdminBillingSummaryProvider;
  actor: AdminActor;
}) {
  return {
    generatedAt: new Date().toISOString(),
    users: await listVisibleAdminUserDtos({
      academicStore,
      authStore,
      billingService,
      actor,
    }),
  };
}

export async function getAdminUserLoginRecordView({
  academicStore,
  authStore,
  billingService,
  actor,
  userId,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  billingService?: AdminBillingSummaryProvider;
  actor: AdminActor;
  userId: string;
}) {
  const user = await authStore.getUser(userId);
  if (!user) {
    return { statusCode: 404, body: { message: "User not found" } } as const;
  }

  const visibleUserIds = await visibleUserIdsForAdmin(academicStore, authStore, actor);
  if (visibleUserIds !== null && !visibleUserIds.has(userId)) {
    return {
      statusCode: 403,
      body: { message: "User is outside admin data scope" },
    } as const;
  }

  return {
    statusCode: 200,
    body: {
      generatedAt: new Date().toISOString(),
      user: await toAdminUserDto(user, billingService),
      loginRecords: (await authStore.listLoginEventsForUser(userId)).map(toLoginEventDto),
    },
  } as const;
}

export async function listVisibleAdminProjectDtos({
  academicStore,
  authStore,
  actor,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  actor: AdminActor;
}) {
  return (await visibleProjectsForAdmin(academicStore, authStore, actor)).map(toProjectDto);
}

export async function buildAdminProjectListView({
  academicStore,
  authStore,
  actor,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  actor: AdminActor;
}) {
  return {
    generatedAt: new Date().toISOString(),
    projects: await listVisibleAdminProjectDtos({
      academicStore,
      authStore,
      actor,
    }),
  };
}

export async function getAdminUserProjectsView({
  academicStore,
  authStore,
  actor,
  userId,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  actor: AdminActor;
  userId: string;
}) {
  const visibleUserIds = await visibleUserIdsForAdmin(academicStore, authStore, actor);
  if (visibleUserIds !== null && !visibleUserIds.has(userId)) {
    return { statusCode: 403, body: { message: "User is outside admin data scope" } } as const;
  }
  const user = await authStore.getUser(userId);
  if (!user) return { statusCode: 404, body: { message: "User not found" } } as const;
  const projects = await visibleProjectsForAdmin(academicStore, authStore, actor);
  const related = [];
  for (const project of projects) {
    const members = await authStore.listProjectMembers(project.id);
    if (
      project.ownerUserId === userId ||
      members.some((member) => member.userId === userId && member.status === "active")
    ) {
      related.push(toProjectDto(project));
    }
  }
  return { statusCode: 200, body: { generatedAt: new Date().toISOString(), projects: related } } as const;
}

export async function getAdminProjectDetailView({
  academicStore,
  authStore,
  actor,
  projectId,
}: {
  academicStore: AcademicAdminRepository;
  authStore: AuthStore;
  actor: AdminActor;
  projectId: string;
}) {
  const project = (await visibleProjectsForAdmin(academicStore, authStore, actor)).find(
    (candidate) => candidate.id === projectId,
  );
  if (!project) return { statusCode: 404, body: { message: "Project not found" } } as const;
  const members = await authStore.listProjectMembers(project.id);
  return {
    statusCode: 200,
    body: {
      generatedAt: new Date().toISOString(),
      project: toProjectDto(project),
      members: members.map(toProjectMemberDto),
    },
  } as const;
}
