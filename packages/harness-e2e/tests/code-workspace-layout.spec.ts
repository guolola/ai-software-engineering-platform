// Checks stacked code/preview sizing and the relocated toolbar/diagnostic interactions.
import { expect, test } from "@playwright/test";
import { projectId, mockProjectApi } from "./fixtures/project-workspace";

for (const width of [390, 1440]) {
  test(`${width}px code workspace keeps the responsive preview and details in a dialog`, async ({ page }, info) => {
    await mockProjectApi(page, {
      codeFiles: {
        "/src/App.tsx": "export default function App() { return <main>Layout preview</main>; }",
        "/src/main.tsx": "import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './App'; createRoot(document.getElementById('root')!).render(<App/>);",
      },
      codeEntryFile: "/src/main.tsx",
      codeDiagnostics: Array.from({ length: 18 }, (_, index) => ({ stage: "plan_code_ui", message: `界面规划诊断 ${index + 1}`, at: "2026-09-21T00:00:00.000Z" })),
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);
    await page.getByRole("navigation", { name: "项目导航" }).getByRole("button", { name: "代码", exact: true }).click();
    const toolbar = page.getByTestId("code-generation-toolbar");
    await expect(toolbar).toBeVisible();
    await page.setViewportSize({ width, height: 1000 });
    const editor = page.getByTestId("code-editor-region");
    const preview = page.getByTestId("code-preview-region");
    const regions = width < 768 ? [toolbar, preview] : [toolbar, editor, preview];
    const boxes = await Promise.all(regions.map(locator => locator.boundingBox()));
    for (const box of boxes) {
      expect(box).not.toBeNull();
      expect(Math.abs(box!.width - boxes[0]!.width)).toBeLessThan(1);
      expect(Math.abs(box!.x - boxes[0]!.x)).toBeLessThan(1);
    }
    if (width < 768) {
      await expect(editor).toHaveCount(0);
      await expect(page.getByTestId("code-file-tabs")).toHaveCount(0);
    } else {
      expect(boxes[2]!.y).toBeGreaterThanOrEqual(boxes[1]!.y + boxes[1]!.height - 1);
    }
    const fullscreen = toolbar.getByRole("button", { name: "全屏预览" });
    const run = toolbar.getByRole("button", { name: "运行预览" });
    await expect(fullscreen).toHaveCount(1);
    await expect(run).toHaveCount(1);
    if (width > 1000) {
      const regenerateBox = await toolbar.getByRole("button", { name: "重新生成", exact: true }).boundingBox();
      const fullscreenBox = await fullscreen.boundingBox();
      const runBox = await run.boundingBox();
      expect(fullscreenBox!.x).toBeGreaterThan(regenerateBox!.x);
      expect(runBox!.x).toBeGreaterThan(fullscreenBox!.x);
    }
    await expect(page.getByText("代码生成存在诊断", { exact: true })).toHaveCount(0);
    await toolbar.getByRole("button", { name: "诊断（18）" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("listitem")).toHaveCount(18);
    await dialog.getByText(/界面规划诊断 18$/).scrollIntoViewIfNeeded();
    await expect(dialog.getByText(/界面规划诊断 18$/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("code-workspace.png"), fullPage: true });
  });
}
