// Verifies structured operation failures produce safe, actionable localized feedback.
import { describe, expect, it } from "vitest";
import {
  operationFailureForCode,
  operationFailurePresentation,
} from "./operation-failure";
import { ApiClientError } from "../../../services/api-client";

describe("operationFailurePresentation", () => {
  it("keeps safe localized technical terms such as PlantUML", () => {
    const failure = operationFailureForCode("REQUIREMENT_PLANTUML_MISSING", {
      params: { count: 2 },
    });

    expect(failure.message).toContain("PlantUML");
    expect(failure.message).toContain("2");
    expect(failure.actionTarget).toBe("requirement-models");
  });

  it("hides unknown English technical exception text", () => {
    const failure = operationFailurePresentation(
      new Error("ECONNRESET while rendering PlantUML with secret-token"),
    );

    expect(failure.code).toBe("RUN_INTERNAL_ERROR");
    expect(failure.title).toBe("任务遇到内部错误");
    expect(failure.message).not.toMatch(/ECONNRESET|secret-token/u);
  });

  it("shows only safe breaker diagnostics when provider testing is paused", () => {
    const failure = operationFailurePresentation(
      new ApiClientError("fallback", 503, {
        error: {
          code: "PROVIDER_CIRCUIT_OPEN",
          category: "provider",
          retryable: false,
          params: { failureCount: 3 },
          details: {
            breaker: {
              state: "open",
              failureCount: 3,
              lastFailureAt: "2026-09-22T01:02:03.000Z",
            },
          },
        },
      }),
    );

    expect(failure.title).toBe("连接测试已暂停");
    expect(failure.message).toContain("3");
    expect(failure.message).not.toContain("{{lastFailureAt}}");
    expect(failure.actionTarget).toBe("provider-settings");
  });

  it("uses a safe breaker fallback when diagnostics are unavailable", () => {
    const failure = operationFailureForCode("PROVIDER_CIRCUIT_OPEN");

    expect(failure.message).toContain("暂停");
    expect(failure.message).not.toContain("{{failureCount}}");
  });
});
