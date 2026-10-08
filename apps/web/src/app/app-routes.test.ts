import { describe, expect, it } from "vitest";

import { matchAppRoute } from "./app-routes";

describe("matchAppRoute dashboard", () => {
  it("matches documentation as an independent public route", () => {
    expect(matchAppRoute("/tutorial")).toEqual({ kind: "product-docs", path: "/tutorial" });
  });
  it("matches the connection center before interpreting a project ID", () => {
    expect(matchAppRoute("/projects/connections")).toEqual({ kind: "mcp-connections", path: "/projects/connections" });
    expect(matchAppRoute("/account/connections")).toEqual({ kind: "mcp-connections", path: "/account/connections" });
  });
  it("matches the platform dashboard route", () => {
    expect(matchAppRoute("/dashboard")).toEqual({ kind: "dashboard", path: "/dashboard" });
  });

  it("does not capture project paths", () => {
    expect(matchAppRoute("/projects").kind).toBe("projects-index");
  });
});
