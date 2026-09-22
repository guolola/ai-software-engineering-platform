// Verifies account settings preloading and request stability through the real browser UI.
import { expect, test } from "@playwright/test";
import { mockProjectApi, projectId } from "./fixtures/project-workspace";

const now = "2026-09-22T02:00:00.000Z";

function json(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

test("preloads global settings before the tab is selected without duplicate requests", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("uml-lab-locale-preference", "zh-CN");
  });
  await mockProjectApi(page);

  const requestCounts = {
    me: 0,
    providerConfigs: 0,
    billingSummary: 0,
  };

  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/me") requestCounts.me += 1;
    if (pathname === "/api/provider-configs") requestCounts.providerConfigs += 1;
    if (pathname === "/api/billing/summary") requestCounts.billingSummary += 1;
  });

  await page.route("**/api/provider-configs", async (route) => {
    await route.fulfill(
      json({
        generatedAt: now,
        providerConfigs: [
          {
            id: "provider-1",
            name: "课程 OpenAI",
            provider: "openai",
            baseUrl: "https://api.example.test/v1",
            defaultModel: "gpt-5.6",
            allowedModels: ["gpt-5.6", "gpt-5.5"],
            maskedKey: "sk-***",
            keyPurpose: "course",
            status: "active",
            riskState: "approved",
            quota: "managed",
            createdBy: "admin-1",
            createdAt: now,
            updatedAt: now,
            lastUsedAt: null,
            allowlisted: true,
            scopeType: "system",
            scopeId: null,
          },
        ],
      }),
    );
  });
  await page.route("**/api/billing/summary", async (route) => {
    await route.fulfill(
      json({
        creditBalance: 8,
        signupBonus: { granted: false, creditAmount: 0, validUntil: null },
        recentOrders: [],
      }),
    );
  });
  await page.route("**/api/account/profile", async (route) => {
    await route.fulfill(
      json({
        user: {
          id: "user-1",
          email: "model-nav@example.test",
          displayName: "Model Nav Reviewer",
          status: "active",
          emailVerified: true,
          mfaEnabled: false,
        },
        session: {
          id: "session-1",
          userId: "user-1",
          createdAt: now,
          expiresAt: "2026-10-22T02:00:00.000Z",
          lastSeenAt: now,
          ipAddress: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0",
        },
        mfa: { enabled: false, enforcement: "totp" },
        generationUsage: {
          usedToday: 0,
          limit: null,
          remaining: null,
          windowSeconds: 86400,
          limited: false,
          scope: "user",
        },
      }),
    );
  });
  await page.route("**/api/account/sessions", async (route) => {
    await route.fulfill(
      json({
        sessions: [
          {
            id: "session-1",
            userId: "user-1",
            createdAt: now,
            expiresAt: "2026-10-22T02:00:00.000Z",
            lastSeenAt: now,
            ipAddress: "127.0.0.1",
            locationLabel: "本机",
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0",
          },
        ],
      }),
    );
  });

  await page.goto(`/projects/${projectId}`);
  await expect(page.locator("#requirement-text")).toBeVisible();
  await expect.poll(() => requestCounts.providerConfigs).toBe(1);

  await page.getByRole("button", { name: "账号" }).click();
  await page.getByRole("menuitem", { name: "账号" }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => requestCounts.billingSummary).toBe(1);

  const countsBeforeTabSwitch = { ...requestCounts };
  await dialog.getByRole("tab", { name: "全局设置" }).click();
  await expect(dialog.getByLabel("托管 Provider 配置")).toContainText("课程 OpenAI");
  await expect(dialog.getByLabel("默认模型")).toContainText("gpt-5.6");

  await expect.poll(() => ({ ...requestCounts })).toEqual(countsBeforeTabSwitch);
});
