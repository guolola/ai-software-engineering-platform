// Keeps code status and complete diagnostics available without an inline workspace banner.
import { useState } from "react";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import { formatCodeDiagnosticEntries, formatCodeDiagnosticSummary } from "../../../shared/lib/code-diagnostics";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { PageNoticeButton } from "../../../shared/ui/page-notice-button";

type CodeStatus = {
  tone: "success" | "destructive" | "warning" | "primary" | "muted";
  icon: LucideIcon;
  title: string;
  message: string;
};

export function CodeStatusDialog({ status, diagnostics }: {
  status: CodeStatus | null;
  diagnostics: WorkspaceRecord["codeDiagnostics"];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!status) return null;
  const entries = formatCodeDiagnosticEntries({ diagnostics }, Infinity);
  const diagnosticSummary = formatCodeDiagnosticSummary({ diagnostics });
  // Persisted generation diagnostics remain the button's subject while the
  // preview independently moves through its transient build states.
  const displayStatus = entries.length > 0 && status.tone !== "destructive"
    ? {
        tone: "warning" as const,
        icon: AlertTriangle,
        title: t("code.status.diagnostics.title"),
        message: t("code.status.diagnostics.message", { summary: diagnosticSummary }),
      }
    : status;
  const label = entries.length > 0
    ? t("code.actions.diagnostics", { count: entries.length })
    : displayStatus.title;
  return (
    <>
      <PageNoticeButton
        label={label}
        tone={displayStatus.tone === "primary" || displayStatus.tone === "muted" ? "info" : displayStatus.tone}
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{displayStatus.title}</DialogTitle>
            <DialogDescription className="break-words">{displayStatus.message}</DialogDescription>
          </DialogHeader>
          {entries.length > 0 && (
            <ol aria-label={t("code.actions.diagnostics", { count: entries.length })} className="list-decimal space-y-3 pl-5 text-sm leading-6">
              {entries.map((entry, index) => <li key={index} className="break-words whitespace-pre-wrap">{entry}</li>)}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
