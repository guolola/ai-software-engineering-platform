// Presents one task timeline with nested stage details and a separate final result.
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, Bot, Check, ChevronDown, Circle, Clock3, FileText, ImageIcon, LoaderCircle, ScanEye, X } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { ScrollArea } from "../../../shared/ui/scroll-area";
import { Spinner } from "../../../shared/ui/spinner";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "../../../shared/ui/ai/reasoning";
import { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader, ChainOfThoughtImage, ChainOfThoughtStep } from "../../../shared/ui/ai/chain-of-thought";
import { Shimmer } from "../../../shared/ui/ai/shimmer";
import { cn } from "../../../shared/ui/utils";
import type { TranscriptCall, TranscriptStep } from "../lib/generation-transcript";
import { readableOutput } from "../lib/generation-transcript";
import { useTranscriptScroll } from "../lib/use-transcript-scroll";
import { TranscriptMarkdown } from "./transcript-markdown";

const statusText: Record<TranscriptCall["status"], string> = {
  queued: "排队中", running: "正在处理", completed: "已完成", failed: "未完成", cancelled: "已停止", pending_review: "待确认",
};

export interface GenerationQueueDetails {
  position?: number;
  ahead?: number;
  estimatedWaitMs?: number;
  reason?: "global" | "provider" | "project" | "user" | "run";
  items: Array<{ id: string; label: string; ahead?: number; estimatedWaitMs?: number; reason?: "global" | "provider" | "project" | "user" | "run" }>;
}

const queueReasons: Record<NonNullable<GenerationQueueDetails["reason"]>, string> = {
  global: "全部任务繁忙", provider: "模型服务繁忙", project: "本项目有任务在执行", user: "你的任务正在等待", run: "同一任务内等待",
};

function queueDescription(ahead?: number, estimatedWaitMs?: number, reason?: GenerationQueueDetails["reason"]) {
  const parts: string[] = [];
  if (ahead !== undefined) parts.push(`前方 ${ahead} 个模型调用`);
  if (estimatedWaitMs !== undefined) parts.push(estimatedWaitMs <= 0 ? "即将开始" : estimatedWaitMs < 60000 ? "预计等待不足 1 分钟" : `预计等待约 ${Math.ceil(estimatedWaitMs / 60000)} 分钟`);
  if (reason) parts.push(queueReasons[reason]);
  return parts.join(" · ");
}

