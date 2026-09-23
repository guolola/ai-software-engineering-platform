// Verifies generation result dialog copy for document completion edge cases.
import { describe, expect, it } from "vitest";
import {
  documentRunCompletionDialog,
  failedRunResultDialog,
} from "./generation-dialog-actions";
import { operationFailureForCode } from "./operation-failure";

describe("documentRunCompletionDialog", () => {
  it("surfaces missing diagram warnings for completed documents", () => {
    const dialog = documentRunCompletionDialog({
      documentTitle: "需求规格说明书",
      runId: "doc-warning",
      missingArtifactCount: 2,
    });

    expect(dialog.title).toBe("说明书已生成但缺图");
    expect(dialog.message).toBe(
      "需求规格说明书已生成，但有 2 项图源缺失，请复核后交付。",
    );
    expect(dialog.runId).toBe("doc-warning");
    expect(dialog.stageLabel).toBe("说明书");
  });

  it("routes pending review failures to rules without inventing task details", () => {
    const dialog = failedRunResultDialog({
      failure: operationFailureForCode("REQUIREMENT_REVIEWS_PENDING", {
        params: { count: 2 },
        details: { ruleIds: ["r1", "r2"] },
      }),
      runId: null,
      stageLabel: "需求模型",
    });

    expect(dialog.title).toBe("生成前需要确认需求规则");
    expect(dialog.message).toContain("2 条需求规则修复结果仍待确认");
    expect(dialog.primaryAction?.label).toBe("查看待确认规则");
    expect(dialog.primaryAction?.label).not.toBe("查看任务详情");
  });

  it("does not show task details for an unknown failure before a task exists", () => {
    const dialog = failedRunResultDialog({
      failure: operationFailureForCode("RUN_INTERNAL_ERROR"),
      runId: null,
      stageLabel: "启动校验",
    });

    expect(dialog.primaryAction).toBeUndefined();
  });

  it("shows the API request ID for a provider circuit rejection", () => {
    const dialog = failedRunResultDialog({
      failure: {
        ...operationFailureForCode("PROVIDER_CIRCUIT_OPEN"),
        requestId: "req-provider-9",
      },
      runId: null,
      stageLabel: "需求规则",
    });

    expect(dialog.message).toContain("req-provider-9");
    expect(dialog.primaryAction?.label).toBe("查看连接配置");
  });
});
