// Presents business stages as a stable reading surface with one active status and reader-owned disclosures.
import { useState, type ReactNode } from "react";
import { ArrowDown, Bot, Check, ChevronDown, Circle, X } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { ScrollArea } from "../../../shared/ui/scroll-area";
import { Spinner } from "../../../shared/ui/spinner";
import { ShimmerText } from "../../../shared/ui/shimmer-text";
import { cn } from "../../../shared/ui/utils";
import type { TranscriptCall, TranscriptStep } from "../lib/generation-transcript";
import { readableOutput } from "../lib/generation-transcript";
import { useTranscriptScroll } from "../lib/use-transcript-scroll";
import { TranscriptMarkdown } from "./transcript-markdown";

const statusText: Record<TranscriptCall["status"], string> = {
  queued: "排队中", running: "正在处理", completed: "已完成", failed: "未完成", cancelled: "已停止", pending_review: "待确认",
};

function ProcessCall({ call }: { call: TranscriptCall }) {
  const Icon = call.status === "completed" ? Check : call.status === "failed" ? X : Circle;
  return <div data-slot="generation-call" className="min-w-0 space-y-1">
    <div className="flex items-start gap-2">
      <Icon aria-hidden="true" className={cn("mt-1.5 size-3 shrink-0", call.status === "failed" && "text-destructive")} />
      <span className="min-w-0 flex-1 break-words">{call.title}</span>
      <span className="shrink-0 text-xs leading-6">{statusText[call.status]}</span>
    </div>
    {call.summary && <p className="ml-5 whitespace-pre-wrap break-words">{call.summary}</p>}
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
      <ShimmerText active={active}>{step.title}</ShimmerText>
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

export function GenerationTranscript({ taskKey, steps, active, introduction, finalMessage, children, onRetry }: {
  taskKey: string; steps: TranscriptStep[]; active: boolean; introduction: string; finalMessage: string;
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
        </div>
        {steps.map((step, index) => <Stage key={step.id ?? step.stage} step={step} active={index === current} canRetry={!active} onRetry={onRetry} />)}
        {active && steps.length === 0 && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" className="size-3.5" /><ShimmerText>等待任务开始，执行过程会在这里逐段显示。</ShimmerText></p>}
        {finalMessage && <p role="status" className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{finalMessage}</p>}
        {children}
      </div>
    </ScrollArea>
    {away && <Button size="sm" variant="secondary" className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full shadow-sm" onClick={returnToLatest}><ArrowDown className="size-3.5" />回到最新</Button>}
  </div>;
}