function QueueProgress({ queue }: { queue: GenerationQueueDetails }) {
  const [expanded, setExpanded] = useState(true);
  const description = queueDescription(queue.ahead, queue.estimatedWaitMs, queue.reason);
  return <section aria-label="排队进度" className="min-w-0 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
    <div className="flex items-center gap-2 font-medium"><Clock3 className="size-4" aria-hidden="true" /><span>{queue.position !== undefined ? `队列第 ${queue.position} 位` : "排队中"}</span>{queue.items.length > 0 && <span className="ml-auto text-xs font-normal text-muted-foreground">{queue.items.length} 项等待中</span>}</div>
    {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    {queue.items.length > 0 && <>
      <Button type="button" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="mt-2 h-auto gap-1 px-0 py-0 text-xs text-muted-foreground hover:bg-transparent">查看排队项目<ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform motion-reduce:transition-none", expanded && "rotate-180")} /></Button>
      <ul hidden={!expanded} className="mt-2 space-y-2 border-l border-border pl-3 text-xs text-muted-foreground">{queue.items.map((item) => <li key={item.id} className="min-w-0"><span className="break-words text-foreground">{item.label}</span>{queueDescription(item.ahead, item.estimatedWaitMs, item.reason) && <span className="ml-2">{queueDescription(item.ahead, item.estimatedWaitMs, item.reason)}</span>}</li>)}</ul>
    </>}
  </section>;
}

function ProcessCall({ call, showTitle }: { call: TranscriptCall; showTitle: boolean }) {
  const Icon = call.status === "completed" ? Check : call.status === "failed" ? X : Circle;
  const prose = readableOutput(call);
  return <div data-slot="generation-call" className="min-w-0 space-y-2 text-sm leading-6 text-muted-foreground">
    {showTitle && <div className="flex items-start gap-2">
      <Icon aria-hidden="true" className={cn("mt-1.5 size-3 shrink-0", call.status === "failed" && "text-destructive")} />
      <span className="min-w-0 flex-1 break-words">{call.title}</span>
      <span className="shrink-0 text-xs leading-6">{statusText[call.status]}</span>
    </div>}
    {call.inputImages?.filter((image) => /^(?:https?:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(image.url)).map((image) => <ChainOfThoughtImage key={image.url} caption={image.caption ?? `${call.title}使用的图片`}>
      <img src={image.url} alt={image.caption ?? `${call.title}的输入图片`} className="max-h-80 max-w-full object-contain" loading="lazy" />
    </ChainOfThoughtImage>)}
    {call.summary && <p className="whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">模型推理摘要：{call.summary}</p>}
    {call.reasoning && <Reasoning isStreaming={call.thinking && call.status === "running"} data-slot="generation-reasoning">
      <ReasoningTrigger aria-label={`思考过程 · ${call.title}`} />
      <ReasoningContent>{call.reasoning}</ReasoningContent>
    </Reasoning>}
    {prose && <div data-reading-anchor=""><TranscriptMarkdown text={prose} compact /></div>}
    {call.review && <div className="space-y-2 text-xs leading-5" data-slot="diagram-review-details">
      <p>结构核对 {call.review.structureAttempts ?? 0} 次 · 图片检查 {call.review.attempts} 次 · 纠错尝试 {call.review.repairAttempts ?? 0} 次</p>
      {call.review.findings?.map((finding) => <p key={finding.id}>{finding.verification === "verified" ? "已核实" : finding.verification === "inconclusive" ? "无法核实" : "待确认"}：{finding.observation}{finding.evidence.length > 0 && <span>（依据：{finding.evidence.map((item) => item.reference).join("、")}）</span>}</p>)}
      {call.review.repairHistory?.map((repair) => <div key={`${repair.round}:${repair.target}`}>
        <p>第 {repair.round} 轮{repair.target === "model" ? "结构纠错" : "图形重建"}：{repair.status === "accepted" ? "已接受" : repair.status === "rejected" ? "已拒绝" : "未完成"} · {repair.reason}</p>
        {repair.changes.map((change) => <p key={change} className="break-words">{change}</p>)}
      </div>)}
      {call.review.stopReason && <p>停止原因：{call.review.stopReason}</p>}
    </div>}
    {call.message && !["failed", "pending_review"].includes(call.status) && /修复|重试|补跑|人工确认|跳过/.test(call.message) && <p className="break-words">{call.message}</p>}
    {call.technical && call.output && <details>
      <summary className="w-fit cursor-pointer text-xs leading-6">查看技术原文 · {call.title}</summary>
      <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-xs leading-6 text-black dark:text-foreground">{call.output}</pre>
    </details>}
  </div>;
}

function Stage({ step, active }: { step: TranscriptStep; active: boolean }) {
  const hasProse = step.calls.some((call) => readableOutput(call));
  const currentStatus = active ? step.calls.some((call) => call.thinking) ? "正在分析" : hasProse ? "正在生成" : "正在处理" : statusText[step.status];
  // Retain repair explanations, but avoid filling the reading surface with successive progress notices.
  const messages = step.messages.filter((message, index) => /修复|重试|失败|复核/.test(message) || (!hasProse && index === step.messages.length - 1));
  const Icon = active ? LoaderCircle : step.status === "failed" ? X : step.stage.includes("verify") ? ScanEye : step.stage.includes("render") ? ImageIcon : FileText;
  return <ChainOfThoughtStep aria-label={step.title} data-testid="generation-task-step" data-active-step={active}
    icon={Icon} iconClassName={active ? "animate-spin motion-reduce:animate-none" : undefined}
    label={active ? <Shimmer>{step.title}</Shimmer> : step.title} status={active ? "active" : step.status === "queued" ? "pending" : "complete"} statusLabel={currentStatus}>
    {messages.map((message) => <p key={message} className="whitespace-pre-wrap break-words">{message}</p>)}
    {step.calls.map((call) => <ProcessCall key={call.id} call={call} showTitle={step.calls.length > 1} />)}
  </ChainOfThoughtStep>;
}

function TaskIssues({ steps, canRetry, onRetry }: { steps: TranscriptStep[]; canRetry: boolean; onRetry?: (id: string) => void }) {
  const issues = steps.flatMap((step) => step.calls.filter((call) => ["failed", "pending_review"].includes(call.status)).map((call) => ({ call, key: `${step.id ?? step.stage}:${call.id}` })));
  if (!issues.length) return null;
  // Actionable results remain visible when the reader folds the task's timeline.
  return <div className="space-y-3" data-slot="generation-task-issues">
    {issues.map(({ call, key }) => <div key={key} className={cn("text-sm leading-6", call.status === "failed" ? "text-destructive" : "text-warning")}>
      <p>{call.title}：{call.message || (call.status === "failed" ? "本次处理未完成。" : "有追踪关系需要确认。")}</p>
      {canRetry && call.status === "failed" && call.subtaskId && onRetry && <Button size="sm" variant="link" className="h-auto px-0 py-0" title={call.subtaskId.includes(":") ? "当前重试按模型类型执行，会重试同类模型而不是单个实例" : "重试此模型"} onClick={() => onRetry(call.subtaskId!)}>{call.subtaskId.includes(":") ? "重试全部同类模型" : "重试此模型"}</Button>}
    </div>)}
  </div>;
}

export function GenerationTranscript({ taskKey, steps, active, kind, model, queue, emptyMessage, finalMessage, children, onRetry }: {
  taskKey: string; steps: TranscriptStep[]; active: boolean; kind?: string | null; model?: string | null; queue?: GenerationQueueDetails | null; emptyMessage?: string; finalMessage: string;
  children?: ReactNode; onRetry?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { viewportRef, contentRef, away, returnToLatest } = useTranscriptScroll(taskKey, steps);
  const assistantKind = kind && ["requirements", "design", "code", "document", "feasibility"].includes(kind) ? kind : "unknown";
  const thoughtLabel = t(`generation.thoughtProcess.${active ? "active" : "finished"}`);
  return <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-testid="generation-transcript">
    <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef} viewportClassName="[overflow-anchor:none]" contentClassName="!block">
      <div ref={contentRef} data-slot="ai-conversation" className="min-w-0 space-y-8 pb-12 pr-4 text-base leading-7">
        <div className="space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium" data-slot="generation-assistant-header">
            <span className="flex min-w-0 items-center gap-2"><Bot className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span>{t(`generation.assistants.${assistantKind}`)}</span></span>
            {model?.trim() && <Badge variant="secondary" title={model} className="max-w-full min-w-0 truncate font-mono" data-slot="generation-model">{model}</Badge>}
          </div>
          {emptyMessage && <p className="text-sm text-muted-foreground">{emptyMessage}</p>}
        </div>
        {queue && <QueueProgress queue={queue} />}
        {steps.length > 0 && <ChainOfThought key={taskKey} defaultOpen>
          <ChainOfThoughtHeader aria-label={thoughtLabel}>{thoughtLabel}</ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {steps.map((step) => <Stage key={step.id ?? step.stage} step={step} active={active && !step.finished} />)}
          </ChainOfThoughtContent>
        </ChainOfThought>}
        {active && steps.length === 0 && !queue && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" className="size-3.5" /><Shimmer>等待任务开始，执行过程会在这里逐段显示。</Shimmer></p>}
        {finalMessage && <section aria-label="输出总结" data-slot="generation-task-summary" className="text-black dark:text-foreground"><p role="status" className="whitespace-pre-wrap break-words">{finalMessage}</p></section>}
        <TaskIssues steps={steps} canRetry={!active} onRetry={onRetry} />
        {children}
      </div>
    </ScrollArea>
    {away && <Button size="sm" variant="secondary" className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full shadow-sm" onClick={returnToLatest}><ArrowDown className="size-3.5" />回到最新</Button>}
  </div>;
}
