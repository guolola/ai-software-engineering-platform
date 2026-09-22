// Verifies that the primary public, account, and project workflows do not create page-level horizontal overflow.
import { expect, test, type Page } from "@playwright/test";
import { mockProjectApi, projectId } from "./fixtures/project-workspace";

const widths = [360, 375, 768, 1440] as const;

async function expectNoPageOverflow(page: Page, label: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(
    () => page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
    { message: `${label} should not overflow the page horizontally` },
  ).toEqual(await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.clientWidth,
  })));
}

async function checkViewportMatrix(page: Page, label: string) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await expectNoPageOverflow(page, `${label} at ${width}px`);
  }
}

test("public home, dashboard, projects, and MFA fit the mobile viewport", async ({ page }, info) => {
  await mockProjectApi(page);
  await page.route("**/api/projects", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projects: [{
          id: projectId,
          name: "座位预约系统",
          description: "移动端布局验收项目",
          visibility: "private",
          status: "active",
          ownerUserId: "user-1",
          ownerDisplayName: "Model Nav Reviewer",
          updatedAt: "2026-09-22T02:00:00.000Z",
          memberCount: 1,
          memberPreviews: [],
        }],
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("示例项目概览", { exact: true })).toBeVisible();
  await checkViewportMatrix(page, "home");
  await page.screenshot({ path: info.outputPath("home-360.png"), fullPage: true });

  await page.goto("/dashboard");
  await expect(page.getByText("性能", { exact: true })).toBeVisible();
  await checkViewportMatrix(page, "dashboard");

  await page.goto("/projects");
  const filters = page.getByTestId("projects-filter-panel");
  await expect(filters).toBeVisible();
  await checkViewportMatrix(page, "projects");
  await page.setViewportSize({ width: 360, height: 844 });
  const scopeButtons = filters.getByRole("group", { name: "项目范围" }).getByRole("button");
  await expect(scopeButtons).toHaveCount(4);
  const scopeBoxes = await scopeButtons.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().width));
  expect(Math.max(...scopeBoxes) - Math.min(...scopeBoxes)).toBeLessThan(1);

  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mfaChallenge: {
          challengeId: "mobile-mfa",
          expiresAt: "2026-09-22T12:00:00.000Z",
        },
      }),
    });
  });
  await page.goto("/login");
  await page.getByLabel("邮箱或用户名").fill("mobile@example.test");
  await page.locator("#auth-password").fill("not-a-real-password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.locator('[data-slot="input-otp-group"]')).toBeVisible();
  await checkViewportMatrix(page, "MFA login");
  await page.setViewportSize({ width: 360, height: 844 });
  const mfaSlots = page.locator('[data-slot="input-otp-slot"]');
  await expect(mfaSlots).toHaveCount(6);
  for (const box of await mfaSlots.evaluateAll((slots) => slots.map((slot) => slot.getBoundingClientRect()))) {
    expect(box.width).toBe(36);
  }
});

test("workspace stages, details, code preview, tests, and account dialog fit the responsive viewport matrix", async ({ page }, info) => {
  await mockProjectApi(page, {
    codeFiles: {
      "/src/App.tsx": "export default function App() { return <main>Mobile preview</main>; }",
      "/src/main.tsx": "import { createRoot } from 'react-dom/client'; import App from './App'; createRoot(document.getElementById('root')!).render(<App/>);",
    },
    codeEntryFile: "/src/main.tsx",
    testCases: [{
      id: "TC-1",
      title: "预约座位成功",
      description: "验证预约主流程",
      scenarioType: "normal",
      preconditions: [],
      steps: [],
      expectedResults: [],
      relatedRequirementRuleIds: ["r1"],
    }],
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);
  const navigation = page.getByRole("navigation", { name: "项目导航" });

  await expect(page.locator("#requirement-text")).toBeVisible();
  await checkViewportMatrix(page, "system requirements");
  await page.setViewportSize({ width: 360, height: 844 });
  const requirementToolbar = page.getByTestId("requirements-input-toolbar");
  await expect(requirementToolbar).toBeVisible();
  expect((await requirementToolbar.boundingBox())!.width).toBeLessThanOrEqual(360);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "需求模型", exact: true }).click();
  await expect(page.getByRole("heading", { name: "需求模型", exact: true })).toBeVisible();
  await checkViewportMatrix(page, "requirement models");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "展开 需求模型" }).click();
  await navigation.getByRole("button", { name: "用例模型", exact: true }).click();
  await expect(page.getByLabel("模型标题")).toBeVisible();
  await checkViewportMatrix(page, "model detail");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "设计模型", exact: true }).click();
  await expect(page.getByRole("heading", { name: "设计模型", exact: true })).toBeVisible();
  await checkViewportMatrix(page, "design models");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "代码", exact: true }).click();
  await expect(page.getByTestId("code-preview-region")).toBeVisible();
  await checkViewportMatrix(page, "code");
  await page.setViewportSize({ width: 360, height: 844 });
  await expect(page.getByTestId("code-editor-region")).toHaveCount(0);
  await expect(page.getByTestId("code-file-tabs")).toHaveCount(0);
  await expectNoPageOverflow(page, "code at 360px");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "测试", exact: true }).click();
  await expect(page.getByRole("heading", { name: "测试", exact: true })).toBeVisible();
  await checkViewportMatrix(page, "tests");
  await page.setViewportSize({ width: 360, height: 844 });
  const scenario = page.getByLabel("按测试场景筛选");
  const pageSize = page.getByLabel("每页条数");
  await expect(scenario).toBeVisible();
  await expect(pageSize).toBeVisible();
  expect(Math.abs((await scenario.boundingBox())!.y - (await pageSize.boundingBox())!.y)).toBeLessThanOrEqual(2);
  await expectNoPageOverflow(page, "tests at 360px");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "账号" }).click();
  await page.getByRole("menuitem", { name: "账号" }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await checkViewportMatrix(page, "account settings");
  await page.setViewportSize({ width: 360, height: 844 });
  await expect(dialog.getByRole("tablist", { name: "设置" })).toBeVisible();
  await expect(dialog.getByRole("tab")).toHaveCount(4);
  await expectNoPageOverflow(page, "account settings at 360px");
  await page.screenshot({ path: info.outputPath("workspace-account-360.png"), fullPage: true });
});
