// Covers persisted visual acceptance and invalidation when the inspected diagram changes.
import { describe, expect, it } from "vitest";
import { createMockWorkspaceRepository } from "./mock-repository";
import { isConfirmedVisualReview } from "../../features/workspace-session/lib/visual-review-message";

const review = { status: "pending_review" as const, issues: ["标签不可读"], reason: "请人工确认", attempts: 3, checkedAt: "check-1" };

describe("visual review acceptance", () => {
  it("persists acceptance without changing the automated verdict and rejects stale checks", async () => {
    const repository = createMockWorkspaceRepository({ visualReviews: { "requirements:usecase": review } });
    const saved = await repository.confirmVisualReview!("requirements:usecase", "check-1");
    expect(saved.status).toBe("pending_review");
    expect(saved.confirmedAt).toBeTruthy();
    expect((await repository.loadWorkspace()).visualReviews?.["requirements:usecase"]?.confirmedAt).toBe(saved.confirmedAt);
    await expect(repository.confirmVisualReview!("requirements:usecase", "check-2")).rejects.toThrow("视觉检查结果已更新");
    expect(isConfirmedVisualReview({ ...review, checkedAt: "check-2" }, saved)).toBe(false);
  });

  it("invalidates acceptance when a manual rerender replaces the current graph", async () => {
    const repository = createMockWorkspaceRepository({ visualReviews: { "requirements:usecase": review } });
    await repository.confirmVisualReview!("requirements:usecase", "check-1");
    await repository.saveManualModelRerender!("usecase", { status: "rerendered", warning: null, editedAt: "now" }, {
      plantUmlSource: "@startuml\n@enduml",
      svgArtifact: { diagramKind: "usecase", svg: "<svg />", renderMeta: { engine: "test", generatedAt: "later", sourceLength: 18, durationMs: 1 } },
    });
    expect((await repository.loadWorkspace()).visualReviews?.["requirements:usecase"]).toBeUndefined();
  });
});
