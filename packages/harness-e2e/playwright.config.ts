// Runs browser acceptance checks against production web bundles with mocked API contracts.
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  testDir: "./tests",
  // Keep local browser resource use predictable across the viewport/theme matrix.
  workers: 3,
  outputDir: "./test-results",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4175",
    locale: "zh-CN",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      "npm run build:web:production && node packages/harness-e2e/src/preview-server.mjs",
    cwd: repoRoot,
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
