// Keeps replayable conversation events separate from truncated diagnostics and ignores duplicate delivery.
import type { RunEvent } from "@uml-platform/contracts";

export function appendTranscriptEvent(events: RunEvent[], event: RunEvent): RunEvent[] {
  if (event.eventId && events.some((item) => item.eventId === event.eventId)) return events;
  if (events.some((item) => ["completed", "failed", "cancelled"].includes(item.type))) return events;
  // New calls carry durable batched output; avoid rendering their legacy chunk mirror twice.
  if (event.type === "llm_chunk" && events.some((item) => item.type === "run_activity" && item.stage === event.stage)) return events;
  return [...events, event];
}

export function mergeTranscriptEvents(events: RunEvent[], incoming: RunEvent[]) {
  return incoming.reduce(appendTranscriptEvent, events);
}
