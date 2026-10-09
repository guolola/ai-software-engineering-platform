// Defines source-backed implementation tasks and agent reports without trusting claimed verification results.
import { z } from "zod";
import { modelElementRefSchema } from "../models.js";
import { mcpScopeSchema, mcpSourceVersionSchema } from "./index.js";

const id = z.string().trim().min(1).max(512);
const text = z.string().trim().min(1).max(12000);
const hash = z.string().regex(/^sha256:[0-9a-fA-F]{64}$/);
const sourceVersion = mcpSourceVersionSchema.strict().refine(
  (version) => !version.artifactId.startsWith("implementation:"),
  "Implementation task artifacts cannot be used as original sources",
);

function unique<T>(values: T[], key: (value: T) => string, context: z.RefinementCtx, path: Array<string | number>) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const identity = key(value);
    if (seen.has(identity)) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, index],
      message: `Duplicate reference: ${identity}`,
    });
    seen.add(identity);
  });
}

const ids = z.array(id).max(10000).superRefine((values, context) => {
  unique(values, (value) => value, context, []);
});

// Paths are repository-relative and portable; filesystem containment and symlinks are checked locally.
export const mcpImplementationPathSchema = z.string().min(1).max(1024).refine((value) => {
  if (value !== value.trim() || /[\\:<>"|?*\u0000-\u001f\u007f]/.test(value)) return false;
  return value.split("/").every((segment) =>
    Boolean(segment) && segment !== "." && segment !== ".." &&
    !/[. ]$/.test(segment) &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9]|conin\$|conout\$)(?:\.|$)/i.test(segment),
  );
}, "Expected a portable repository-relative path without traversal or device names");

export type McpImplementationPath = z.infer<typeof mcpImplementationPathSchema>;

export const mcpImplementationDesignRefSchema = modelElementRefSchema.extend({
  artifactId: id,
  modelId: id.optional(),
  elementId: id,
  elementKind: id,
  label: text,
}).strict();
export type McpImplementationDesignRef = z.infer<typeof mcpImplementationDesignRefSchema>;

const designRefKey = (ref: McpImplementationDesignRef) =>
  JSON.stringify([ref.artifactId, ref.modelId ?? null, ref.diagramKind, ref.elementKind, ref.elementId]);
const designRefs = z.array(mcpImplementationDesignRefSchema).max(10000).superRefine((values, context) => {
  unique(values, designRefKey, context, []);
});
const sourceVersions = z.array(sourceVersion).max(10000).superRefine((values, context) => {
  unique(values, (value) => value.artifactId, context, []);
});

export const mcpImplementationTaskSchema = z.object({
  id,
  title: text,
  requirementIds: ids,
  sourceArtifactIds: ids,
  designRefs,
  acceptanceCriteria: z.array(z.object({ id, text, sourceArtifactId: id }).strict()).max(10000),
  dependsOnTaskIds: ids,
  issues: z.array(z.object({
    code: id,
    severity: z.enum(["warning", "blocking"]),
    message: text,
  }).strict()).max(1000),
  guidance: z.array(text).max(1000),
}).strict().superRefine((task, context) => {
  unique(task.acceptanceCriteria, (criterion) => criterion.id, context, ["acceptanceCriteria"]);
  const sources = new Set(task.sourceArtifactIds);
  task.designRefs.forEach((ref, index) => {
    if (!sources.has(ref.artifactId)) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["designRefs", index, "artifactId"],
      message: "Design references must belong to the task sources",
    });
  });
  task.acceptanceCriteria.forEach((criterion, index) => {
    if (!sources.has(criterion.sourceArtifactId)) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["acceptanceCriteria", index, "sourceArtifactId"],
      message: "Acceptance criteria must belong to the task sources",
    });
  });
});
export type McpImplementationTask = z.infer<typeof mcpImplementationTaskSchema>;

