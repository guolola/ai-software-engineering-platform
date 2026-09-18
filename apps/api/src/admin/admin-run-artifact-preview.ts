// Restores missing historical UML previews from persisted PlantUML without exposing source text.
import { diagramKindSchema } from "@uml-platform/contracts";
import type {
  AnyPlantUmlArtifact,
  RenderClient,
} from "../adapters/render/render-client.js";
import type { RunRecord } from "../runs/records/run-record-store.js";

export type AdminPreviewFailure = {
  key: string;
  diagramKind: string;
  modelId?: string;
  message: string;
};

const inFlight = new WeakMap<RunRecord, Promise<AdminPreviewFailure[]>>();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function artifactKey(artifact: Record<string, unknown>, index: number) {
  const diagramKind = typeof artifact.diagramKind === "string"
    ? artifact.diagramKind
    : "diagram";
  const modelId = typeof artifact.modelId === "string" ? artifact.modelId : null;
  return modelId ?? `${diagramKind}:${index}`;
}

function parsePlantUmlArtifact(value: unknown): AnyPlantUmlArtifact | null {
  const record = asRecord(value);
  const kind = diagramKindSchema.safeParse(record.diagramKind);
  if (!kind.success || typeof record.source !== "string" || !record.source.trim()) return null;
  return {
    diagramKind: kind.data,
    source: record.source,
    modelId: typeof record.modelId === "string" ? record.modelId : undefined,
  };
}

async function restoreMissingPreviews(
  record: RunRecord,
  renderClient: RenderClient,
): Promise<AdminPreviewFailure[]> {
  const snapshot = asRecord(record.snapshot);
  const plantUml = Array.isArray(snapshot.plantUml) ? snapshot.plantUml : [];
  const svgArtifacts = Array.isArray(snapshot.svgArtifacts) ? snapshot.svgArtifacts : null;
  if (!svgArtifacts || plantUml.length === 0) return [];

  const existing = new Set(
    svgArtifacts.map((artifact, index) => artifactKey(asRecord(artifact), index)),
  );
  const failures: AdminPreviewFailure[] = [];
  let changed = false;

  for (const [index, rawArtifact] of plantUml.entries()) {
    const artifactRecord = asRecord(rawArtifact);
    const key = artifactKey(artifactRecord, index);
    if (existing.has(key)) continue;
    const artifact = parsePlantUmlArtifact(rawArtifact);
    if (!artifact) continue;

    try {
      const rendered = await renderClient(artifact);
      if (!/<svg(?:\s|>)/iu.test(rendered.svg)) {
        throw new Error("Render Service returned an invalid SVG document");
      }
      svgArtifacts.push({
        diagramKind: artifact.diagramKind,
        modelId: artifact.modelId,
        svg: rendered.svg,
        renderMeta: rendered.renderMeta,
      });
      existing.add(key);
      changed = true;
    } catch {
      failures.push({
        key,
        diagramKind: artifact.diagramKind,
        modelId: artifact.modelId,
        message: "Render Service 未能生成模型图，请稍后重试。",
      });
    }
  }

  if (changed) await record.persist?.(record);
  return failures;
}

export function ensureAdminRunSvgPreviews(
  record: RunRecord,
  renderClient: RenderClient,
) {
  const current = inFlight.get(record);
  if (current) return current;
  const task = restoreMissingPreviews(record, renderClient).finally(() => {
    inFlight.delete(record);
  });
  inFlight.set(record, task);
  return task;
}
