// Defines the persisted result of checking a rendered UML diagram against its model.
import { z } from "zod";

export const diagramVisualReviewSchema = z.object({
  status: z.enum(["passed", "skipped", "pending_review"]),
  issues: z.array(z.string()),
  reason: z.string(),
  attempts: z.number().int().min(0),
  checkedAt: z.string(),
});
export type DiagramVisualReview = z.infer<typeof diagramVisualReviewSchema>;
