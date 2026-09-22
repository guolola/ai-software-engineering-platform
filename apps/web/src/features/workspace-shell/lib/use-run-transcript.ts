// Restores one selected task and reconnects without restarting generation or mixing tasks.
import { useEffect, useState } from "react";
import type { RunEvent } from "@uml-platform/contracts";
import { ApiClientError } from "../../../services/api-client";
import { readRunTranscript, streamRunTranscript } from "../../../services/workspace-repository/run-transcript";
import { mergeTranscriptEvents } from "../../workspace-session/lib/run-transcript";

export function useRunTranscript(projectId?: string | null, runId?: string | null, kind?: string | null) {
  const key = `${projectId ?? ""}:${runId ?? ""}`;
  const [state, setState] = useState<{ key: string; events: RunEvent[]; status?: string; loading: boolean; disconnected: boolean; unavailable: boolean }>({ key, events: [], loading: false, disconnected: false, unavailable: false });
  useEffect(() => {
    if (!projectId || !runId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    let terminal = false;
    setState({ key, events: [], loading: true, disconnected: false, unavailable: false });
    const update = (events: RunEvent[]) => {
      terminal ||= events.some((event) => ["completed", "failed", "cancelled"].includes(event.type));
      if (!controller.signal.aborted) setState((current) => ({ ...current, events: mergeTranscriptEvents(current.events, events), loading: false, disconnected: false }));
    };
    const connect = async () => {
      try {
        const result = await readRunTranscript(projectId, runId, controller.signal);
        if (controller.signal.aborted) return;
        update(result.events);
        setState((current) => ({ ...current, status: result.run.status }));
        if (!["queued", "running"].includes(result.run.status)) return;
        await streamRunTranscript(projectId, runId, result.run.runKind ?? kind ?? "requirements", (event) => { delay = 1000; update([event]); }, controller.signal);
      } catch (error) {
        if (controller.signal.aborted || terminal) return;
        const unavailable = error instanceof ApiClientError && [401, 403, 404].includes(error.status);
        setState((current) => ({ ...current, loading: false, disconnected: !unavailable, unavailable }));
        if (!unavailable) {
          timer = setTimeout(() => void connect(), delay);
          delay = Math.min(delay * 2, 10000);
        }
      }
    };
    void connect();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [key, projectId, runId, kind]);
  return state.key === key ? state : { key, events: [], loading: Boolean(projectId && runId), disconnected: false, unavailable: false };
}
