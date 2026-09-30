// Reconstructs per-model review counters from durable actual-call events, including replay.
import type { RunRecord } from "./run-record-store.js";

export function readDiagramReviewCounters(record: RunRecord, modelId: string) {
  const started = record.events.filter((event) => event.type === "run_activity" && event.modelId === modelId && event.phase === "started");
  return {
    attempts: started.filter((event) => event.type === "run_activity" && event.operation === "visual_check").length,
    structureAttempts: started.filter((event) => event.type === "run_activity" && event.operation === "structure_check").length,
    repairAttempts: started.filter((event) => event.type === "run_activity" && ["model_repair", "render_repair"].includes(event.operation ?? "")).length,
  };
}
