// Composes the selected task's restored transcript, actions and result links without card-based UI.
import { useMemo, useState } from "react";
import type { DesignDiagramKind, DiagramKind, RunEvent, RunStage } from "@uml-platform/contracts";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { downloadBlobFile } from "../../../shared/lib/download";
import { requestOpenGenerationTask } from "../../../shared/lib/app-navigation";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import { platformApi, type PlatformRunSummary } from "../../user-platform/services/platform-api";
import { useWorkspaceSession } from "../../workspace-session/state";
import { mergeTranscriptEvents } from "../../workspace-session/lib/run-transcript";
import type { RunDiagnostics } from "../../workspace-session/model/session-state";
import { projectGenerationTranscript, readableTaskText } from "../lib/generation-transcript";
import { useFrameValue } from "../lib/use-frame-value";
import { useRunTranscript } from "../lib/use-run-transcript";
import { GenerationTranscript } from "./generation-transcript";
import { useOptionalWorkspaceShell } from "../state";
import { operationFailurePresentation } from "../../workspace-session/lib/operation-failure";
import { useFloatingAlert } from "../../../shared/ui/floating-alert";

const emptyRuns: PlatformRunSummary[] = [];
const emptyEvents: RunEvent[] = [];
function legacyDiagnostics(diagnostics: RunDiagnostics): RunEvent[] {
  const events: RunEvent[] = Object.entries(diagnostics.stageStartedAt).map(([stage, at]) => ({ type: "stage_started", stage: stage as RunStage, createdAt: at }));
  if (diagnostics.activeStage && !events.some((event) => "stage" in event && event.stage === diagnostics.activeStage)) events.push({ type: "stage_started", stage: diagnostics.activeStage });
  for (const [stage, message] of Object.entries(diagnostics.stageMessages)) {
    if (message) events.push({ type: "stage_progress", stage: stage as RunStage, progress: 0, message });
  }
  if (diagnostics.activeStage && diagnostics.streamText) events.push({ type: "llm_chunk", stage: diagnostics.activeStage, chunk: diagnostics.streamText });
  return events;
}

