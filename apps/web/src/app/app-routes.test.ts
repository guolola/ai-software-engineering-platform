import { describe, expect, it } from "vitest";

import { matchAppRoute } from "./app-routes";

describe("matchAppRoute dashboard", () => {
  it("matches the platform dashboard route", () => {
    expect(matchAppRoute("/dashboard")).toEqual({ kind: "dashboard", path: "/dashboard" });
  });

  it("does not capture project paths", () => {
    expect(matchAppRoute("/projects").kind).toBe("projects-index");
  });
});
