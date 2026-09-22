// Batches durable user-visible output and records the lifetime of one real model call.
import { randomUUID } from "node:crypto";
import type { RunActivityEvent, RunStage } from "@uml-platform/contracts";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";

export function createCallActivity(input: {
  record: RunRecord;
  stage: RunStage;
  subtaskId?: string;
  subtaskLabel?: string;
  format?: "text" | "technical";
}) {
  const callId = randomUUID();
  let started = false;
  let ended = false;
  let thinking = false;
  let pending = "";
  let summary = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const emit = (phase: RunActivityEvent["phase"], text?: string) => {
    emitEvent(input.record, {
      type: "run_activity", eventId: randomUUID(), createdAt: new Date().toISOString(),
      runId: input.record.snapshot.runId, stage: input.stage, callId,
      subtaskId: input.subtaskId, subtaskLabel: input.subtaskLabel,
      format: input.format ?? "technical", phase, text,
    });
  };
  const start = () => {
    if (started || ended || input.record.terminal) return;
    started = true;
    emit("started");
  };
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (pending) { emit("output", pending); pending = ""; }
    if (summary) { emit("summary", summary); summary = ""; }
  };
  const schedule = () => {
    if (pending.length + summary.length >= 4096) flush();
    else timer ??= setTimeout(flush, 100);
  };
  const finish = (phase: "completed" | "failed") => {
    if (ended) return;
    start();
    // Flush before the closing event so replay and live output have identical order.
    flush();
    ended = true;
    emit(phase);
    input.record.beforeTerminal?.delete(beforeTerminal);
  };
  const beforeTerminal = () => { flush(); ended = true; };
  (input.record.beforeTerminal ??= new Set()).add(beforeTerminal);
  return {
    onStart: start,
    onChunk(chunk: string) {
      if (ended || input.record.terminal) return;
      start(); pending += chunk; schedule();
    },
    onReasoningChunk() {
      if (ended || thinking || input.record.terminal) return;
      start(); thinking = true; emit("thinking");
    },
    onReasoningSummary(chunk: string) {
      if (ended || input.record.terminal) return;
      start(); summary += chunk; schedule();
    },
    onComplete: () => finish("completed"),
    onError: () => finish("failed"),
  };
}