export function ProjectGenerationTasksDrawerContent({ projectRuns = emptyRuns, preferredRunId, projectId, onViewResult }: {
  projectRuns?: PlatformRunSummary[];
  preferredRunId?: string | null;
  projectId?: string;
  onViewResult?: () => void;
} = {}) {
  const { t } = useTranslation();
  const { showAlert } = useFloatingAlert();
  const session = useWorkspaceSession();
  const repository = useWorkspaceRepository();
  const shell = useOptionalWorkspaceShell();
  const [actionBusy, setActionBusy] = useState(false);
  const [previewRunId, setPreviewRunId] = useState<string | null>(null);
  const [actionRun, setActionRun] = useState<PlatformRunSummary | null>(null);
  const explicitlySelectedLocal = session.selectedGenerationTaskId
    ? session.generationTasks.find(
        (task) => task.clientTaskId === session.selectedGenerationTaskId,
      )
    : undefined;
  const candidateLocal = preferredRunId
    ? session.generationTasks.find((task) => task.runId === preferredRunId)
    : explicitlySelectedLocal ?? session.generationTasks.find((task) => ["queued", "running"].includes(task.status)) ?? session.generationTasks[0];
  const hasExplicitLocalSelection = !preferredRunId && Boolean(explicitlySelectedLocal);
  const activeRemote = projectRuns.find((run) => ["queued", "running"].includes(run.status));
  const local = !hasExplicitLocalSelection && !preferredRunId && activeRemote && candidateLocal && !["queued", "running"].includes(candidateLocal.status) ? undefined : candidateLocal;
  const remote = projectRuns.find((run) => run.runId === (preferredRunId ?? local?.runId))
    ?? (preferredRunId || hasExplicitLocalSelection ? undefined : activeRemote ?? [...projectRuns].sort((a, b) => (b.updatedAt ?? b.completedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.completedAt ?? a.createdAt ?? ""))[0]);
  const relevantAction = actionRun && (!preferredRunId || preferredRunId === actionRun.runId || preferredRunId === actionRun.sourceRunId) ? actionRun : null;
  const runId = relevantAction?.runId ?? preferredRunId ?? local?.runId ?? (hasExplicitLocalSelection ? null : remote?.runId ?? session.currentRunDiagnostics.runId);
  const selectedLocal = local?.runId === runId || !runId ? local : undefined;
  const selectedRemote = relevantAction?.runId === runId ? relevantAction : remote?.runId === runId ? remote : undefined;
  const kind = selectedLocal?.kind ?? selectedRemote?.runKind ?? session.currentRunDiagnostics.runKind;
  const scopedProjectId = projectId ?? selectedRemote?.projectId;
  const restored = useRunTranscript(scopedProjectId, runId, kind);
  const diagnostics = selectedLocal?.diagnostics ?? (!runId || session.currentRunDiagnostics.runId === runId ? session.currentRunDiagnostics : undefined);
  const events = useMemo(() => {
    const localEvents = diagnostics ? diagnostics.transcript ?? (restored.events.length ? emptyEvents : legacyDiagnostics(diagnostics)) : !restored.events.length && selectedRemote?.stage ? [{ type: "stage_started", stage: selectedRemote.stage as RunStage }] as RunEvent[] : emptyEvents;
    return mergeTranscriptEvents(restored.events, localEvents);
  }, [diagnostics, restored.events, selectedRemote?.stage]);
  const fallbackStatus = relevantAction?.status ?? restored.status ?? selectedRemote?.status ?? selectedLocal?.status ?? (runId ? "running" : session.runStatus);
  const taskKey = runId ?? selectedLocal?.clientTaskId ?? "empty";
  const live = ["queued", "running"].includes(fallbackStatus) && !events.some((event) => ["completed", "failed", "cancelled"].includes(event.type));
  const displayedEvents = useFrameValue(events, live && !restored.loading, taskKey);
  const transcript = useMemo(() => projectGenerationTranscript(displayedEvents, fallbackStatus, selectedLocal?.subtasks), [displayedEvents, fallbackStatus, selectedLocal?.subtasks]);
  const active = ["queued", "running"].includes(transcript.status);
  const title = t(`generation.taskKinds.${kind ?? "unknown"}`);
  const perform = async (action: () => Promise<void>) => {
    if (actionBusy) return;
    setActionBusy(true);
    try { await action(); } catch (error) {
      showAlert({
        title: operationFailurePresentation(error, {
          fallbackMessage: t("errors.operations.taskAction"),
        }).message,
        tone: "destructive",
      });
    }
    finally { setActionBusy(false); }
  };
  const retrySubtask = (id: string) => {
    if (active || actionBusy) return;
    const diagram = id.replace(/^(generate_models|generate_design_models|generate_design_sequence|generate_plantuml|render_svg):/, "").split(":")[0];
    if (kind === "requirements" && ["function", "usecase", "class", "activity", "deployment", "prototype", "analysis"].includes(diagram)) void session.generateDiagrams([diagram as DiagramKind]);
    if (kind === "design" && ["architecture", "sequence", "class", "activity", "component", "deployment", "table"].includes(diagram)) void session.generateDesignDiagrams([diagram as DesignDiagramKind]);
  };
  const completed = transcript.completed?.snapshot;
  return <GenerationTranscript key={taskKey} taskKey={taskKey} steps={transcript.visibleSteps} active={active}
    introduction={runId || selectedLocal ? title : "暂无生成任务。发起生成后，执行过程会在这里逐段显示。"}
    finalMessage={transcript.finalMessage || (!active && runId ? t(`generation.status.${transcript.status === "interrupted" ? "interruptedDetail" : transcript.status}`) : "")}
    onRetry={kind === "requirements" || kind === "design" ? retrySubtask : undefined}>
    {restored.loading && <p role="status" className="text-sm text-muted-foreground">正在恢复任务过程…</p>}
    {restored.disconnected && <p role="status" className="text-sm text-muted-foreground">连接中断，正在恢复。已收到的内容会保留。</p>}
    {restored.unavailable && <p role="status" className="text-xs text-destructive">无法读取任务过程，任务可能已移除或你没有访问权限。</p>}
    {!restored.loading && runId && !events.some((event) => event.type === "run_activity") && <p className="text-xs text-muted-foreground">此任务未保存完整回复，当前仅展示可用的执行记录。</p>}
    {diagnostics?.uiMockup?.imageUrl && <a className="text-sm underline underline-offset-4" href={diagnostics.uiMockup.imageUrl} target="_blank" rel="noreferrer">查看界面设计图</a>}
    {diagnostics?.uiFidelityReport && <p>{readableTaskText(diagnostics.uiFidelityReport.summary)}</p>}
    <div className="flex flex-wrap items-center gap-3">
      {active && scopedProjectId && runId && <Button size="sm" variant="ghost" disabled={actionBusy} onClick={() => void perform(async () => {
        if (!active) return;
        const response = await platformApi.cancelProjectRun(scopedProjectId, runId);
        setActionRun({ ...selectedRemote, runId, runKind: kind, status: response.status ?? response.run?.status ?? "cancelled" });
      })}>停止生成</Button>}
      {!active && ["failed", "cancelled", "interrupted"].includes(transcript.status) && scopedProjectId && runId && <Button size="sm" variant="ghost" disabled={actionBusy} onClick={() => void perform(async () => {
        if (active) return;
        const response = await platformApi.retryProjectRun(scopedProjectId, runId);
        const nextId = response.runId ?? response.run?.runId;
        if (nextId) { setActionRun({ ...response.run, runId: nextId, sourceRunId: runId, runKind: kind, status: response.status ?? response.run?.status ?? "queued" }); requestOpenGenerationTask({ runId: nextId }); }
      })}>重试任务</Button>}
      {completed && <Button size="sm" variant="link" className="h-auto p-0" onClick={() => setPreviewRunId(previewRunId === runId ? null : runId ?? null)}>{previewRunId === runId ? "收起结果" : kind === "code" ? "查看代码文件" : kind === "document" ? "查看文档正文" : "查看生成结果"}</Button>}
      {completed && kind === "code" && shell && session.currentRunDiagnostics.runId === runId && <Button size="sm" variant="link" className="h-auto p-0" onClick={() => { shell.openWorkspaceTab({ kind: "workspace-placeholder", workspaceId: "code", label: "代码" }); onViewResult?.(); }}>打开代码原型</Button>}
      {completed && "documentKind" in completed && (completed.documentId || completed.byteLength > 0) && selectedRemote?.documentDownloadAvailable !== false && repository.downloadDocumentRun && runId && <Button size="sm" variant="link" className="h-auto p-0" disabled={actionBusy} onClick={() => void perform(async () => {
        const result = await repository.downloadDocumentRun!(runId, completed.fileName ?? undefined);
        downloadBlobFile(result.fileName, result.blob);
      })}>下载文档</Button>}
    </div>
    {completed && previewRunId === runId && <div className="min-w-0 space-y-4" aria-label="生成结果">
      {"svgArtifacts" in completed && completed.svgArtifacts.map((artifact, index) => <figure key={index} className="min-w-0"><img alt={`生成的 UML 图 ${index + 1}`} className="max-h-96 max-w-full object-contain" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(artifact.svg)}`} /></figure>)}
      {"files" in completed && Object.entries(completed.files).map(([path, content]) => <details key={path}><summary className="cursor-pointer break-all text-sm">{path}</summary><pre className="whitespace-pre-wrap break-all text-xs">{content}</pre></details>)}
      {"sections" in completed && completed.sections.map((section, index) => <section key={index} className="space-y-2"><h4 className="font-medium">{section.title}</h4>{section.body.map((paragraph, item) => <p key={item} className="whitespace-pre-wrap break-words">{paragraph}</p>)}</section>)}
    </div>}
  </GenerationTranscript>;
}
