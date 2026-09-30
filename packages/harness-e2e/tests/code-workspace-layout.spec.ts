// Checks the official WebPreview workspace, preserved tab state, and responsive theme layouts.
import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { projectId, mockProjectApi } from "./fixtures/project-workspace";

const previewSource = [
  "await new Promise(resolve => setTimeout(resolve, 1500));",
  "const root = document.getElementById('root')!;",
  "root.innerHTML = '<main style=padding:32px;font-family:sans-serif><h1>Layout preview</h1><button id=counter>Clicks: 0</button></main>';",
  "let count = 0;",
  "document.getElementById('counter')!.addEventListener('click', () => { document.getElementById('counter')!.textContent = 'Clicks: ' + ++count; console.info('clicked', count); });",
  "console.log('Build ready'); console.warn('Fixture warning');",
].join("\n");

test("code preview finishes loading after leaving and returning through project menus", async ({ page, context }) => {
  await mockProjectApi(page, {
    // No artificial delay: returning to the page exercises a warm compiler and fast iframe navigation.
    codeFiles: { "/src/main.tsx": previewSource.replace("await new Promise(resolve => setTimeout(resolve, 1500));\n", "") },
    codeEntryFile: "/src/main.tsx",
  });
  await page.goto(`/projects/${projectId}`);
  await page.reload();
  const projectNavigation = page.getByRole("navigation", { name: "项目导航" });
  const openCode = () => projectNavigation.getByRole("button", { name: "代码", exact: true }).click();
  const preview = page.frameLocator('iframe[title="Prototype Preview"]');
  const loading = page.getByTestId("code-workspace-frame").getByRole("progressbar");
  await openCode();
  await expect(preview.getByRole("heading", { name: "Layout preview" })).toBeVisible();
  await expect(loading).toHaveCount(0);
  for (const menu of ["系统需求", "需求模型", "设计模型", "系统需求", "需求模型"]) {
    await projectNavigation.getByRole("button", { name: menu, exact: true }).click();
    await expect(page.getByTestId("code-workspace-frame")).toHaveCount(0);
    await openCode();
    await expect(preview.getByRole("heading", { name: "Layout preview" })).toBeVisible();
    await expect(loading).toHaveCount(0);
  }
  await page.getByTestId("code-preview-navigation").getByRole("button", { name: "运行预览", exact: true }).click();
  await expect(preview.getByRole("heading", { name: "Layout preview" })).toBeVisible();
  await expect(loading).toHaveCount(0);
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "在新窗口打开", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: "Layout preview" })).toBeVisible();
  await popup.close();
});