export const mcpImplementationSnapshotSchema = z.object({
  version: z.literal(1),
  projectId: id,
  scope: mcpScopeSchema,
  contextVersion: id,
  manifest: sourceVersions,
  tasks: z.array(mcpImplementationTaskSchema).max(10000),
}).strict().superRefine((snapshot, context) => {
  unique(snapshot.tasks, (task) => task.id, context, ["tasks"]);
  const taskIds = new Set(snapshot.tasks.map((task) => task.id));
  const sourceIds = new Set(snapshot.manifest.map((source) => source.artifactId));
  const criterionIds = new Set<string>();
  snapshot.tasks.forEach((task, taskIndex) => {
    task.sourceArtifactIds.forEach((sourceId, index) => {
      if (!sourceIds.has(sourceId)) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tasks", taskIndex, "sourceArtifactIds", index],
        message: "Task source is absent from the snapshot manifest",
      });
    });
    task.dependsOnTaskIds.forEach((taskId, index) => {
      if (!taskIds.has(taskId)) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tasks", taskIndex, "dependsOnTaskIds", index],
        message: "Task dependency is absent from the snapshot",
      });
    });
    task.acceptanceCriteria.forEach((criterion, index) => {
      if (criterionIds.has(criterion.id)) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tasks", taskIndex, "acceptanceCriteria", index, "id"],
        message: "Acceptance criterion IDs must be unique across the snapshot",
      });
      criterionIds.add(criterion.id);
    });
  });
});
export type McpImplementationSnapshot = z.infer<typeof mcpImplementationSnapshotSchema>;

const actualRef = z.object({
  path: mcpImplementationPathSchema,
  symbol: id.optional(),
  contentHash: hash,
}).strict();
const testRef = z.object({
  path: mcpImplementationPathSchema,
  testName: text.optional(),
  criterionIds: ids,
  contentHash: hash,
}).strict();

const reportEntry = z.object({
  taskId: id,
  requirementIds: ids,
  designRefs,
  sourceVersions,
  status: z.enum(["planned", "implemented"]),
  plannedTargets: z.array(z.object({
    path: mcpImplementationPathSchema,
    responsibility: text,
  }).strict()).max(10000),
  actualRefs: z.array(actualRef).max(10000),
  inputRefs: z.array(z.object({ path: mcpImplementationPathSchema, contentHash: hash }).strict()).max(10000).default([]),
  testRefs: z.array(testRef).max(10000),
  checks: z.array(z.object({
    id,
    kind: z.enum(["engineering", "behavior"]),
    command: z.string().trim().min(1).max(1024),
    args: z.array(z.string().max(12000)).max(1000),
    // Runners apply defaults; optional limits keep existing reports compatible.
    timeoutMs: z.number().int().min(1000).max(600000).optional(),
    maxOutputBytes: z.number().int().min(1024).max(4194304).optional(),
    criterionIds: ids,
  }).strict()).max(1000),
}).strict().superRefine((entry, context) => {
  unique(entry.plannedTargets, (ref) => ref.path, context, ["plannedTargets"]);
  unique(entry.actualRefs, (ref) => JSON.stringify([ref.path, ref.symbol ?? null]), context, ["actualRefs"]);
  unique(entry.inputRefs, (ref) => ref.path, context, ["inputRefs"]);
  unique(entry.testRefs, (ref) => JSON.stringify([ref.path, ref.testName ?? null]), context, ["testRefs"]);
  unique(entry.checks, (check) => check.id, context, ["checks"]);
  // Agent reports describe implementation only. A local verifier independently evaluates files and checks.
  if (entry.status === "planned") {
    for (const key of ["actualRefs", "inputRefs", "testRefs", "checks"] as const) {
      if (entry[key].length) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: "Planned entries cannot claim implementation evidence",
      });
    }
  } else if (!entry.actualRefs.length) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["actualRefs"],
    message: "Implemented entries require an actual code reference",
  });
});

export const mcpImplementationReportSchema = z.object({
  version: z.literal(1),
  projectId: id,
  scope: mcpScopeSchema,
  contextVersion: id,
  entries: z.array(reportEntry).max(10000),
}).strict().superRefine((report, context) => {
  unique(report.entries, (entry) => entry.taskId, context, ["entries"]);
});
export type McpImplementationReport = z.infer<typeof mcpImplementationReportSchema>;
