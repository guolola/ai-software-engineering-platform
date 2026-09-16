// Owns billing entitlement blocker state and result dialog copy for generation actions.
import { useCallback, useRef, useState } from "react";
import type { BillingEntitlementErrorResponse } from "@uml-platform/contracts";
import type { GenerationResultDialogState } from "../components/generation-dialogs";
import {
  billingEntitlementDialogTitle,
} from "./billing-entitlement";
import { i18n } from "../../../shared/i18n/i18n";
import { navigateAppPath } from "../../../shared/lib/app-navigation";

export function useBillingGenerationBlock(
  openGenerationResultDialog: (state: GenerationResultDialogState) => void,
) {
  const [billingGenerationBlock, setBillingGenerationBlock] =
    useState<BillingEntitlementErrorResponse | null>(null);
  const occurrenceRef = useRef(0);

  const clearBillingGenerationBlock = useCallback(() => {
    setBillingGenerationBlock(null);
  }, []);

  const openBillingEntitlementDialog = useCallback(
    (
      block: BillingEntitlementErrorResponse,
      input: { runId?: string | null; stageLabel: string },
    ) => {
      occurrenceRef.current += 1;
      setBillingGenerationBlock(block);
      openGenerationResultDialog({
        title: billingEntitlementDialogTitle(block),
        tone: block.reason === "negative_balance" ? "destructive" : "warning",
        message: block.message,
        runId: input.runId,
        stageLabel: input.stageLabel,
        targetLabel: "生成权益",
        dedupeKey: `billing-generation:${block.reason}`,
        revision: input.runId ?? occurrenceRef.current,
        primaryAction: {
          label: i18n.t("feedback.actions.billing"),
          onSelect: () => navigateAppPath("/account/billing"),
        },
      });
    },
    [openGenerationResultDialog],
  );

  return {
    billingGenerationBlock,
    clearBillingGenerationBlock,
    openBillingEntitlementDialog,
  };
}
