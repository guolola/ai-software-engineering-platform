// Renders billing and payment UI for public pricing and authenticated account pages.
import { Alert } from '../../../shared/ui/alert';
import { Card } from "../../../shared/ui/card";
import { Table } from '../../../shared/ui/table';
import { TableCell } from '../../../shared/ui/table';
import { TableBody } from '../../../shared/ui/table';
import { TableHead } from '../../../shared/ui/table';
import { TableRow } from '../../../shared/ui/table';
import { TableHeader } from '../../../shared/ui/table';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import type {
  BillingOrderStatusDto,
  BillingSkuDto,
  BillingSummary,
  PaymentChannel,
} from "@uml-platform/contracts";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { cn } from "../../../shared/ui/utils";
import { PageContainer } from "../../../shared/template/layout/page";
import { useAppI18n } from "../../../shared/i18n";
import { billingApi } from "../services/billing-api";
import { toast } from "sonner";

type Navigate = (path: string) => void;

function formatCny(amountCents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CNY",
  }).format(amountCents / 100);
}

function formatDate(value: string | null, locale: string, t: TFunction) {
  if (!value) return t("billing.date.inactive");
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function skuMetric(sku: BillingSkuDto, t: TFunction) {
  return t("billing.units.credits", { count: sku.creditAmount ?? 0 });
}

const localizedSkuCodes = new Set(["credits_10", "credits_50", "credits_100", "credits_500"]);

function skuCopy(sku: BillingSkuDto, field: "name" | "description", t: TFunction) {
  return localizedSkuCodes.has(sku.code)
    ? t(`billing.sku.catalog.${sku.code}.${field}`)
    : sku[field];
}

function skuFeatures(sku: BillingSkuDto, t: TFunction) {
  return [
    t("billing.sku.features.creditArrival", { metric: skuMetric(sku, t) }),
    t("billing.sku.features.noExpiry"),
    t("billing.sku.features.bonusIncluded"),
  ];
}

function isRecommendedSku(sku: BillingSkuDto) {
  return sku.code === "credits_100";
}

function channelLabel(channel: PaymentChannel, t: TFunction) {
  return channel === "alipay" ? t("billing.payment.channels.alipay") : channel;
}

function AlipayIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      data-testid="alipay-icon"
      viewBox="0 0 16 16"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Bootstrap Icons Alipay mark, embedded locally to keep checkout independent of a CDN. */}
      <path d="M2.541 0H13.5a2.55 2.55 0 0 1 2.54 2.563v8.297c-.006 0-.531-.046-2.978-.813-.412-.14-.916-.327-1.479-.536q-.456-.17-.957-.353a13 13 0 0 0 1.325-3.373H8.822V4.649h3.831v-.634h-3.83V2.121H7.26c-.274 0-.274.273-.274.273v1.621H3.11v.634h3.875v1.136h-3.2v.634H9.99c-.227.789-.532 1.53-.894 2.202-2.013-.67-4.161-1.212-5.51-.878-.864.214-1.42.597-1.746.998-1.499 1.84-.424 4.633 2.741 4.633 1.872 0 3.675-1.053 5.072-2.787 2.08 1.008 6.37 2.738 6.387 2.745v.105A2.55 2.55 0 0 1 13.5 16H2.541A2.55 2.55 0 0 1 0 13.437V2.563A2.55 2.55 0 0 1 2.541 0" />
      <path d="M2.309 9.27c-1.22 1.073-.49 3.034 1.978 3.034 1.434 0 2.868-.925 3.994-2.406-1.602-.789-2.959-1.353-4.425-1.207-.397.04-1.14.217-1.547.58Z" />
    </svg>
  );
}

function orderStatusLabel(status: BillingOrderStatusDto["status"], t: TFunction) {
  return t(`billing.order.status.${status}`);
}

function orderStatusBadgeVariant(status: BillingOrderStatusDto["status"]) {
  if (status === "paid") return "success";
  if (status === "pending") return "info";
  if (status === "refund_pending") return "warning";
  if (status === "refunded") return "secondary";
  return "destructive";
}

function storageKey(orderId: string) {
  return `uml-alipay-form:${orderId}`;
}

function orderIsPayable(order: BillingOrderStatusDto) {
  return order.status === "pending" && new Date(order.expiresAt).getTime() > Date.now();
}

const paymentPrimaryButtonClass =
  "h-11 px-5 font-display text-sm leading-6";

const paymentSecondaryButtonClass =
  "h-11 px-5 font-display text-sm leading-6";

