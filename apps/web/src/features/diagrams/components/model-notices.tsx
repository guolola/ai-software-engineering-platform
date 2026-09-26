// Presents model notices in one disclosure and records acceptance of the current visual review.
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";

export interface ModelNotice {
  id: string;
  title: string;
  detail: string;
  issues?: string[];
  checks?: number;
  repairs?: number;
  reviewCheckedAt?: string;
  confirmed?: boolean;
}

export function ModelNotices({ notices, canConfirm, onConfirm }: {
  notices: ModelNotice[];
  canConfirm: boolean;
  onConfirm: (checkedAt: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (notices.length === 0) return null;

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

  return <>
    <Button type="button" variant="outline" size="sm" className="w-auto shrink-0" aria-label={`提示（${notices.length}）`} onClick={() => setOpen(true)}>
      <AlertTriangle aria-hidden="true" className="size-4 text-warning" />提示（{notices.length}）
    </Button>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>模型提示</DialogTitle>
          <DialogDescription>查看当前模型和图形的状态。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {notices.map((notice) => <section key={notice.id} className="space-y-2 rounded-md border border-border p-3 text-sm" aria-label={notice.title}>
            <h3 className="font-medium text-foreground">{notice.title}</h3>
            {notice.issues?.length ? <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{notice.issues.map((issue, index) => <li key={`${index}:${issue}`}>{issue}</li>)}</ul>
              : <p className="whitespace-pre-wrap break-words text-muted-foreground">{notice.detail}</p>}
            {notice.checks !== undefined && <p className="text-xs text-muted-foreground">已检查 {notice.checks} 次；{notice.repairs === undefined ? "自动修复次数未记录" : `已尝试自动修复 ${notice.repairs} 次`}</p>}
            {notice.confirmed && <p className="text-xs text-success">已人工确认当前图</p>}
            {notice.reviewCheckedAt && !notice.confirmed && <Button type="button" size="sm" disabled={busy || !canConfirm} onClick={() => void confirm(notice.reviewCheckedAt!)}>确认当前图</Button>}
            {notice.reviewCheckedAt && !notice.confirmed && !canConfirm && <p className="text-xs text-muted-foreground">当前没有确认视觉检查的权限。</p>}
          </section>)}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>知道了</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
