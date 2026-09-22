// Covers the narrow production route migration and recovery without contacting a server.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { applyRouting, migrateMarketingRoutes, restoreRouting } from "./nginx-marketing-routes.mjs";

const current = readFileSync(new URL("./nginx-jianglisoftware.com.conf", import.meta.url), "utf8");
const legacy = current.replace(
  /location ~ \^\/\(features\|workflow\|cases\|pricing\)\/\?\$ \{\s*return 404;\s*\}/,
  'location ~ ^/(features|workflow|cases|pricing)/$ {\n        return 301 /$1;\n    }\n\n    location ~ ^/(features|workflow|cases|pricing)$ {\n        add_header Cache-Control "no-cache, no-store, must-revalidate" always;\n        try_files $uri/index.html /index.html =404;\n    }',
);

test("migrates legacy routes while preserving TLS, APIs and private-page rules", () => {
  assert.notEqual(legacy, current);
  assert.equal(migrateMarketingRoutes(legacy).replace(/\s+/g, " "), current.replace(/\s+/g, " "));
  assert.equal(migrateMarketingRoutes(current), current);
  assert.throws(() => migrateMarketingRoutes("server {}"), /unknown Nginx layout/);
  assert.throws(() => migrateMarketingRoutes(legacy + legacy), /unknown Nginx layout/);
});

for (const failValidation of [false, true]) {
  test(`backs up and restores the exact active configuration (validation failure: ${failValidation})`, () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "uml-nginx-test-"));
    try {
      const configPath = path.join(directory, "site.conf");
      const backup = path.join(directory, "backup.json");
      writeFileSync(configPath, legacy);
      let checks = 0;
      const calls = [];
      const runNginx = (...args) => {
        calls.push(args.join(" "));
        if (args[0] === "-T") return `# configuration file ${configPath}:\n${legacy}`;
        if (args[0] === "-t" && checks++ === 0 && failValidation) throw new Error("Invalid config");
        return "";
      };
      if (failValidation) {
        assert.throws(() => applyRouting(backup, "/www/wwwroot/uml-platform/current/apps/web/dist", runNginx), /Invalid config/);
      } else {
        applyRouting(backup, "/www/wwwroot/uml-platform/current/apps/web/dist", runNginx);
        assert.match(readFileSync(configPath, "utf8"), /return 404/);
        restoreRouting(backup, runNginx);
      }
      assert.equal(readFileSync(configPath, "utf8"), legacy);
      assert.ok(calls.includes("-s reload"));
      writeFileSync(configPath, "concurrent edit");
      assert.throws(() => restoreRouting(backup, runNginx), /concurrent changes/);
      assert.equal(readFileSync(configPath, "utf8"), "concurrent edit");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
