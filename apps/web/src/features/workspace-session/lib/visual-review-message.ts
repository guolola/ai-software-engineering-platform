// Selects concrete visual review findings before the generic review reason.
import { isExcludedDiagramReviewIssue } from "@uml-platform/contracts";
export function visualReviewDetail(review: {
  issues?: readonly string[];
  reason?: string;
} | null | undefined): string | null {
  if (!review) return null;
  const issues = review.issues?.flatMap((issue) => issue.split(/[；;\n]+/)).map((issue) => issue.trim()).filter((issue) => issue && !isExcludedDiagramReviewIssue(issue)) ?? [];
  const reason = review.reason?.trim();
  return issues.length > 0 ? [...new Set(issues)].join("；") : reason && !isExcludedDiagramReviewIssue(reason) ? reason : null;
}

export function isConfirmedVisualReview(
  review: { checkedAt?: string; status?: string; inputFingerprint?: string } | null | undefined,
  current: { checkedAt?: string; confirmedAt?: string; inputFingerprint?: string } | null | undefined,
) {
  return review?.status === "pending_review" && Boolean(review.checkedAt && current?.confirmedAt && current.checkedAt === review.checkedAt && current.inputFingerprint === review.inputFingerprint);
}