for (const theme of ["light", "dark"]) {
  for (const width of [390, 1440]) {
    test(`${theme} ${width}px official WebPreview preserves code and preview state`, async ({ page, context }, info) => {
      // Serve the installed Monaco runtime so acceptance does not depend on CDN access.
      await page.route("https://cdn.jsdelivr.net/npm/monaco-editor@*/min/**", route => {
        const relative = new URL(route.request().url()).pathname.split("/min/")[1];
        return route.fulfill({ path: fileURLToPath(new URL(`../../../node_modules/monaco-editor/min/${relative}`, import.meta.url)), headers: { "access-control-allow-origin": "*" } });
      });
      await page.addInitScript(({ theme }) => {
        if (window === window.top) localStorage.setItem("admincn-ui-theme", theme);
        // Playwright's insertText targets text inputs; exercise Monaco's supported textarea path.
        Object.defineProperty(window, "EditContext", { configurable: true, value: undefined });
      }, { theme });
      await mockProjectApi(page, {
        codeFiles: {
          "/src/App.tsx": "export default function App() { return <main>Layout preview</main>; }",
          "/src/main.tsx": previewSource,
          "/VeryLongGeneratedPrototypeComponentNameThatShouldBeTruncated.tsx": "export const value = 1;",
        },
        codeEntryFile: "/src/main.tsx",
        codeDiagnostics: Array.from({ length: 18 }, (_, index) => ({ stage: "plan_code_ui", message: `界面规划诊断 ${index + 1}`, at: "2026-09-21T00:00:00.000Z" })),
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/projects/${projectId}`);
      await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);
      await page.getByRole("navigation", { name: "项目导航" }).getByRole("button", { name: "代码", exact: true }).click();
      const workspace = page.getByTestId("code-workspace-frame");
      await expect(workspace).toBeVisible();
      await page.setViewportSize({ width, height: 1000 });
      const navigation = page.getByTestId("code-preview-navigation");
      const previewTab = navigation.getByRole("tab", { name: "预览", exact: true });
      const codeTab = navigation.getByRole("tab", { name: "代码", exact: true });
      const iframe = page.locator('iframe[title="Prototype Preview"]');
      const preview = page.frameLocator('iframe[title="Prototype Preview"]');
      if (width < 768) {
        await expect(codeTab).toHaveCount(0);
        await expect(previewTab).toHaveCount(0);
      } else await expect(previewTab).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("code-editor-region")).toHaveCount(0);
      await expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-forms");
      await expect(workspace.getByRole("progressbar", { name: "预览正在编译" })).toBeVisible();
      await page.screenshot({ path: info.outputPath("loading.png"), fullPage: true });
      await expect(preview.getByRole("heading", { name: "Layout preview" })).toBeVisible();
      await expect(workspace.getByRole("progressbar")).toHaveCount(0);
      const navigationColors = await navigation.evaluate(node => {
        const probe = document.createElement("span");
        probe.style.color = "var(--foreground)";
        document.body.append(probe);
        const expected = getComputedStyle(probe).color;
        const actual = [...node.querySelectorAll("input, button[aria-label] svg")].map(control => getComputedStyle(control).color);
        probe.remove();
        return { expected, actual };
      });
      expect(navigationColors.actual.length).toBeGreaterThan(1);
      expect(new Set(navigationColors.actual)).toEqual(new Set([navigationColors.expected]));
      await preview.getByRole("button", { name: "Clicks: 0" }).click();
      await expect(workspace.getByRole("button", { name: "Console", exact: true })).toHaveAttribute("aria-expanded", "false");
      await workspace.getByRole("button", { name: "Console", exact: true }).click();
      await expect(workspace.getByText("Build ready", { exact: false })).toBeVisible();
      await expect(workspace.getByText("Fixture warning", { exact: false })).toBeVisible();
      const content = page.getByTestId("code-workspace-content");
      expect((await content.boundingBox())!.height).toBe(width < 1024 ? 560 : 680);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath("preview.png"), fullPage: true });

      // Arrow-key focus and Enter activation must preserve the iframe's live counter.
      if (width < 768) {
        const mobileDocument = await iframe.getAttribute("srcdoc");
        await page.setViewportSize({ width: 1440, height: 1000 });
        await expect(previewTab).toHaveAttribute("aria-selected", "true");
        expect(await iframe.getAttribute("srcdoc")).toBe(mobileDocument);
      }
      await previewTab.focus();
      await page.keyboard.press("ArrowLeft");
      await expect(codeTab).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(codeTab).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("code-file-tabs")).toHaveCount(0);
      await expect(page.getByTestId("code-preview-region")).toBeHidden();
      await expect(page.getByTestId("file-tree-dir-/src")).toBeVisible();
      await expect(page.locator(".monaco-editor textarea")).toBeVisible({ timeout: 30_000 });
      const mainFile = page.getByRole("treeitem", { name: "main.tsx", exact: true });
      await mainFile.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".monaco-editor")).toContainText("console.warn");
      const input = page.locator(".monaco-editor textarea");
      await input.focus();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.insertText(previewSource.replace("Layout preview", "Edited preview"));
      await expect(workspace.getByRole("status")).toContainText("当前编辑内容尚未构建到预览");
      const previousDocument = await iframe.getAttribute("srcdoc");
      await page.screenshot({ path: info.outputPath("code.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 1000 });
      await expect(codeTab).toHaveCount(0);
      await expect(page.getByTestId("code-editor-region")).toBeHidden();
      await expect(preview.getByRole("button", { name: "Clicks: 1" })).toBeVisible();
      expect(await iframe.getAttribute("srcdoc")).toBe(previousDocument);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect(codeTab).toHaveAttribute("aria-selected", "true");
      await expect(mainFile).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(".monaco-editor")).toContainText("Edited preview");
      await previewTab.click();
      await expect(preview.getByRole("button", { name: "Clicks: 1" })).toBeVisible();
      expect(await iframe.getAttribute("srcdoc")).toBe(previousDocument);
      await codeTab.click();
      await expect(mainFile).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(".monaco-editor")).toContainText("Edited preview");
      await navigation.getByRole("button", { name: "运行预览" }).click();
      await expect(previewTab).toHaveAttribute("aria-selected", "true");
      await expect(preview.getByRole("heading", { name: "Edited preview" })).toBeVisible();
      await expect(preview.getByRole("button", { name: "Clicks: 0" })).toBeVisible();
      await expect(workspace.getByText("clicked 1", { exact: false })).toHaveCount(0);
      await preview.getByRole("button", { name: "Clicks: 0" }).click();
      await navigation.getByRole("button", { name: "运行预览" }).click();
      await expect(preview.getByRole("button", { name: "Clicks: 0" })).toBeVisible();
      await expect(workspace.getByText("clicked 1", { exact: false })).toHaveCount(0);

      await page.setViewportSize({ width, height: 1000 });
      const popupPromise = context.waitForEvent("page");
      await navigation.getByRole("button", { name: "在新窗口打开" }).click();
      const popup = await popupPromise;
      await expect(popup.getByRole("heading", { name: "Edited preview" })).toBeVisible();
      await expect(page.getByText("新窗口被浏览器拦截，请允许弹窗后重试")).toHaveCount(0);
      await popup.close();
      await navigation.getByRole("button", { name: "全屏预览" }).click();
      await expect(workspace).toHaveAttribute("data-fullscreen", "true");
      expect(await workspace.evaluate(node => document.fullscreenElement === node)).toBe(true);
      await navigation.getByRole("button", { name: "退出全屏" }).click();
      await expect(workspace).toHaveAttribute("data-fullscreen", "false");
      expect(await iframe.getAttribute("srcdoc")).not.toBe(previousDocument);
      await workspace.evaluate(node => Object.defineProperty(node, "requestFullscreen", { configurable: true, value: undefined }));
      await navigation.getByRole("button", { name: "全屏预览" }).click();
      await expect(workspace).toHaveAttribute("data-fullscreen", "true");
      await page.keyboard.press("Escape");
      await expect(workspace).toHaveAttribute("data-fullscreen", "false");
      await expect(navigation.getByRole("button", { name: "全屏预览" })).toBeFocused();

      await page.getByRole("button", { name: "诊断（18）" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("listitem")).toHaveCount(18);
      await dialog.getByText(/界面规划诊断 18$/).scrollIntoViewIfNeeded();
      await expect(dialog.getByText(/界面规划诊断 18$/)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }
}
