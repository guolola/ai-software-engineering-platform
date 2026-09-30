// Projects current and historical review records into shared, deduplicated problem groups.
import { classifyDiagramReviewIssue, isExcludedDiagramReviewIssue, isUnverifiableReviewText, type DiagramReviewCategory, type DiagramReviewFinding, type DiagramVisualReview } from "@uml-platform/contracts";

export const reviewCategoryLabels: Record<DiagramReviewCategory, string> = {
  model_structure: "模型结构", business_constraint: "业务约束", render_mismatch: "图形与模型不一致",
  check_execution: "检查未完成或异常", other: "其他待分类",
};
export interface ReviewProblem {
  id: string; category: DiagramReviewCategory; observation: string; verification: DiagramReviewFinding["verification"];
  finding?: DiagramReviewFinding; inferred: boolean;
}
const key = (text: string) => text.replace(/[\s。；;]+/g, "");
export function reviewProblemGroups(review: DiagramVisualReview) {
  const items = new Map<string, ReviewProblem>();
  for (const finding of review.findings ?? []) {
    if (isExcludedDiagramReviewIssue(finding.observation)) continue;
    const inferred = classifyDiagramReviewIssue(finding.observation, finding.layer, finding.code);
    const category = inferred === "other" ? finding.category ?? inferred : inferred;
    const value: ReviewProblem = { id: finding.id, category, observation: finding.observation, verification: isUnverifiableReviewText(finding.observation) ? "inconclusive" : finding.verification, finding, inferred: !finding.category && inferred === "other" };
    // Prefer the service-verified record when the provider repeated the same observation.
    const old = items.get(key(value.observation));
    if (!old || (old.verification !== "verified" && value.verification === "verified")) items.set(key(value.observation), value);
  }
  for (const issue of review.issues.flatMap((item) => item.split(/[；;\n]+/)).map((item) => item.trim()).filter(Boolean)) {
    if (isExcludedDiagramReviewIssue(issue) || items.has(key(issue))) continue;
    items.set(key(issue), { id: `legacy:${key(issue)}`, category: classifyDiagramReviewIssue(issue), observation: issue, verification: isUnverifiableReviewText(issue) ? "inconclusive" : "unverified", inferred: true });
  }
  // Outcome is an execution state, not an invented business defect.
  const onlyExcludedHistory = !items.size && (review.issues.length > 0 || (review.findings?.length ?? 0) > 0);
  if (["not_completed", "inconclusive"].includes(review.checkOutcome ?? "") && !(review.checkOutcome === "inconclusive" && onlyExcludedHistory) && ![...items.values()].some((item) => item.category === "check_execution")) {
    const observation = review.checkOutcome === "inconclusive" ? "部分结构无法核实" : "检查未完成";
    items.set("execution", { id: "execution", category: "check_execution", observation, verification: "inconclusive", inferred: false });
  }
  return (Object.keys(reviewCategoryLabels) as DiagramReviewCategory[]).map((category) => ({ category, label: reviewCategoryLabels[category], items: [...items.values()].filter((item) => item.category === category) })).filter((group) => group.items.length);
}

export function reviewProblemTreatment(problem: ReviewProblem, review: DiagramVisualReview): string {
  const repair = [...(review.repairHistory ?? [])].reverse().find((item) => item.issueIds.includes(problem.finding?.id ?? problem.id));
  if (repair) return `第 ${repair.round} 轮${repair.target === "model" ? "结构纠错" : "图形重建"}：${repair.status === "accepted" ? "已接受" : repair.status === "rejected" ? "已拒绝" : "未完成"} · ${repair.reason}`;
  if (problem.verification !== "verified") return "未修复：缺少已核实的唯一修复依据";
  return problem.finding?.repairable ? `未尝试：${review.stopReason ?? "尚未启动修复"}` : "未修复：当前问题没有自动修复规则";
}
