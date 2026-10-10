// Shows model freshness, visual review, and the next action as a compact status flow.
import { useState } from "react";
import type { DiagramVisualReview } from "@uml-platform/contracts";
import { DiagramReviewDetails } from "../../../entities/diagram/components/diagram-review-details";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { PageNoticeButton, type PageNoticeTone } from "../../../shared/ui/page-notice-button";
import { StatusFlow, StatusFlowItem } from "../../../shared/ui/status-flow";
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
  confirmed?: boolean;
  review?: DiagramVisualReview;
}

export function ModelNotices({ notices }: {
  notices: ModelNotice[];
}) {
  const [open, setOpen] = useState(false);
  if (notices.length === 0) return null;

  const freshness = notices.find((notice) => notice.kind === "freshness");
  const visual = notices.find((notice) => notice.kind === "visual");
  const otherNotices = notices.filter((notice) => notice.kind !== "freshness" && notice.kind !== "visual");
  const hasFailure = otherNotices.some((notice) => notice.tone === "destructive");
  const actionTone: ModelNotice["tone"] = hasFailure ? "destructive" : freshness ? "warning" : "success";
  // Always render the same three stages; missing notices become positive or neutral states.
  const stages: ModelNotice[] = [
    freshness ?? { id: "current", kind: "freshness", tone: "success", title: "模型当前有效", detail: "上游内容未标记为过期。" },
    visual ?? { id: "unchecked", kind: "visual", tone: "info", title: "视觉检查", detail: "当前没有视觉检查结果。" },
    {
      id: "action", kind: "info", tone: actionTone, title: "下一步",
      detail: hasFailure ? "查看下方错误并重试相关操作。"
          : freshness ? "更新模型后再次检查图形。" : "当前没有需要处理的操作。",
    },
  ];

  const buttonTone: PageNoticeTone = hasFailure ? "destructive"
    : notices.some((notice) => notice.tone === "warning") ? "warning" : "info";

  return <>
    <PageNoticeButton label={`提示（${notices.length}）`} tone={buttonTone} onClick={() => setOpen(true)} />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>模型提示</DialogTitle>
          <DialogDescription>查看当前模型和图形的状态。</DialogDescription>
        </DialogHeader>
        <StatusFlow aria-label="模型状态流程">
          {stages.map((stage) => (
            <StatusFlowItem key={stage.id} title={stage.title} tone={stage.tone} data-notice-stage={stage.id}>
              {stage.kind === "visual" && (stage.review || stage.checks !== undefined) ? <DiagramReviewDetails summaryOnly confirmed={stage.confirmed} review={stage.review ?? {
                status: "pending_review", reason: stage.detail, issues: stage.issues ?? [], attempts: stage.checks ?? 0,
                repairAttempts: stage.repairs, checkedAt: "",
              }} /> : <p className="mt-1 whitespace-pre-wrap break-words text-sm text-black dark:text-foreground">{stage.detail}</p>}
            </StatusFlowItem>
          ))}
        </StatusFlow>
        {otherNotices.length > 0 ? <ul className="divide-y border-t text-sm">{otherNotices.map((notice) => <li key={notice.id} className="py-3"><strong className={cn("font-medium", notice.tone === "destructive" ? "text-destructive" : notice.tone === "warning" ? "text-warning" : "text-info")}>{notice.title}</strong><p className="mt-1 text-muted-foreground">{notice.detail}</p></li>)}</ul> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>知道了</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
