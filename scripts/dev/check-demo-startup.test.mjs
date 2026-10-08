// Exercises occupied ports and public MCP responses so demo startup cannot silently accept a stale API.
import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { checkDemoPorts, checkDemoReadiness, waitForDemo } from "./check-demo-startup.mjs";

async function listen(server, host) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

for (const host of ["127.0.0.1", "::1", "0.0.0.0", "::"]) {
  test(`rejects an occupied ${host} port without stopping its owner, then permits restart`, async (t) => {
    const server = createServer((socket) => socket.end());
    let port;
    try {
      port = await listen(server, host);
    } catch (error) {
      if (host.includes(":") && ["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)) return t.skip("IPv6 unavailable");
      throw error;
    }
    t.after(() => server.listening && close(server));
    await assert.rejects(checkDemoPorts([{ name: "旧 API", port }]), /端口被占用：旧 API.*Ctrl\+C/);
    assert.equal(server.listening, true);
    await close(server);
    await checkDemoPorts([{ name: "API", port }]);
  });
}

function readyResponse(url) {
  const { pathname } = new URL(url);
  if (pathname === "/account/connections") return new Response("<!doctype html><html></html>", { headers: { "content-type": "text/html" } });
  if (pathname === "/api/mcp/connections") return Response.json({ error: "login_required" }, { status: 401 });
  if (pathname.includes("oauth-protected-resource")) return Response.json({
    resource: "http://localhost:3000/api/mcp",
    authorization_servers: ["http://localhost:3000/api/mcp/oauth"],
  });
  if (pathname.includes("oauth-authorization-server")) return Response.json({ issuer: "http://localhost:3000/api/mcp/oauth" });
  return Response.json({ status: "ok" });
}

test("accepts a complete public demo with enabled, login-protected MCP management", async () => {
  assert.deepEqual(await checkDemoReadiness(async (url) => readyResponse(url)), []);
});

test("waits for API startup before sending traffic through the Web proxy", async () => {
  const requested = [];
  const failures = await checkDemoReadiness(async (url) => {
    requested.push(url);
    throw new Error("connection refused");
  });
  assert.deepEqual(failures, ["API：尚未就绪"]);
  assert.deepEqual(requested, ["http://127.0.0.1:4101/health"]);
});

test("does not consider an old API with MCP disabled ready", async () => {
  const failures = await checkDemoReadiness(async (url) => url.endsWith("/api/mcp/connections")
    ? Response.json({ enabled: false }) : readyResponse(url));
  assert.deepEqual(failures, ["MCP 连接管理：HTTP 200"]);
});

test("rejects a discovery route that falls back to HTML", async () => {
  const failures = await checkDemoReadiness(async (url) => url.includes("oauth-protected-resource")
    ? new Response("<!doctype html>") : readyResponse(url));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /MCP 发现/);
});

test("rejects an OAuth issuer from another port", async () => {
  const failures = await checkDemoReadiness(async (url) => url.includes("oauth-authorization-server")
    ? Response.json({ issuer: "http://localhost:4001/api/mcp/oauth" }) : readyResponse(url));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /OAuth 发现.*公共地址/);
});

test("reports ready only after all startup checks pass", async () => {
  let time = 0;
  const logs = [];
  await waitForDemo({
    probe: async () => time < 2_000 ? ["API 尚未就绪"] : [],
    now: () => time,
    pause: async (ms) => { time += ms; },
    log: (line) => logs.push(line),
  });
  assert.equal(time, 2_000);
  assert.match(logs.at(-1), /启动成功/);
  assert.match(logs.at(-1), /http:\/\/localhost:3000\/api\/mcp/);
});

test("fails with the unresolved service when startup times out", async () => {
  let time = 0;
  const logs = [];
  await assert.rejects(waitForDemo({
    probe: async () => ["MCP 发现：HTTP 404"],
    timeoutMs: 2_000,
    now: () => time,
    pause: async (ms) => { time += ms; },
    log: (line) => logs.push(line),
  }), /启动检查超时：MCP 发现：HTTP 404/);
  assert.equal(logs.some((line) => line.includes("启动成功")), false);
});
