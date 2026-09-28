// Shows model freshness, visual review, and the next action as a compact status flow.
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { PageNoticeButton, type PageNoticeTone } from "../../../shared/ui/page-notice-button";
import { cn } from "../../../shared/ui/utils";

export interface ModelNotice {
  id: string;
  kind: "freshness" | "visual" | "error" | "info";
  tone: "warning" | "success" | "destructive" | "info";
  title: string;
  detail: string;
  issues?: string[];
  checks?: number;
  repairs?: number;
  reviewCheckedAt?: string;
  confirmed?: boolean;
}

const tonePresentation = {
  warning: { icon: AlertTriangle, className: "bg-warning/10 text-warning" },
  success: { icon: CheckCircle2, className: "bg-success/10 text-success" },
  destructive: { icon: XCircle, className: "bg-destructive/10 text-destructive" },
  info: { icon: Info, className: "bg-info/10 text-info" },
} as const;

export function ModelNotices({ notices, canConfirm, onConfirm }: {
  notices: ModelNotice[];
  canConfirm: boolean;
  onConfirm: (checkedAt: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (notices.length === 0) return null;

  const freshness = notices.find((notice) => notice.kind === "freshness");
  const visual = notices.find((notice) => notice.kind === "visual");
  const otherNotices = notices.filter((notice) => notice.kind !== "freshness" && notice.kind !== "visual");
  const hasFailure = otherNotices.some((notice) => notice.tone === "destructive");
  const actionTone: ModelNotice["tone"] = visual?.reviewCheckedAt && !visual.confirmed
    ? "warning" : hasFailure ? "destructive" : freshness ? "warning" : "success";
  // Always render the same three stages; missing notices become positive or neutral states.
  const stages: ModelNotice[] = [
    freshness ?? { id: "current", kind: "freshness", tone: "success", title: "模型当前有效", detail: "上游内容未标记为过期。" },
    visual ?? { id: "unchecked", kind: "visual", tone: "info", title: "视觉检查", detail: "当前没有视觉检查结果。" },
    {
      id: "action", kind: "info", tone: actionTone, title: "下一步",
      detail: visual?.reviewCheckedAt && !visual.confirmed
        ? canConfirm ? "确认当前图的视觉检查结果。" : "当前没有确认视觉检查的权限。"
        : hasFailure ? "查看下方错误并重试相关操作。"
          : freshness ? "更新模型后再次检查图形。" : "当前没有需要处理的操作。",
    },
  ];

  const confirm = async (checkedAt: string) => {
    if (busy || !canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(checkedAt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "确认未保存，请重试。");
    } finally {
      setBusy(false);
    }
  };

  const buttonTone: PageNoticeTone = hasFailure ? "destructive"
    : notices.some((notice) => notice.tone === "warning") ? "warning" : "info";

  return <>
    <PageNoticeButton label={`提示（${notices.length}）`} tone={buttonTone} onClick={() => setOpen(true)} />
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>模型提示</DialogTitle>
          <DialogDescription>查看当前模型和图形的状态。</DialogDescription>
        </DialogHeader>
        <ol className="relative ml-3 border-l border-border" aria-label="模型状态流程">
          {stages.map((stage) => {
            const { icon: Icon, className } = tonePresentation[stage.tone];
            return <li key={stage.id} className="relative pb-5 pl-6 last:pb-0" data-notice-stage={stage.id}>
              <span className={cn("absolute -left-3.5 top-0 flex size-7 items-center justify-center rounded-full", className)} aria-hidden="true"><Icon className="size-4" /></span>
              <h3 className="font-medium text-foreground">{stage.title}</h3>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{stage.detail}</p>
              {stage.issues?.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{stage.issues.map((issue, index) => <li key={`${index}:${issue}`}>{issue}</li>)}</ul> : null}
              {stage.checks !== undefined ? <p className="mt-2 text-xs text-muted-foreground">已检查 {stage.checks} 次；{stage.repairs === undefined ? "自动修复次数未记录" : `已尝试自动修复 ${stage.repairs} 次`}</p> : null}
              {stage.reviewCheckedAt && !stage.confirmed ? <Button type="button" size="sm" className="mt-2" disabled={busy || !canConfirm} onClick={() => void confirm(stage.reviewCheckedAt!)}>确认当前图</Button> : null}
            </li>;
          })}
        </ol>
        {otherNotices.length > 0 ? <ul className="divide-y border-t text-sm">{otherNotices.map((notice) => <li key={notice.id} className="py-3"><strong className={cn("font-medium", notice.tone === "destructive" ? "text-destructive" : notice.tone === "warning" ? "text-warning" : "text-info")}>{notice.title}</strong><p className="mt-1 text-muted-foreground">{notice.detail}</p></li>)}</ul> : null}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>知道了</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
