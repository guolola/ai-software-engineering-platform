// Presents business stages as a stable reading surface with one active status and reader-owned disclosures.
import { useState, type ReactNode } from "react";
import { ArrowDown, Bot, Check, ChevronDown, Circle, Clock3, X } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { ScrollArea } from "../../../shared/ui/scroll-area";
import { Spinner } from "../../../shared/ui/spinner";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "../../../shared/ui/ai/reasoning";
import { Shimmer } from "../../../shared/ui/ai/shimmer";
import { cn } from "../../../shared/ui/utils";
import type { TranscriptCall, TranscriptStep } from "../lib/generation-transcript";
import { readableOutput } from "../lib/generation-transcript";
import { useTranscriptScroll } from "../lib/use-transcript-scroll";
import { TranscriptMarkdown } from "./transcript-markdown";

const statusText: Record<TranscriptCall["status"], string> = {
  queued: "排队中", running: "正在处理", completed: "已完成", failed: "未完成", cancelled: "已停止", pending_review: "待确认",
};

const taskStatusText: Record<string, string> = {
  queued: "排队中", running: "生成中", completed: "已完成", failed: "未完成", cancelled: "已停止", interrupted: "服务中断，可重试", pending_review: "待确认",
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

function ProcessCall({ call }: { call: TranscriptCall }) {
  const Icon = call.status === "completed" ? Check : call.status === "failed" ? X : Circle;
  return <div data-slot="generation-call" className="min-w-0 space-y-1">
    <div className="flex items-start gap-2">
      <Icon aria-hidden="true" className={cn("mt-1.5 size-3 shrink-0", call.status === "failed" && "text-destructive")} />
      <span className="min-w-0 flex-1 break-words">{call.title}</span>
      <span className="shrink-0 text-xs leading-6">{statusText[call.status]}</span>
    </div>
    {call.summary && <p className="ml-5 whitespace-pre-wrap break-words">{call.summary}</p>}
    {call.reasoning && <Reasoning isStreaming={call.thinking && call.status === "running"} className="ml-5 rounded-md border border-border/70 bg-muted/20 px-3 py-2" data-slot="generation-reasoning">
      <ReasoningTrigger aria-label={`思考过程 · ${call.title}`} />
      <ReasoningContent>{call.reasoning}</ReasoningContent>
    </Reasoning>}
    {call.message && !["failed", "pending_review"].includes(call.status) && /修复|重试|补跑/.test(call.message) && <p className="ml-5 break-words">{call.message}</p>}
    {call.technical && call.output && <details className="ml-5">
      <summary className="w-fit cursor-pointer text-xs leading-6">查看技术原文 · {call.title}</summary>
      <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-xs leading-6">{call.output}</pre>
    </details>}
  </div>;
}

function Stage({ step, active, canRetry, onRetry }: { step: TranscriptStep; active: boolean; canRetry: boolean; onRetry?: (id: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const prose = step.calls.map((call) => ({ call, text: readableOutput(call) })).filter(({ text }) => text);
  const issues = step.calls.filter((call) => ["failed", "pending_review"].includes(call.status));
  const currentStatus = active ? step.calls.some((call) => call.thinking) ? "正在分析" : prose.length ? "正在生成" : "正在处理" : statusText[step.status];
  // Retain repair explanations, but avoid filling the reading surface with successive progress notices.
  const messages = step.messages.filter((message, index) => /修复|重试|失败|复核/.test(message) || index === step.messages.length - 1);
  return <section aria-label={step.title} className="min-w-0 space-y-4" data-testid="generation-task-step" data-active-step={active}>
    <h3 className="flex items-center gap-2 text-base font-medium leading-7">
      {active && <Spinner aria-hidden="true" className="size-3.5" />}
      {active ? <Shimmer>{step.title}</Shimmer> : <span>{step.title}</span>}
      <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">{currentStatus}</span>
    </h3>
    {(step.calls.length > 0 || messages.length > 0) && <div className="text-sm leading-6 text-muted-foreground">
      <Button type="button" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="h-auto gap-2 px-0 py-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground">
        思考与执行过程<ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform motion-reduce:transition-none", expanded && "rotate-180")} />
      </Button>
      <div hidden={!expanded} className="mt-3 space-y-3 border-l border-border/70 pl-4">
        {messages.map((message) => <p key={message} className="whitespace-pre-wrap break-words">{message}</p>)}
        {step.calls.map((call) => <ProcessCall key={call.id} call={call} />)}
      </div>
    </div>}
    {issues.map((call) => <div key={call.id} className={cn("text-sm leading-6", call.status === "failed" ? "text-destructive" : "text-warning")}>
      <p>{call.title}：{call.message || (call.status === "failed" ? "本次处理未完成。" : "有追踪关系需要确认。")}</p>
      {canRetry && call.status === "failed" && call.subtaskId && onRetry && <Button size="sm" variant="link" className="h-auto px-0 py-0" title={call.subtaskId.includes(":") ? "当前重试按模型类型执行，会重试同类模型而不是单个实例" : "重试此模型"} onClick={() => onRetry(call.subtaskId!)}>{call.subtaskId.includes(":") ? "重试全部同类模型" : "重试此模型"}</Button>}
    </div>)}
    {prose.map(({ call, text }, index) => <div key={call.id} data-reading-anchor={index === 0 ? "" : undefined} className="min-w-0 space-y-2 pt-1">
      {prose.length > 1 && <h4 className="text-sm font-medium leading-6">{call.title}</h4>}
      <TranscriptMarkdown text={text} />
    </div>)}
  </section>;
}

export function GenerationTranscript({ taskKey, steps, active, status, queue, introduction, finalMessage, children, onRetry }: {
  taskKey: string; steps: TranscriptStep[]; active: boolean; status?: string; queue?: GenerationQueueDetails | null; introduction: string; finalMessage: string;
  children?: ReactNode; onRetry?: (id: string) => void;
}) {
  const { viewportRef, contentRef, away, returnToLatest } = useTranscriptScroll(taskKey, steps);
  const current = active ? steps.findIndex((step) => !step.finished) : -1;
  return <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-testid="generation-transcript">
    <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef} viewportClassName="[overflow-anchor:none]" contentClassName="!block">
      <div ref={contentRef} data-slot="ai-conversation" className="min-w-0 space-y-8 pb-12 pr-4 text-base leading-7">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Bot className="size-4" aria-hidden="true" />Agent</div>
          <p className="text-lg font-medium">{introduction}</p>
          {status && <p role="status" className="text-sm text-muted-foreground">任务状态：{taskStatusText[status] ?? status}{active && steps[current] ? ` · 当前阶段：${steps[current].title}` : ""}</p>}
        </div>
        {queue && <QueueProgress queue={queue} />}
        {steps.map((step, index) => <Stage key={step.id ?? step.stage} step={step} active={index === current} canRetry={!active} onRetry={onRetry} />)}
        {active && steps.length === 0 && !queue && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" className="size-3.5" /><Shimmer>等待任务开始，执行过程会在这里逐段显示。</Shimmer></p>}
        {finalMessage && <p role="status" className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{finalMessage}</p>}
        {children}
      </div>
    </ScrollArea>
    {away && <Button size="sm" variant="secondary" className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full shadow-sm" onClick={returnToLatest}><ArrowDown className="size-3.5" />回到最新</Button>}
  </div>;
}
