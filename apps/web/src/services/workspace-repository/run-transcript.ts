// Reads the authorized project run transcript and tails the existing SSE endpoint.
import { runEventSchema, type RunEvent } from "@uml-platform/contracts";
import { requestJson } from "../api-client";
import { streamProjectRunEvents } from "./run-subscriptions";

const endpoints: Record<string, string> = {
  requirements: "runs", design: "design-runs", code: "code-runs",
  document: "document-runs", feasibility: "feasibility-runs",
};

export async function readRunTranscript(projectId: string, runId: string, signal: AbortSignal) {
  const result = await requestJson<{ events?: unknown[]; run: { status: string; runKind?: string | null } }>(
    `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}?includeEvents=true`, { signal },
  );
  const events = (result.events ?? []).flatMap((item) => {
    const parsed = runEventSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return { ...result, events };
}

export function streamRunTranscript(projectId: string, runId: string, kind: string, onEvent: (event: RunEvent) => void, signal: AbortSignal) {
  const endpoint = endpoints[kind];
  if (!endpoint) return Promise.reject(new Error("Unsupported run kind"));
  return streamProjectRunEvents(`/api/${endpoint}/${encodeURIComponent(runId)}/events`, projectId, onEvent, signal);
}