function useBillingSkus(t: TFunction) {
  const [skus, setSkus] = useState<BillingSkuDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    billingApi
      .listSkus()
      .then((response) => {
        if (!active) return;
        setSkus(response.skus);
        setError("");
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : t("billing.errors.skusLoadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  return { skus, loading, error };
}

function PaymentMethodCard({
  channel,
  active,
  onSelect,
  t,
}: {
  channel: PaymentChannel;
  active: boolean;
  onSelect: (channel: PaymentChannel) => void;
  t: TFunction;
}) {
  return (
    <Button
      variant="outline"
      type="button"
      role="radio"
      data-testid="payment-method-card"
      aria-checked={active}
      tabIndex={active ? 0 : -1}
      onClick={() => onSelect(channel)}
      className={cn(
        "grid h-auto w-full shrink cursor-pointer gap-0 whitespace-normal border p-4 text-left transition-colors duration-200 motion-reduce:transition-none",
        active
          ? "border-primary bg-primary/5 hover:border-primary hover:bg-primary/10"
          : "border-border bg-background hover:border-primary/60 hover:bg-muted/60",
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-display text-sm font-semibold leading-6 text-foreground">
          <span
            className={cn(
              "grid size-9 place-items-center rounded-lg",
              "bg-[#1677ff]/10 text-[#1677ff] dark:bg-[#1677ff]/20",
            )}
          >
            <AlipayIcon className="size-5" />
          </span>
          {channelLabel(channel, t)}
        </span>
        <span
          className={cn(
            "grid size-5 place-items-center rounded-full border",
            active ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent",
          )}
        >
          <Check className="size-3" />
        </span>
      </span>
      <span className="mt-2 text-sm leading-5 text-muted-foreground">
        {t("billing.payment.alipayDesktop")}
      </span>
    </Button>
  );
}

function PaymentConfirmDialog({
  sku,
  open,
  creating,
  error,
  channel,
  locale,
  t,
  onChannelChange,
  onOpenChange,
  onConfirm,
}: {
  sku: BillingSkuDto | null;
  open: boolean;
  creating: boolean;
  error: string;
  channel: PaymentChannel;
  locale: string;
  t: TFunction;
  onChannelChange: (channel: PaymentChannel) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="payment-confirm-dialog"
        overlayClassName="bg-foreground/40 "
        className="overflow-hidden rounded-xl border-border bg-card p-0 shadow-xl sm:max-w-[440px]"
      >
        <div className="w-full min-w-0">
          <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-left">
            <DialogTitle className="font-display text-xl font-semibold leading-7 text-foreground">
              {t("billing.payment.confirmTitle")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-5 text-muted-foreground">
              {t("billing.payment.confirmDescription")}
            </DialogDescription>
          </DialogHeader>
          {sku && (
            <div className="grid gap-4 px-6 py-5">
              <section className="rounded-xl border border-border bg-muted/30 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium leading-5 text-muted-foreground">
                      {t("billing.payment.purchaseContent")}
                    </div>
                    <div className="mt-1 font-display text-base font-semibold leading-6 text-foreground">
                      {skuCopy(sku, "name", t)}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {skuCopy(sku, "description", t)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {skuMetric(sku, t)}
                  </Badge>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <span className="text-xs leading-5 text-muted-foreground">
                    {t("billing.payment.orderAmount")}
                  </span>
                  <span className="font-display text-3xl font-bold leading-9 tracking-normal text-primary">
                    {formatCny(sku.amountCents, locale)}
                  </span>
                </div>
              </section>
              <div
                role="radiogroup"
                aria-label={t("billing.payment.methodLabel")}
                className="grid gap-3"
              >
                <PaymentMethodCard
                  channel="alipay"
                  active={channel === "alipay"}
                  onSelect={onChannelChange}
                  t={t}
                />
              </div>
              {error && (
                <Alert variant="destructive" className="border px-3 py-2 text-sm">
                  {error}
                </Alert>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              className="px-0 text-sm"
              onClick={() => onOpenChange(false)}
            >
              {t("billing.actions.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!sku || creating}
              className={paymentPrimaryButtonClass}
              onClick={onConfirm}
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <WalletCards className="size-4" />}
              {creating ? t("billing.actions.creatingOrder") : t("billing.actions.payNow")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BillingSkuGrid({
  skus,
  loading,
  error,
  signedIn,
  onNavigate,
  onSelect,
  locale,
  t,
  variant = "pricing",
}: {
  skus: BillingSkuDto[];
  loading: boolean;
  error: string;
  signedIn: boolean;
  onNavigate: Navigate;
  onSelect: (sku: BillingSkuDto) => void;
  locale: string;
  t: TFunction;
  variant?: "pricing" | "account";
}) {
  const creditSkus = useMemo(() => skus, [skus]);
  if (loading) {
    return (
      <Card className="gap-0 py-0 p-6 text-sm leading-6 text-muted-foreground">
        {t("billing.loading.skus")}
      </Card>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" className="border p-6 text-sm leading-6">
        {error}
      </Alert>
    );
  }
  const groupDefs = [
    {
      key: "credits",
      title: t("billing.sku.groups.credits.title"),
      subtitle: t("billing.sku.groups.credits.subtitle"),
      items: creditSkus,
    },
  ];
  return (
    <div data-testid="billing-sku-grid" className={cn("grid", variant === "pricing" ? "gap-10" : "gap-6")}>
      {groupDefs.map((group) => (
        <section
          key={group.key}
          data-testid={`billing-sku-group-${group.key}`}
          className={cn("grid", variant === "pricing" ? "gap-5" : "gap-4")}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="h-6 w-1 rounded-full bg-primary" />
              <h2 className="font-display text-2xl font-semibold leading-8 tracking-normal text-foreground">
                {group.title}
              </h2>
              <Badge variant="secondary">
                {group.subtitle}
              </Badge>
            </div>
          </div>
          <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {group.items.map((sku) => (
              <BillingSkuCard
                key={sku.code}
                sku={sku}
                signedIn={signedIn}
                variant={variant}
                recommended={isRecommendedSku(sku)}
                onNavigate={onNavigate}
                onSelect={onSelect}
                locale={locale}
                t={t}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function BillingSkuCard({
  sku,
  signedIn,
  variant,
  recommended,
  onNavigate,
  onSelect,
  locale,
  t,
}: {
  sku: BillingSkuDto;
  signedIn: boolean;
  variant: "pricing" | "account";
  recommended: boolean;
  onNavigate: Navigate;
  onSelect: (sku: BillingSkuDto) => void;
  locale: string;
  t: TFunction;
}) {
  const actionLabel = signedIn ? t("billing.actions.buyNow") : t("billing.actions.loginToBuy");
  return (
    <Card as="article"
      data-testid={recommended ? "billing-recommended-sku" : "billing-sku-card"}
      className={cn(
        "gap-0 py-0 relative grid overflow-hidden text-left",
        variant === "pricing" ? "gap-0 py-0 min-h-[255px] gap-4 p-6" : "gap-0 py-0 min-h-[230px] gap-3 p-5",
        recommended
          ? "gap-0 py-0 border-primary ring-1 ring-primary"
          : "gap-0 py-0 hover:border-primary/60",
      )}
    >
      {recommended && (
        <span className="absolute right-5 top-0 rounded-b-lg bg-primary px-3 py-1 text-xs font-semibold leading-4 text-primary-foreground">
          {t("billing.sku.recommended")}
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-semibold leading-7 tracking-normal text-foreground">
            {skuCopy(sku, "name", t)}
          </h3>
          <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">
            {skuCopy(sku, "description", t)}
          </p>
        </div>
        <Badge
          className="px-2.5 py-1 text-xs"
          variant="secondary"
        >
          {skuMetric(sku, t)}
        </Badge>
      </div>
      <ul className="grid gap-1.5 text-xs leading-5 text-muted-foreground">
        {skuFeatures(sku, t).map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <div className="font-display text-3xl font-bold leading-9 tracking-normal text-foreground">
          {formatCny(sku.amountCents, locale)}
        </div>
      </div>
      <Button
        type="button"
        variant={recommended ? "default" : "secondary"}
        className={cn(
          "mt-1 w-full",
          recommended ? paymentPrimaryButtonClass : paymentSecondaryButtonClass,
        )}
        onClick={() => {
          if (!signedIn) {
            onNavigate("/login");
            return;
          }
          onSelect(sku);
        }}
      >
        <WalletCards className="size-4" />
        {actionLabel}
      </Button>
    </Card>
  );
}

function creditPackArtworkClass(sku: BillingSkuDto) {
  if (sku.code === "credits_10") return "border-primary/25 bg-primary text-primary-foreground";
  if (sku.code === "credits_50") return "border-border bg-secondary text-secondary-foreground";
  if (sku.code === "credits_100") return "border-foreground/20 bg-foreground text-background";
  return "border-primary/20 bg-accent text-accent-foreground";
}

function CreditPackArtwork({
  sku,
  locale,
  t,
  compact = false,
}: {
  sku: BillingSkuDto;
  locale: string;
  t: TFunction;
  compact?: boolean;
}) {
  return (
    <div
      data-testid={compact ? undefined : "billing-account-sku-artwork"}
      role={compact ? undefined : "img"}
      aria-hidden={compact || undefined}
      aria-label={
        compact
          ? undefined
          : t("billing.sku.selector.artworkLabel", {
              name: skuCopy(sku, "name", t),
              metric: skuMetric(sku, t),
              price: formatCny(sku.amountCents, locale),
            })
      }
      className={cn(
        "relative isolate aspect-[16/10] w-full overflow-hidden rounded-lg border",
        creditPackArtworkClass(sku),
      )}
    >
      <span
        aria-hidden="true"
        className="absolute -right-[12%] -top-[24%] size-[62%] rounded-full border-[1.5rem] border-current opacity-10"
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-[30%] -left-[8%] size-[56%] rounded-full bg-current opacity-[0.08]"
      />
      <div className={cn("relative z-10 flex h-full flex-col justify-between", compact ? "p-2.5" : "p-5 sm:p-6")}>
        <div className="flex items-start justify-between gap-2">
          <span className={cn("font-display font-semibold tracking-wide", compact ? "text-[9px]" : "text-xs")}>
            UML LAB
          </span>
          {!compact && isRecommendedSku(sku) && (
            <span className="rounded-full border border-current/25 px-2 py-0.5 text-[10px] font-medium">
              {t("billing.sku.recommended")}
            </span>
          )}
        </div>
        <div>
          <div className={cn("font-display font-bold tracking-tight", compact ? "text-sm" : "text-3xl sm:text-4xl")}>
            {skuMetric(sku, t)}
          </div>
          {!compact && (
            <div className="mt-1 text-xs font-medium opacity-75">
              {t("billing.sku.selector.artworkEyebrow")}
            </div>
          )}
        </div>
        <div className={cn("flex items-end justify-between gap-2 font-medium", compact ? "text-[8px]" : "text-xs")}>
          <span>{skuCopy(sku, "name", t)}</span>
          <span>{formatCny(sku.amountCents, locale)}</span>
        </div>
      </div>
    </div>
  );
}

function AccountCreditPackSelector({
  skus,
  loading,
  error,
  channel,
  creating,
  purchaseError,
  onChannelChange,
  onPurchase,
  locale,
  t,
}: {
  skus: BillingSkuDto[];
  loading: boolean;
  error: string;
  channel: PaymentChannel;
  creating: boolean;
  purchaseError: string;
  onChannelChange: (channel: PaymentChannel) => void;
  onPurchase: (sku: BillingSkuDto) => void;
  locale: string;
  t: TFunction;
}) {
  const orderedSkus = useMemo(
    () => [...skus].sort((left, right) => left.sortOrder - right.sortOrder),
    [skus],
  );
  const [selectedCode, setSelectedCode] = useState("credits_100");
  const selectedIndex = Math.max(0, orderedSkus.findIndex((sku) => sku.code === selectedCode));
  const selectedSku = orderedSkus[selectedIndex] ?? null;

  if (loading) {
    return (
      <Card className="gap-0 p-6 text-sm leading-6 text-muted-foreground">
        {t("billing.loading.skus")}
      </Card>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" className="border p-6 text-sm leading-6">
        {error}
      </Alert>
    );
  }
  if (!selectedSku) {
    return (
      <Card className="gap-0 border-dashed p-6 text-sm leading-6 text-muted-foreground">
        {t("billing.sku.selector.empty")}
      </Card>
    );
  }

  const selectAtIndex = (index: number) => {
    const nextSku = orderedSkus[index];
    if (nextSku) setSelectedCode(nextSku.code);
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % orderedSkus.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + orderedSkus.length) % orderedSkus.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = orderedSkus.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    selectAtIndex(nextIndex);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      .item(nextIndex)
      .focus();
  };

  return (
    <Card
      as="section"
      data-testid="billing-account-sku-selector"
      className="gap-0 p-5 sm:p-6"
    >
      <div className="grid min-w-0 gap-6 lg:grid-cols-2 lg:gap-8">
        <div className="min-w-0 space-y-2.5">
          <CreditPackArtwork sku={selectedSku} locale={locale} t={t} />
          <div
            className="grid grid-cols-4 gap-2"
            role="group"
            aria-label={t("billing.sku.selector.previewGroupLabel")}
          >
            {orderedSkus.map((sku) => {
              const selected = sku.code === selectedSku.code;
              return (
                <Button
                  key={sku.code}
                  type="button"
                  variant="outline"
                  aria-pressed={selected}
                  aria-label={t("billing.sku.selector.previewLabel", {
                    name: skuCopy(sku, "name", t),
                  })}
                  onClick={() => setSelectedCode(sku.code)}
                  className={cn(
                    "cursor-pointer overflow-hidden rounded-md border bg-background p-1 text-left transition-colors duration-200 outline-none motion-reduce:transition-none",
                    "hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selected ? "border-primary ring-1 ring-primary" : "border-border",
                  )}
                >
                  <CreditPackArtwork sku={sku} locale={locale} t={t} compact />
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div aria-live="polite" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-2xl font-semibold leading-8 text-foreground">
                {skuCopy(selectedSku, "name", t)}
              </h3>
              {isRecommendedSku(selectedSku) && (
                <Badge variant="secondary">{t("billing.sku.recommended")}</Badge>
              )}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {skuCopy(selectedSku, "description", t)}
            </p>
            <ul className="grid gap-2 text-sm leading-5 text-muted-foreground">
              {skuFeatures(selectedSku, t).map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2.5">
            <div className="text-sm font-medium text-foreground">
              {t("billing.sku.selector.groupLabel")}
            </div>
            <div
              role="radiogroup"
              aria-label={t("billing.sku.selector.groupLabel")}
              className="grid grid-cols-2 gap-2 xl:grid-cols-4"
            >
              {orderedSkus.map((sku, index) => {
                const selected = sku.code === selectedSku.code;
                return (
                  <Button
                    key={sku.code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    variant={selected ? "default" : "secondary"}
                    className="h-auto min-w-0 cursor-pointer flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors duration-200 motion-reduce:transition-none"
                    onClick={() => setSelectedCode(sku.code)}
                    onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  >
                    <span className="w-full truncate text-xs font-semibold">
                      {skuCopy(sku, "name", t)}
                    </span>
                    <span className="text-[11px] opacity-75">
                      {formatCny(sku.amountCents, locale)}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="text-sm font-medium text-foreground">
              {t("billing.payment.methodLabel")}
            </div>
            <div
              role="radiogroup"
              aria-label={t("billing.payment.methodLabel")}
              className="grid"
            >
              <PaymentMethodCard
                channel="alipay"
                active={channel === "alipay"}
                onSelect={onChannelChange}
                t={t}
              />
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-5">
            <div className="flex items-end justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                {t("billing.payment.orderAmount")}
              </span>
              <span className="font-display text-3xl font-bold leading-9 text-foreground">
                {formatCny(selectedSku.amountCents, locale)}
              </span>
            </div>
            {purchaseError && (
              <Alert variant="destructive" className="border px-3 py-2 text-sm">
                {purchaseError}
              </Alert>
            )}
            <Button
              type="button"
              data-testid="billing-account-buy-button"
              size="lg"
              className="w-full cursor-pointer text-base"
              disabled={creating}
              onClick={() => onPurchase(selectedSku)}
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <WalletCards className="size-4" />}
              {creating ? t("billing.actions.creatingOrder") : t("billing.actions.buyNow")}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function usePaymentFlow(onNavigate: Navigate, t: TFunction, onPaid?: () => void) {
  const [selectedSku, setSelectedSku] = useState<BillingSkuDto | null>(null);
  const [channel, setChannel] = useState<PaymentChannel>("alipay");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const createOrder = async (skuOverride?: BillingSkuDto) => {
    const orderSku = skuOverride ?? selectedSku;
    if (!orderSku) return;
    setCreating(true);
    setError("");
    try {
      const response = await billingApi.createOrder({
        skuCode: orderSku.code,
        channel,
        returnUrl: `${window.location.origin}/billing/alipay/return`,
      });
      if (response.paymentFormHtml) {
        window.sessionStorage.setItem(storageKey(response.orderId), response.paymentFormHtml);
      }
      setSelectedSku(null);
      if (response.redirectUrl && !response.paymentFormHtml) {
        window.location.assign(response.redirectUrl);
        onPaid?.();
        return;
      }
      onNavigate(`/billing/alipay/return?orderId=${encodeURIComponent(response.orderId)}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("billing.errors.orderCreateFailed"));
    } finally {
      setCreating(false);
    }
  };

  return {
    selectedSku,
    setSelectedSku,
    channel,
    setChannel,
    creating,
    error,
    createOrder,
  };
}

export function PricingBillingPage({
  signedIn,
  onNavigate,
}: {
  signedIn: boolean;
  onNavigate: Navigate;
}) {
  const { t } = useTranslation();
  const { locale } = useAppI18n();
  const { skus, loading, error } = useBillingSkus(t);
  const payment = usePaymentFlow(onNavigate, t);
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => setClientReady(true), []);
  return (
    <section
      data-testid="pricing-payment-page"
      className="flex flex-1 bg-background px-[clamp(1.5rem,4vw,7rem)] py-[clamp(3rem,6vh,5.5rem)]"
    >
      <div className="mx-auto grid w-full max-w-[1400px] content-start gap-10">
        <div className="mx-auto grid max-w-4xl gap-3 text-center">
          <Badge variant="secondary" className="mx-auto w-fit px-3 py-1 text-xs">
            <BadgeCheck className="size-3.5" />
            {t("billing.pricing.badge")}
          </Badge>
          <h1 className="font-display text-3xl font-bold leading-9 tracking-normal text-foreground md:text-4xl md:leading-10">
            {t("billing.pricing.title")}
          </h1>
          <p className="text-sm leading-7 text-muted-foreground md:text-base">
            {t("billing.pricing.description")}
          </p>
        </div>
        <BillingSkuGrid
          skus={skus}
          loading={loading}
          error={error}
          signedIn={signedIn}
          onNavigate={onNavigate}
          onSelect={payment.setSelectedSku}
          variant="pricing"
          locale={locale}
          t={t}
        />
      </div>
      {clientReady && (
        <>
          {/* Payment portals mount after hydration so the crawlable pricing shell stays deterministic. */}
          <PaymentConfirmDialog
            sku={payment.selectedSku}
            open={Boolean(payment.selectedSku)}
            creating={payment.creating}
            error={payment.error}
            channel={payment.channel}
            locale={locale}
            t={t}
            onChannelChange={payment.setChannel}
            onOpenChange={(open) => {
              if (!open) payment.setSelectedSku(null);
            }}
            onConfirm={payment.createOrder}
          />
        </>
      )}
    </section>
  );
}

function SummaryPanel({
  summary,
  locale,
  t,
}: {
  summary: BillingSummary;
  locale: string;
  t: TFunction;
}) {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      <Card as="section" className="gap-0 py-0 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium leading-5 text-muted-foreground">
            {t("billing.summary.availableCredits")}
          </div>
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <WalletCards className="size-4" />
          </span>
        </div>
        <div className="mt-4 font-display text-4xl font-bold leading-10 tracking-normal text-foreground">
          {summary.creditBalance}
        </div>
        <div className="mt-1 text-xs leading-5 text-success">
          {t("billing.summary.signupBonusIncluded")}
        </div>
      </Card>
      <Card as="section" className="gap-0 py-0 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium leading-5 text-muted-foreground">
            {t("billing.summary.signupBonus")}
          </div>
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <BadgeCheck className="size-4" />
          </span>
        </div>
        <div className="mt-4 font-display text-2xl font-semibold leading-8 text-foreground">
          {summary.signupBonus.granted
            ? t("billing.units.credits", { count: summary.signupBonus.creditAmount })
            : t("billing.summary.unclaimed")}
        </div>
        <div className="mt-1 text-sm leading-5 text-muted-foreground">
          {summary.signupBonus.granted
            ? t("billing.summary.validUntil", {
                date: formatDate(summary.signupBonus.validUntil, locale, t),
              })
            : t("billing.summary.issuedAfterVerification")}
        </div>
      </Card>
    </div>
  );
}

export function AccountBillingPage({ onNavigate }: { onNavigate: Navigate }) {
  const { t } = useTranslation();
  const { locale } = useAppI18n();
  const { skus, loading, error } = useBillingSkus(t);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [orderActionError, setOrderActionError] = useState("");
  const [resumingOrderId, setResumingOrderId] = useState<string | null>(null);
  const refreshSummary = () => {
    setSummaryLoading(true);
    billingApi
      .getSummary()
      .then((response) => {
        setSummary(response);
        setSummaryError("");
      })
      .catch((nextError: unknown) => {
        setSummaryError(nextError instanceof Error ? nextError.message : t("billing.errors.summaryLoadFailed"));
      })
      .finally(() => setSummaryLoading(false));
  };
  const payment = usePaymentFlow(onNavigate, t, refreshSummary);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("payment") === "success") {
      toast.success(t("billing.account.paymentSuccess"));
      searchParams.delete("payment");
      searchParams.delete("orderId");
      const nextSearch = searchParams.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", nextUrl);
    }
    refreshSummary();
  }, []);

  const resumeOrder = async (order: BillingOrderStatusDto) => {
    setResumingOrderId(order.orderId);
    setOrderActionError("");
    try {
      const response = await billingApi.resumeOrder(order.orderId);
      if (response.paymentFormHtml) {
        window.sessionStorage.setItem(storageKey(response.orderId), response.paymentFormHtml);
      }
      if (response.redirectUrl && !response.paymentFormHtml) {
        window.location.assign(response.redirectUrl);
        return;
      }
      onNavigate(`/billing/alipay/return?orderId=${encodeURIComponent(response.orderId)}`);
    } catch (nextError) {
      setOrderActionError(nextError instanceof Error ? nextError.message : t("billing.errors.resumePaymentFailed"));
      refreshSummary();
    } finally {
      setResumingOrderId(null);
    }
  };

  return (
    <main className="min-h-0 w-full overflow-x-clip bg-background">
      <PageContainer>
      <div data-testid="account-billing-dashboard" className="grid w-full gap-6">
        <section className="grid min-w-0 flex-1 content-start gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold leading-9 tracking-normal text-foreground">
                {t("billing.account.title")}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {t("billing.account.description")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className=""
              onClick={refreshSummary}
            >
              <RefreshCw className="size-4" />
              {t("billing.actions.refresh")}
            </Button>
          </div>
          {summaryLoading && (
            <Card className="gap-0 py-0 p-5 text-sm leading-6 text-muted-foreground">
              {t("billing.loading.summary")}
            </Card>
          )}
          {summaryError && (
            <Alert variant="destructive" className="border p-5 text-sm leading-6">
              {summaryError}
            </Alert>
          )}
          {orderActionError && (
            <Alert variant="destructive" className="border p-5 text-sm leading-6">
              {orderActionError}
            </Alert>
          )}
          {summary && <SummaryPanel summary={summary} locale={locale} t={t} />}
          <section className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold leading-8 text-foreground">
                {t("billing.account.purchaseTitle")}
              </h2>
              <span className="text-sm leading-5 text-muted-foreground">
                {t("billing.account.purchaseSubtitle")}
              </span>
            </div>
            <AccountCreditPackSelector
              skus={skus}
              loading={loading}
              error={error}
              channel={payment.channel}
              creating={payment.creating}
              purchaseError={payment.error}
              onChannelChange={payment.setChannel}
              onPurchase={(sku) => void payment.createOrder(sku)}
              locale={locale}
              t={t}
            />
          </section>
          <Card as="section" className="gap-0 overflow-hidden border py-0 ring-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 className="font-display text-xl font-semibold leading-7 text-foreground">
                {t("billing.orders.history")}
              </h2>
              <Badge variant="secondary">
                {t("billing.units.items", { count: summary?.recentOrders.length ?? 0 })}
              </Badge>
            </div>
            {summary?.recentOrders.length ? (
              <div className="max-w-full overflow-hidden">
                <Table className="min-w-[760px] text-left text-sm leading-5"  data-testid="billing-order-table" >
                  <TableHeader className="bg-muted/40 text-muted-foreground">
                    <TableRow>
                      <TableHead className="px-5 py-3 font-medium">{t("billing.orders.columns.orderNo")}</TableHead>
                      <TableHead className="px-5 py-3 font-medium">{t("billing.orders.columns.sku")}</TableHead>
                      <TableHead className="px-5 py-3 font-medium">{t("billing.orders.columns.amount")}</TableHead>
                      <TableHead className="px-5 py-3 font-medium">{t("billing.orders.columns.status")}</TableHead>
                      <TableHead className="px-5 py-3 font-medium">{t("billing.orders.columns.createdAt")}</TableHead>
                      <TableHead className="px-5 py-3 font-medium">{t("billing.orders.columns.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border text-muted-foreground">
                    {summary.recentOrders.map((order) => (
                      <TableRow key={order.orderId} className="transition-colors hover:bg-muted/30">
                        <TableCell className="px-5 py-3 font-mono text-xs text-muted-foreground">
                          {order.merchantOrderNo}
                        </TableCell>
                        <TableCell className="px-5 py-3 font-medium text-foreground">
                          {skuCopy(order.sku, "name", t)}
                        </TableCell>
                        <TableCell className="px-5 py-3">{formatCny(order.amountCents, locale)}</TableCell>
                        <TableCell className="px-5 py-3">
                          <Badge variant={orderStatusBadgeVariant(order.status)}>
                            {orderStatusLabel(order.status, t)}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-5 py-3 text-muted-foreground">
                          {formatDate(order.createdAt, locale, t)}
                        </TableCell>
                        <TableCell className="px-5 py-3">
                          {orderIsPayable(order) ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 px-3 text-xs"
                              disabled={resumingOrderId === order.orderId}
                              onClick={() => void resumeOrder(order)}
                            >
                              {resumingOrderId === order.orderId ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <ExternalLink className="size-3.5" />
                              )}
                              {t("billing.actions.resumePayment")}
                            </Button>
                          ) : order.status === "expired" ? (
                            <span className="text-xs text-muted-foreground">
                              {t("billing.order.status.expired")}
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm leading-6 text-muted-foreground">
                {t("billing.orders.empty")}
              </div>
            )}
          </Card>
        </section>
      </div>
      </PageContainer>
    </main>
  );
}

export function AlipayReturnPage({ onNavigate }: { onNavigate: Navigate }) {
  const { t } = useTranslation();
  const { locale } = useAppI18n();
  const [order, setOrder] = useState<BillingOrderStatusDto | null>(null);
  const [error, setError] = useState("");
  const bridgeRef = useRef<HTMLDivElement | null>(null);
  const searchParams =
    typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const orderId = searchParams.get("orderId") ?? searchParams.get("param") ?? "";
  const merchantOrderNo = searchParams.get("out_trade_no") ?? "";
  const lookupKey = orderId ? `id:${orderId}` : merchantOrderNo ? `merchant:${merchantOrderNo}` : "";

  useEffect(() => {
    if (!lookupKey) {
      setError(t("billing.errors.missingOrderId"));
      return;
    }
    const formHtml = orderId ? window.sessionStorage.getItem(storageKey(orderId)) : null;
    if (formHtml && bridgeRef.current) {
      window.sessionStorage.removeItem(storageKey(orderId));
      bridgeRef.current.innerHTML = formHtml;
      const form = bridgeRef.current.querySelector("form") as HTMLFormElement | null;
      form?.submit();
    }
    let active = true;
    let timer: number | undefined;
    const load = () => {
      const request = orderId
        ? billingApi.getOrder(orderId)
        : billingApi.getOrderByMerchantOrderNo(merchantOrderNo);
      request
        .then((response) => {
          if (!active) return;
          if (response.status === "paid") {
            active = false;
            if (timer !== undefined) window.clearInterval(timer);
            onNavigate(`/account/billing?payment=success&orderId=${encodeURIComponent(response.orderId)}`);
            return;
          }
          setOrder(response);
        })
        .catch((nextError: unknown) => {
          if (active) setError(nextError instanceof Error ? nextError.message : t("billing.errors.orderStatusLoadFailed"));
        });
    };
    load();
    timer = window.setInterval(load, 2500);
    return () => {
      active = false;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [lookupKey, merchantOrderNo, onNavigate, orderId, t]);

  return (
    <main className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-background px-6 py-10">
      <div className="absolute left-6 top-6 flex items-center gap-2 text-foreground">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <BadgeCheck className="size-4" />
        </span>
        <span className="font-display text-sm font-semibold leading-5">UML Lab</span>
      </div>
      <Card as="section"
        data-testid="alipay-processing-card"
        className="gap-0 py-0 grid w-full max-w-[420px] gap-5 overflow-hidden text-center"
      >
        <div className="h-1.5 bg-primary" />
        <div className="grid gap-5 px-8 pb-8 pt-4">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
            <ExternalLink className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold leading-8 text-foreground">
              {t("billing.return.title")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("billing.return.description")}
            </p>
          </div>
          <div className="mx-auto flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm leading-5 text-primary">
            <Loader2 className="size-4 animate-spin" />
            {t("billing.return.connecting")}
          </div>
          {order && (
            <div className="rounded-xl border border-border bg-muted/30 p-5 text-sm leading-5">
              <div className="font-display text-sm font-semibold text-foreground">
                {skuCopy(order.sku, "name", t)}
              </div>
              <div className="mt-1 text-muted-foreground">
                {order.merchantOrderNo} · {formatCny(order.amountCents, locale)}
              </div>
              <Badge
                className="mt-3"
                variant={orderStatusBadgeVariant(order.status)}
              >
                {orderStatusLabel(order.status, t)}
              </Badge>
            </div>
          )}
          {error && (
            <Alert variant="destructive" className="border p-3 text-sm">
              {error}
            </Alert>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              type="button"
              className={paymentPrimaryButtonClass}
              onClick={() => onNavigate("/account/billing")}
            >
              {t("billing.return.backToBilling")}
            </Button>
          </div>
          <div ref={bridgeRef} className="hidden" aria-hidden="true" />
        </div>
      </Card>
    </main>
  );
}
