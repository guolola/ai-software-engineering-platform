// Verifies local prototype preview build helpers and user-facing error normalization.

import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { buildLocalPreviewDocument, previewErrorMessage } from "./preview-runtime";

describe("preview console bridge", () => {
  it("runs independently inside srcDoc and forwards real logs with safe value serialization", async () => {
    const { srcDoc } = await buildLocalPreviewDocument({ "/src/main.ts": "console.log('loaded');" }, "/src/main.ts", "current-build");
    const script = srcDoc.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    const postMessage = vi.fn();
    const originals = { log: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const previewConsole = { ...originals };
    runInNewContext(script!, { console: previewConsole, parent: { postMessage }, Error, Date });
    const circular: Record<string, unknown> = { count: 3n };
    circular.self = circular;
    previewConsole.warn("warning", circular);
    previewConsole.info("information");
    previewConsole.error(new Error("runtime failed"));
    expect(originals.warn).toHaveBeenCalledWith("warning", circular);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      source: "local-prototype-preview", buildId: "current-build", type: "console", level: "warn",
      message: 'warning {"count":"3","self":"[Circular]"}', timestamp: expect.any(Number),
    }), "*");
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ level: "log", message: "information" }), "*");
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ level: "error", message: expect.stringContaining("runtime failed") }), "*");
  });
});

describe("previewErrorMessage", () => {
  it("asks users to refresh when a cached dynamic module chunk is missing", () => {
    expect(
      previewErrorMessage(
        new TypeError(
          "Failed to fetch dynamically imported module: http://134.175.78.226/assets/typescript--01KeRyl.js",
        ),
      ),
    ).toBe("页面资源已更新，请刷新页面后再运行预览。");
  });

  it("keeps ordinary build errors unchanged", () => {
    expect(previewErrorMessage(new Error("/src/App.tsx 无法解析导入 ./Missing"))).toBe(
      "/src/App.tsx 无法解析导入 ./Missing",
    );
  });
});
