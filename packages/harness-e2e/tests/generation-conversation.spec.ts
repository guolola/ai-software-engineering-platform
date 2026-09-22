// Validates the task conversation against the real project shell with deterministic run events.
import { expect, test } from "@playwright/test";
import { mockProjectApi, projectId } from "./fixtures/project-workspace";
import { createEmptySnapshot } from "../../../apps/api/src/runs/records/snapshots";

for (const width of [1440, 390]) for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${width} ${colorScheme}`, () => {
    test.use({ viewport: { width, height: 900 }, colorScheme });
    test("live demo thinking expands and output grows by received fragments", async ({ page }, info) => {
      await mockProjectApi(page);
      const runId = "run-demo-stream";
      const createdAt = new Date().toISOString();
      const run = { runId, projectId, runKind: "requirements", status: "running", stage: "generate_models", createdAt };
      const base = { type: "run_activity", runId, createdAt, stage: "generate_models", callId: "usecase", subtaskLabel: "整理用例图", format: "text" };
      const events = [{ ...base, eventId: "start", phase: "started", text: "" }, { ...base, eventId: "think", phase: "thinking", text: "" }];
      await page.addInitScript(({ runId }) => {
        const original = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          if (!url.endsWith(`/api/runs/${runId}/events`)) return original(input, init);
          return new Response(new ReadableStream({ start(controller) {
            (window as unknown as { emitDemoEvent: (event: unknown) => void }).emitDemoEvent = (event) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
          } }), { headers: { "Content-Type": "text/event-stream" } });
        };
      }, { runId });
      await page.route(`**/api/projects/${projectId}/runs`, (route) => route.fulfill({ json: { projectId, runs: [run] } }));
      await page.route(`**/api/projects/${projectId}/runs/${runId}*`, (route) => route.fulfill({ json: { projectId, run, events } }));
      await page.goto(`/projects/${projectId}`);
      await page.getByRole("button", { name: "生成任务", exact: true }).click();
      const transcript = page.getByTestId("generation-transcript");
      await expect(transcript.getByText(/正在分析/)).toBeVisible();
      await page.waitForFunction(() => typeof (window as unknown as { emitDemoEvent?: unknown }).emitDemoEvent === "function");
      const emit = async (phase: string, text: string) => {
        const event = { ...base, eventId: `fragment-${events.length}`, phase, text };
        events.push(event);
        await page.evaluate((event) => (window as unknown as { emitDemoEvent: (event: unknown) => void }).emitDemoEvent(event), event);
      };
      await emit("summary", "演示思考摘要：正在核对参与者。");
      await expect(transcript.getByText("演示思考摘要：正在核对参与者。", { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath("demo-thinking.png") });
      await emit("summary", "然后整理预约关系。");
      await expect(transcript.getByText("演示思考摘要：正在核对参与者。然后整理预约关系。", { exact: true })).toBeVisible();
      await emit("output", "已读取学生");
      await expect(transcript.getByText("已读取学生", { exact: true })).toBeVisible();
      await expect(transcript.getByText(/正在执行/)).toBeVisible();
      const summary = transcript.getByText("思考摘要", { exact: true });
      await expect(summary.locator("..")).not.toHaveAttribute("open");
      await emit("output", "与管理员的用例。");
      await expect(transcript.getByText("已读取学生与管理员的用例。", { exact: true })).toBeVisible();
      await summary.click();
      await expect(transcript.getByText("演示思考摘要：正在核对参与者。然后整理预约关系。", { exact: true })).toBeVisible();
      await emit("completed", "");
      await expect(transcript.locator('[data-slot="generation-call"] [data-slot="spinner"]')).toHaveCount(0);
      await page.reload();
      if (!(await transcript.isVisible())) await page.getByRole("button", { name: "生成任务", exact: true }).click();
      await expect(transcript.getByText("已读取学生与管理员的用例。", { exact: true })).toHaveCount(1);
    });

    test("running titles sweep left to right and respect reduced motion", async ({ page }, info) => {
      await mockProjectApi(page);
      const runId = "run-loading-animation";
      const createdAt = new Date().toISOString();
      const run = { runId, projectId, runKind: "requirements", status: "running", stage: "generate_models", createdAt };
      const title = "分析参与者与用例并核对预约规则以及用户操作范围";
      const event = { type: "run_activity", runId, createdAt, stage: "generate_models", callId: "usecase", subtaskLabel: title, format: "text" };
      const events = [
        { ...event, eventId: "started", phase: "started" },
        { ...event, eventId: "thinking", phase: "thinking" },
        { ...event, eventId: "output", phase: "output", text: "正在核对参与者与预约规则。" },
        { ...event, eventId: "other", callId: "activity", subtaskLabel: "生成预约活动图", phase: "completed" },
      ];
      await page.route(`**/api/projects/${projectId}/runs`, (route) => route.fulfill({ json: { projectId, runs: [run] } }));
      await page.route(`**/api/projects/${projectId}/runs/${runId}*`, (route) => route.fulfill({ json: { projectId, run, events } }));
      await page.route(`**/api/runs/${runId}/events`, (route) => route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify(events[2])}\n\n` }));
      await page.goto(`/projects/${projectId}`);
      await page.getByRole("button", { name: "生成任务", exact: true }).click();
      const transcript = page.getByTestId("generation-transcript");
      const heading = transcript.getByText(title, { exact: true });
      await expect(heading).toBeVisible();
      const row = heading.locator("..");
      const spinner = row.locator('[data-slot="spinner"]');
      await expect(spinner).toBeVisible();
      await expect(heading).toHaveCSS("animation-name", "ui-text-shimmer");
      await expect(heading).toHaveCSS("animation-duration", "2s");
      await expect(transcript.getByText("生成预约活动图", { exact: true })).toHaveCSS("animation-name", "none");
      await expect(transcript.getByText(/正在执行/)).toHaveCSS("animation-name", "none");
      await expect(transcript.getByText("正在核对参与者与预约规则。", { exact: true })).toHaveCSS("animation-name", "none");
      // With a background twice the text width, decreasing its percentage moves the bright band right.
      const sweep = await heading.evaluate((element) => {
        const animation = element.getAnimations()[0];
        animation.pause();
        animation.currentTime = 500;
        const early = parseFloat(getComputedStyle(element).backgroundPositionX);
        animation.currentTime = 1500;
        const late = parseFloat(getComputedStyle(element).backgroundPositionX);
        animation.play();
        return { early, late, size: getComputedStyle(element).backgroundSize };
      });
      expect(sweep.early).toBeGreaterThan(sweep.late);
      expect(sweep.size).toBe("200% 100%");
      expect(await transcript.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      if (width === 390) expect(await heading.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(25);
      await row.click();
      await expect(row).toHaveAttribute("aria-expanded", "true");
      await page.screenshot({ path: info.outputPath("loading-animation.png") });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(heading).toHaveCSS("animation-name", "none");
      await expect(spinner).toHaveCSS("animation-name", "none");
      expect(await heading.evaluate((element) => getComputedStyle(element).color)).not.toBe("rgba(0, 0, 0, 0)");
      await expect(transcript.getByText(/正在执行/)).toBeVisible();
    });

    test("task transcript has no cards, restores replies and fits the drawer", async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await mockProjectApi(page);
      const runId = "run-conversation-preview";
      const createdAt = "2026-09-21T08:00:00.000Z";
      const run = { runId, projectId, runKind: "requirements", status: "completed", stage: "render_svg", createdAt };
      const snapshot = createEmptySnapshot(runId, "用户可查询并预约座位", ["usecase", "activity"]);
      snapshot.status = "completed";
      snapshot.svgArtifacts = ["usecase", "activity"].map((diagramKind) => ({ diagramKind, svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', renderMeta: { engine: "plantuml", generatedAt: createdAt, sourceLength: 0, durationMs: 20 } })) as typeof snapshot.svgArtifacts;
      let sequence = 0;
      const activity = (callId: string, phase: string, text?: string) => ({
        type: "run_activity", eventId: `event-${++sequence}`, runId, createdAt, stage: "generate_models", callId, subtaskId: callId,
        subtaskLabel: callId === "usecase" ? "分析参与者与用例" : "生成预约活动图", phase, text, format: "technical",
      });
      const events = [
        { type: "stage_started", stage: "generate_models", eventId: "start", createdAt },
        { type: "stage_progress", stage: "generate_models", progress: 60, message: "已读取当前需求，开始并行生成用例图与活动图。", eventId: "read", createdAt },
        activity("usecase", "started"), activity("activity", "started"),
        activity("usecase", "summary", "根据已确认需求，核对参与者及其操作范围。"),
        activity("usecase", "output", '{"summary":"已识别学生与管理员，整理了查询座位、预约和签到等操作。"}'), activity("usecase", "completed"),
        activity("activity", "output", '{"summary":"活动图包含查询、校验座位状态与提交预约三个环节。"}'), activity("activity", "completed"),
        { type: "stage_progress", stage: "render_svg", progress: 100, message: "模型检查已完成，两个图形预览已准备好。", eventId: "render", createdAt },
        { type: "completed", snapshot, eventId: "complete", createdAt },
      ];
      await page.route(`**/api/projects/${projectId}/runs`, (route) => route.fulfill({ json: { projectId, runs: [run] } }));
      await page.route(`**/api/projects/${projectId}/runs/${runId}*`, (route) => route.fulfill({ json: { projectId, run, events, snapshot } }));
      await page.goto(`/projects/${projectId}`);
      await page.getByRole("button", { name: "生成任务", exact: true }).click();
      const transcript = page.getByTestId("generation-transcript");
      await expect(transcript.getByText("已识别学生与管理员，整理了查询座位、预约和签到等操作。")).toBeVisible();
      await expect(transcript.getByText("已生成 2 个图形预览。")).toBeVisible();
      await expect(transcript.getByText("Agent", { exact: true })).toHaveCount(1);
      await expect(transcript.locator('[data-slot="card"], [data-slot="badge"]')).toHaveCount(0);
      expect(await transcript.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath("conversation.png") });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "生成任务", exact: true }).click();
      await expect(transcript.getByText("已识别学生与管理员，整理了查询座位、预约和签到等操作。")).toHaveCount(1);
      await page.reload();
      if (!(await transcript.isVisible())) await page.getByRole("button", { name: "生成任务", exact: true }).click();
      await expect(transcript.getByText("已生成 2 个图形预览。")).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
