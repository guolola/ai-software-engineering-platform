// Exercises the shared semantic validation boundary before manual models reach the renderer.
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { modelFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import { registerRenderRoutes } from "./register-render-routes.js";

test("manual render reports model, field and element diagnostics before any external render call", async () => {
  const app = Fastify();
  let rendered = 0;
  registerRenderRoutes({ app, resolveUserId: async () => "user", projectMembershipGuard: async () => true,
    pngRenderClient: async () => { throw new Error("unexpected PNG"); },
    renderClient: async (artifact) => { rendered++; return { svg: "<svg><text>model</text></svg>", renderMeta: { engine: "plantuml", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 1 } }; },
  });
  try {
    const model = modelFixture("requirements", "class") as any;
    model.modelId = "class:domain";
    model.relationships[0].type = "dependency";
    const invalid = await app.inject({ method: "POST", url: "/api/render/model", headers: { "x-uml-project-id": "project" }, payload: { stage: "requirements", model } });
    assert.equal(invalid.statusCode, 400);
    assert.ok(invalid.json().diagnostics.some((issue: { modelId: string; path: string; elementId: string; code: string }) => issue.modelId === "class:domain" && issue.path === "relationships.0.type" && issue.elementId === "r" && issue.code === "contract"));
    assert.equal(rendered, 0);
    const valid = await app.inject({ method: "POST", url: "/api/render/model", headers: { "x-uml-project-id": "project" }, payload: { stage: "design", model: modelFixture("design", "navigation") } });
    assert.equal(valid.statusCode, 200);
    assert.equal(rendered, 1);
  } finally { await app.close(); }
});
