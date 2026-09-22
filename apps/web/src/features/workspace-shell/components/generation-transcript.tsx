// Displays one execution as borderless prose and compact expandable calls, with reader-controlled following.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Bot, Check, ChevronDown, Circle, X } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Spinner } from "../../../shared/ui/spinner";
import { ShimmerText } from "../../../shared/ui/shimmer-text";
import { cn } from "../../../shared/ui/utils";
import type { TranscriptCall, TranscriptStep } from "../lib/generation-transcript";
import { readableOutput } from "../lib/generation-transcript";

const statusText: Record<TranscriptCall["status"], string> = {
  queued: "排队中", running: "正在执行", completed: "已完成", failed: "未完成", cancelled: "已停止", pending_review: "待确认",
};

function CallLine({ call, now, retry }: { call: TranscriptCall; now: number; retry?: () => void }) {
  const [open, setOpen] = useState(false);
  const running = call.status === "running";
  const start = Date.parse(call.startedAt ?? "");
  const end = call.finishedAt ? Date.parse(call.finishedAt) : running ? now : NaN;
  const duration = Number.isFinite(start) && Number.isFinite(end) ? `${Math.max(0, Math.floor((end - start) / 1000))} 秒` : null;
  const Icon = call.status === "completed" ? Check : call.status === "failed" ? X : Circle;
  const prose = readableOutput(call);
  return (
    <div className="min-w-0" data-slot="generation-call">
      <Button type="button" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)} className="h-auto w-full min-w-0 justify-start gap-2 rounded-none border-0 bg-transparent px-0 py-1.5 text-left text-sm font-normal whitespace-normal text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground">
        {running ? <Spinner aria-hidden="true" className="size-3.5" /> : <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", call.status === "completed" && "text-success", call.status === "failed" && "text-destructive")} />}
        <ShimmerText active={running}>{call.title}</ShimmerText>
        <span className="ml-auto shrink-0 text-xs">{call.thinking && running ? "正在分析" : statusText[call.status]}{duration ? ` · ${duration}` : ""}</span>
        <ChevronDown aria-hidden="true" className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")} />
      </Button>
      {prose && <p className="ml-5 pb-2 whitespace-pre-wrap break-words text-sm leading-7">{prose}</p>}
      {call.summary && <details open={running && call.thinking} className="ml-5 pb-2 text-sm text-muted-foreground"><summary className="cursor-pointer text-xs">思考摘要</summary><p className="mt-2 whitespace-pre-wrap break-words leading-7">{call.summary}</p></details>}
      {open && (
        <div className="ml-5 space-y-3 pb-3 pt-1 text-sm leading-7 text-muted-foreground">
          {call.message && <p className="break-words">{call.message}</p>}
          {call.output ? call.technical ? (
            <details><summary className="cursor-pointer text-xs">查看生成内容</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-6">{call.output}</pre></details>
          ) : null : !call.message && !call.summary && <p>{running ? "正在处理，收到内容后会继续显示。" : statusText[call.status]}</p>}
        </div>
      )}
      {(call.status === "failed" || call.status === "pending_review") && (
        <div className={cn("ml-5 py-1 text-xs leading-6", call.status === "failed" ? "text-destructive" : "text-warning")}>
          {call.message || (call.status === "failed" ? "本次处理未完成。" : "有追踪关系需要确认。")}
          {retry && <Button size="sm" variant="link" className="h-auto py-0" title={call.subtaskId?.includes(":") ? "当前重试按模型类型执行，会重试同类模型而不是单个实例" : "重试此模型"} onClick={retry}>{call.subtaskId?.includes(":") ? "重试全部同类模型" : "重试此模型"}</Button>}
        </div>
      )}
    </div>
  );
}

export function GenerationTranscript({ taskKey, steps, active, introduction, finalMessage, children, onRetry }: {
  taskKey: string;
  steps: TranscriptStep[];
  active: boolean;
  introduction: string;
  finalMessage: string;
  children?: ReactNode;
  onRetry?: (id: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [away, setAway] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => { following.current = true; setAway(false); }, [taskKey]);
  useEffect(() => {
    if (following.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [steps, finalMessage]);
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-testid="generation-transcript">
      <div ref={viewport} data-slot="ai-conversation" className="max-h-[calc(100dvh-11rem)] min-h-0 min-w-0 flex-1 space-y-7 overflow-y-auto overscroll-contain pr-2 pb-8 text-sm leading-7" onScroll={() => {
        const element = viewport.current;
        if (!element) return;
        following.current = element.scrollHeight - element.clientHeight - element.scrollTop < 48;
        setAway(!following.current);
      }}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-medium"><Bot className="size-4 text-muted-foreground" aria-hidden="true" />Agent</div>
          <p className="text-foreground">{introduction}</p>
        </div>
        {steps.map((step) => (
          <section key={step.stage} aria-label={step.title} className="min-w-0 space-y-2" data-testid="generation-task-step">
            <h3 className="text-xs font-medium text-muted-foreground">{step.title}</h3>
            {(step.entries ?? [...step.messages.map((text) => ({ kind: "message" as const, text })), ...step.calls.map((call) => ({ kind: "call" as const, id: call.id }))]).map((entry, index) => {
              if (entry.kind === "message") return <p className="whitespace-pre-wrap break-words" key={`message:${index}`}>{entry.text}</p>;
              const call = step.calls.find((item) => item.id === entry.id);
              return call ? <CallLine key={call.id} call={call} now={now} retry={!active && call.status === "failed" && call.subtaskId && onRetry ? () => onRetry(call.subtaskId!) : undefined} /> : null;
            })}
          </section>
        ))}
        {active && steps.length === 0 && <p role="status" className="flex items-center gap-2 text-muted-foreground"><Spinner aria-hidden="true" className="size-3.5" /><ShimmerText>等待任务开始，执行过程会在这里逐段显示。</ShimmerText></p>}
        {finalMessage && <p role="status" className="whitespace-pre-wrap break-words">{finalMessage}</p>}
        {children}
      </div>
      {away && <Button size="sm" variant="secondary" className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full" onClick={() => {
        following.current = true; setAway(false);
        if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
      }}><ArrowDown className="size-3.5" />回到最新</Button>}
    </div>
  );
}
