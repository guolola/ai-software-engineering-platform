// Keeps the OAuth callback entry reachable through application routing.
import { expect, it } from "vitest";
import { matchAppRoute } from "./app-routes";
it("routes external connections without treating them as legacy account redirects", () => {
  expect(matchAppRoute("/account/connections")).toEqual({
    kind: "mcp-connections",
    path: "/account/connections",
  });
});
