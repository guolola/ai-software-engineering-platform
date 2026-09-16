// Renders generation result and confirmation dialogs used by the workspace session provider.
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import {
  FeedbackDialog,
  type FeedbackDialogAction,
  type FeedbackDialogState,
} from "../../../shared/ui/feedback-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { i18n } from "../../../shared/i18n/i18n";
import type { GenerationConfirmationSummary } from "../lib/generation-planning";

export type GenerationResultDialogState = {
  title: string;
  message: string;
  tone: "success" | "warning" | "destructive";
  runId?: string | null;
  requirementId?: string | null;
  ruleId?: string | null;
  stageLabel?: string;
  targetLabel?: string | null;
  primaryAction?: FeedbackDialogAction;
  secondaryAction?: FeedbackDialogAction;
  dismissLabel?: string;
  dedupeKey?: string;
  revision?: string | number | null;
};

export type GenerationConfirmationDialogState =
  GenerationConfirmationSummary & {
    resolve: (confirmed: boolean) => void;
  };

function sanitizeResultDialogCopy(text: string) {
  const cleaned = text
    .replace(/\bREQ-\d+\b/giu, i18n.t("generation.dialog.thisRequirement"))
    .replace(/\bR\d+\b/giu, i18n.t("generation.dialog.thisRule"))
    .replace(/\brun[-_a-z0-9]+\b/giu, i18n.t("generation.dialog.thisRun"))
    .replace(/\b(runId|requirementId|ruleId)\b/giu, "")
    .replace(/\.docx\b/giu, "")
    .replace(/\bAI\b/giu, i18n.t("generation.dialog.smartRepair"))
    .replace(/\s+/g, " ")
    .replace(/\s+([，。；：！？])/g, "$1")
    .replace(/[:：]\s*$/g, "")
    .trim();
  return cleaned || i18n.t("generation.dialog.technicalHidden");
}

function resultDialogMessage(result: GenerationResultDialogState) {
  if (result.tone === "destructive" && /[A-Za-z]/u.test(result.message)) {
    return i18n.t("generation.dialog.problem");
  }
  return sanitizeResultDialogCopy(result.message);
}

export function generationResultFeedback(
  result: GenerationResultDialogState,
): FeedbackDialogState {
  return {
    dedupeKey: result.dedupeKey ?? generationResultDialogGroup(result),
    revision: result.revision ?? result.runId ?? result.message,
    tone: result.tone,
    title: sanitizeResultDialogCopy(result.title),
    message: resultDialogMessage(result),
    primaryAction: result.primaryAction,
    secondaryAction: result.secondaryAction,
    dismissLabel: result.dismissLabel,
  };
}

export function completedRunResultMessage({
  qualityHintCount,
  diagramFailureCount,
}: {
  qualityHintCount: number;
  diagramFailureCount: number;
}) {
  const parts: string[] = [];
  if (diagramFailureCount > 0) {
    parts.push(
      i18n.t("generation.dialog.completedWithFailures", { count: diagramFailureCount }),
    );
  } else {
    parts.push(i18n.t("generation.dialog.completed"));
  }
  if (qualityHintCount > 0) {
    parts.push(i18n.t("generation.dialog.qualityHints", { count: qualityHintCount }));
  }
  return parts.join(" ");
}

export function generationResultDialogGroup(
  result: GenerationResultDialogState,
) {
  const tone = result.tone === "destructive" ? "failure" : "completion";
  const runKey = result.runId ? `run:${result.runId}` : "";
  const stageKey = sanitizeResultDialogCopy(
    result.stageLabel ?? result.title ?? i18n.t("generation.dialog.result"),
  );
  return `${tone}:${runKey || stageKey}`;
}

export function GenerationResultDialog({
  result,
  onClose,
}: {
  result: GenerationResultDialogState | null;
  onClose: () => void;
}) {
  return (
    <FeedbackDialog
      feedback={result ? generationResultFeedback(result) : null}
      open={Boolean(result)}
      onClose={onClose}
    />
  );
}

function SummaryGroup({ label, items }: { label: string; items: string[] }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <div className="rounded-[8px] border border-border bg-muted/40 p-3 text-left">
      <div className="text-[13px] font-medium text-foreground">{label}</div>
      <div className="mt-1 text-[13px] leading-5 text-muted-foreground">
        {items.join(t("generation.dialog.listSeparator"))}
      </div>
    </div>
  );
}

export function GenerationConfirmationDialog({
  confirmation,
  onCancel,
  onConfirm,
}: {
  confirmation: GenerationConfirmationDialogState | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  if (!confirmation) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-[12px] border-border/60 bg-card p-6 shadow-lg sm:max-w-[520px]">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-[20px] font-semibold leading-[28px] text-foreground">
            {confirmation.title}
          </DialogTitle>
          <DialogDescription className="text-[14px] leading-5 text-muted-foreground">
            {confirmation.description}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-3">
          <SummaryGroup
            label={t("generation.dialog.groups.rules")}
            items={confirmation.ruleDependencyLabels ?? []}
          />
          <SummaryGroup
            label={t("generation.dialog.groups.requirements")}
            items={confirmation.requirementDependencyLabels ?? []}
          />
          <SummaryGroup label={t("generation.dialog.groups.new")} items={confirmation.newLabels} />
          <SummaryGroup
            label={t("generation.dialog.groups.regenerated")}
            items={confirmation.regeneratedLabels}
          />
          <SummaryGroup
            label={t("generation.dialog.groups.designDependencies")}
            items={confirmation.dependencyLabels}
          />
          <SummaryGroup label={t("generation.dialog.groups.kept")} items={confirmation.keptLabels} />
          {(confirmation.ruleDependencyLabels?.length ?? 0) === 0 &&
            (confirmation.requirementDependencyLabels?.length ?? 0) === 0 &&
            confirmation.newLabels.length === 0 &&
            confirmation.regeneratedLabels.length === 0 &&
            confirmation.dependencyLabels.length === 0 && (
              <div className="rounded-[8px] border border-border bg-muted/40 p-3 text-left text-[13px] leading-5 text-muted-foreground">
                {t("generation.dialog.noModels")}
              </div>
            )}
        </div>
        <DialogFooter className="mt-6 flex-row justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-[8px] px-6 text-[14px] font-normal text-muted-foreground hover:bg-muted/60"
            onClick={onCancel}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="h-10 rounded-[8px] px-6 text-[14px] font-normal shadow-sm"
            onClick={onConfirm}
          >
            {t("generation.dialog.confirmGeneration")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
