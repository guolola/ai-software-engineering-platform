// Verifies bounded tool inputs and secret-free local association records.
import assert from "node:assert/strict";
import test from "node:test";
import {
  mcpAssociationSchema,
  mcpArtifactInputSchema,
  mcpTokenCreateSchema,
  mcpContextInputSchema,
} from "./index.js";
test("whole-project defaults and account-wide or explicitly scoped personal tokens", () => {
  assert.deepEqual(mcpContextInputSchema.parse({ projectId: "p" }).scope, {
    requirementIds: [],
    artifactIds: [],
  });
  assert.equal(
    mcpTokenCreateSchema.safeParse({ name: "token", projectIds: [] }).success,
    false,
  );
  assert.deepEqual(mcpTokenCreateSchema.parse({ name: "account-token" }), {
    name: "account-token",
    expiresInDays: 30,
  });
  assert.equal(
    mcpTokenCreateSchema.parse({ name: "token", projectIds: ["p"] })
      .expiresInDays,
    30,
  );
  assert.equal(
    mcpArtifactInputSchema.safeParse({ projectId: "p", artifactId: "a" })
      .success,
    false,
  );
});
test("association rejects credentials and private extra fields", () => {
  const association = {
    version: 1,
    serverUrl: "https://example.com/api/mcp",
    projectId: "p",
    scope: {},
    appliedManifest: [],
  };
  assert.ok(mcpAssociationSchema.safeParse(association).success);
  assert.equal(
    mcpAssociationSchema.safeParse({ ...association, token: "private" })
      .success,
    false,
  );
  for (const url of [
    "https://secret@example.com/api/mcp",
    "https://example.com/api/mcp?token=secret",
  ])
    assert.equal(
      mcpAssociationSchema.safeParse({ ...association, serverUrl: url })
        .success,
      false,
    );
});
