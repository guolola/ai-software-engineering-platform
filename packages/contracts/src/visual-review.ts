// Defines the persisted result of checking a rendered UML diagram against its model.
import { z } from "zod";

export const diagramReviewFindingSchema = z.object({
  id: z.string().min(1),
  layer: z.enum(["model", "render", "image"]),
  code: z.string().min(1),
  modelId: z.string().min(1),
  elementId: z.string().optional(),
  relationshipId: z.string().optional(),
  path: z.string().optional(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  evidence: z.array(z.object({ source: z.string(), reference: z.string(), detail: z.string() })).default([]),
  observation: z.string().min(1),
  verification: z.enum(["verified", "unverified", "inconclusive"]),
  repairable: z.boolean().default(false),
});
export type DiagramReviewFinding = z.infer<typeof diagramReviewFindingSchema>;

export const diagramRepairRecordSchema = z.object({
  round: z.number().int().min(1).max(2),
  target: z.enum(["model", "render"]),
  issueIds: z.array(z.string()),
  callId: z.string().optional(),
  beforeFingerprint: z.string(),
  afterFingerprint: z.string().optional(),
  status: z.enum(["accepted", "rejected", "failed"]),
  changes: z.array(z.string()),
  reason: z.string(),
});

export const diagramVisualReviewSchema = z.object({
  status: z.enum(["passed", "skipped", "pending_review"]),
  issues: z.array(z.string()),
  reason: z.string(),
  attempts: z.number().int().min(0),
  repairAttempts: z.number().int().min(0).optional(),
  checkedAt: z.string(),
  // Human acceptance is distinct from the automated visual verdict.
  confirmedAt: z.string().optional(),
  findings: z.array(diagramReviewFindingSchema).optional(),
  repairHistory: z.array(diagramRepairRecordSchema).optional(),
  checkOutcome: z.enum(["verified", "differences", "inconclusive", "not_completed", "skipped"]).optional(),
  structureAttempts: z.number().int().min(0).optional(),
  inputFingerprint: z.string().optional(),
  stopReason: z.string().optional(),
});
export type DiagramVisualReview = z.infer<typeof diagramVisualReviewSchema>;
