// Selects concrete visual review findings before the generic review reason.
export function visualReviewDetail(review: {
  issues?: readonly string[];
  reason?: string;
} | null | undefined): string | null {
  if (!review) return null;
  const issues = review.issues?.map((issue) => issue.trim()).filter(Boolean) ?? [];
  return issues.length > 0 ? issues.join("；") : review.reason?.trim() || null;
}

export function isConfirmedVisualReview(
  review: { checkedAt?: string; status?: string } | null | undefined,
  current: { checkedAt?: string; confirmedAt?: string } | null | undefined,
) {
  return review?.status === "pending_review" && Boolean(review.checkedAt && current?.confirmedAt && current.checkedAt === review.checkedAt);
}
