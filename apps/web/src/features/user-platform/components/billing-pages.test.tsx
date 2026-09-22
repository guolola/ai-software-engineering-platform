// Covers billing page responsive layout contracts for entitlement cards, orders, and payment dialogs.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { floatingAlert as toast } from "../../../shared/ui/floating-alert";
import { AppI18nProvider } from "../../../shared/i18n";
import { i18n, LOCALE_PREFERENCE_STORAGE_KEY } from "../../../shared/i18n";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountBillingPage, AlipayReturnPage, PricingBillingPage } from "./billing-pages";

vi.mock("../../../shared/ui/floating-alert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/ui/floating-alert")>();
  return { ...actual, floatingAlert: {
    ...actual.floatingAlert,
    success: vi.fn(),
    error: vi.fn(),
  } };
});

const billingSkus = [
  {
    code: "credits_10",
    name: "10 次包",
    kind: "credit_pack",
    description: "买 10 次送 1 次，到账 11 次",
    durationDays: null,
    creditAmount: 11,
    amountCents: 990,
    currency: "CNY",
    active: true,
    sortOrder: 110,
  },
  {
    code: "credits_50",
    name: "50 次包",
    kind: "credit_pack",
    description: "买 50 次送 8 次，到账 58 次",
    durationDays: null,
    creditAmount: 58,
    amountCents: 4900,
    currency: "CNY",
    active: true,
    sortOrder: 120,
  },
  {
    code: "credits_100",
    name: "100 次包",
    kind: "credit_pack",
    description: "买 100 次送 20 次，到账 120 次",
    durationDays: null,
    creditAmount: 120,
    amountCents: 9900,
    currency: "CNY",
    active: true,
    sortOrder: 130,
  },
  {
    code: "credits_500",
    name: "500 次包",
    kind: "credit_pack",
    description: "买 500 次送 120 次，到账 620 次",
    durationDays: null,
    creditAmount: 620,
    amountCents: 39900,
    currency: "CNY",
    active: true,
    sortOrder: 140,
  },
];

const purchaseSku = billingSkus.find((sku) => sku.code === "credits_100")!;

function renderWithI18n(ui: ReactElement) {
  return render(<AppI18nProvider>{ui}</AppI18nProvider>);
}

const billingOrder = {
  orderId: "order-test-1",
  merchantOrderNo: "UML202606050001",
  sku: purchaseSku,
  amountCents: purchaseSku.amountCents,
  currency: "CNY",
  channel: "alipay",
  status: "pending",
  createdAt: "2026-06-05T04:00:00.000Z",
  // Pending-order actions are available only before expiry; keep the fixture valid over time.
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  paidAt: null,
};

const paidBillingOrder = {
  ...billingOrder,
  status: "paid",
  paidAt: "2026-06-05T04:02:00.000Z",
};

function stubBillingFetch({
  order = billingOrder,
  onSummary,
  onCreateOrder,
  failOrderCreation = false,
}: {
  order?: typeof billingOrder | typeof paidBillingOrder;
  onSummary?: () => void;
  onCreateOrder?: (body: unknown) => void;
  failOrderCreation?: boolean;
} = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://127.0.0.1:4101");
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/billing/skus") {
      return new Response(JSON.stringify({ skus: billingSkus }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/billing/summary") {
      onSummary?.();
      return new Response(
        JSON.stringify({
          creditBalance: 128,
          signupBonus: {
            granted: true,
            creditAmount: 5,
            validUntil: "2026-07-05T04:00:00.000Z",
          },
          recentOrders: [order],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.pathname === "/api/billing/orders" && method === "POST") {
      onCreateOrder?.(JSON.parse(String(init?.body ?? "{}")) as unknown);
      if (failOrderCreation) {
        return new Response(JSON.stringify({ message: "Order creation failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          orderId: billingOrder.orderId,
          merchantOrderNo: billingOrder.merchantOrderNo,
          status: order.status,
          amountCents: order.amountCents,
          currency: order.currency,
          expiresAt: order.expiresAt,
          channel: "alipay",
          paymentFormHtml: "<form action=\"https://zpayz.cn/submit.php\"><button>pay</button></form>",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.pathname === `/api/billing/orders/${billingOrder.orderId}/resume` && method === "POST") {
      return new Response(
        JSON.stringify({
          orderId: billingOrder.orderId,
          merchantOrderNo: billingOrder.merchantOrderNo,
          status: order.status,
          amountCents: order.amountCents,
          currency: order.currency,
          expiresAt: order.expiresAt,
          channel: "alipay",
          paymentFormHtml: "<form action=\"https://zpayz.cn/submit.php\"><button>pay</button></form>",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.pathname === `/api/billing/orders/${billingOrder.orderId}` && method === "GET") {
      return new Response(JSON.stringify(order), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (
      url.pathname === `/api/billing/orders/by-merchant/${billingOrder.merchantOrderNo}` &&
      method === "GET"
    ) {
      return new Response(JSON.stringify(order), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ message: "Unhandled test request" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
}

describe("AccountBillingPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("renders the account gift-card selector and purchases the selected pack with Alipay directly", async () => {
    const onCreateOrder = vi.fn();
    stubBillingFetch({ onCreateOrder });
    const user = userEvent.setup();
    const navigate = vi.fn();
    const { container } = renderWithI18n(<AccountBillingPage onNavigate={navigate} />);

    expect(await screen.findByRole("heading", { name: "权益与账单" })).toBeInTheDocument();
    expect(
      container.querySelector(".motion-card, .motion-rise, .motion-action"),
    ).toBeNull();
    const orderTable = await screen.findByTestId("billing-order-table");
    expect(orderTable.closest("[data-slot='table-container']")).not.toBeNull();
    const summaryFrame = screen.getByText("可用次数").closest('[class*="md:grid-cols-2"]');
    expect(summaryFrame).toHaveTextContent("邮箱验证赠送");
    expect(screen.queryByText(/邮箱验证赠送 5 次/)).not.toBeInTheDocument();

    expect(screen.queryByTestId("billing-sku-group-time")).not.toBeInTheDocument();
    expect(screen.queryByText("日卡")).not.toBeInTheDocument();
    expect(screen.queryByText("月卡")).not.toBeInTheDocument();
    expect(screen.queryByText("年卡")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "立即开通" })).not.toBeInTheDocument();
    expect(screen.getByText("买 100 次送 20 次，到账 120 次")).toBeInTheDocument();
    expect(screen.getByText("可用次数").closest("section")).toHaveClass("p-6");
    const selector = screen.getByTestId("billing-account-sku-selector");
    const packGroup = within(selector).getByRole("radiogroup", { name: "选择次数包" });
    expect(within(packGroup).getAllByRole("radio")).toHaveLength(4);
    expect(within(packGroup).getByRole("radio", { name: /100 次包/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const paymentGroup = within(selector).getByRole("radiogroup", { name: "选择支付方式" });
    expect(within(paymentGroup).getAllByRole("radio")).toHaveLength(1);
    expect(within(paymentGroup).getByRole("radio", { name: /支付宝/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(paymentGroup).getByTestId("alipay-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("billing-sku-card")).not.toBeInTheDocument();
    expect(within(selector).getAllByRole("button", { name: "立即购买" })).toHaveLength(1);
    expect(await screen.findByRole("button", { name: "继续支付" })).toBeInTheDocument();

    await user.click(within(selector).getByRole("radio", { name: /10 次包/ }));
    expect(within(selector).getByRole("radio", { name: /10 次包/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("买 10 次送 1 次，到账 11 次")).toBeInTheDocument();
    within(selector).getByRole("radio", { name: /10 次包/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(within(selector).getByRole("radio", { name: /50 次包/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(within(selector).getByRole("radio", { name: /10 次包/ }));

    await user.click(within(selector).getByRole("button", { name: "立即购买" }));

    await waitFor(() => {
      expect(onCreateOrder).toHaveBeenCalledWith({
        skuCode: "credits_10",
        channel: "alipay",
        returnUrl: `${window.location.origin}/billing/alipay/return`,
      });
    });
    expect(screen.queryByTestId("payment-confirm-dialog")).not.toBeInTheDocument();
    expect(navigate).toHaveBeenCalledWith(`/billing/alipay/return?orderId=${billingOrder.orderId}`);
    expect(window.sessionStorage.getItem(`uml-alipay-form:${billingOrder.orderId}`)).toContain(
      "zpayz.cn/submit.php",
    );
  });

  it("keeps the selected pack and shows a floating error when direct order creation fails", async () => {
    stubBillingFetch({ failOrderCreation: true });
    const user = userEvent.setup();
    const navigate = vi.fn();
    renderWithI18n(<AccountBillingPage onNavigate={navigate} />);

    const selector = await screen.findByTestId("billing-account-sku-selector");
    const buyButton = within(selector).getByRole("button", { name: "立即购买" });
    await user.click(buyButton);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("支付订单创建失败"));
    expect(within(selector).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(selector).getByRole("radio", { name: /100 次包/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(buyButton).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("payment-confirm-dialog")).not.toBeInTheDocument();
  });

  it("resumes pending orders from the order table", async () => {
    stubBillingFetch();
    const user = userEvent.setup();
    const navigate = vi.fn();
    renderWithI18n(<AccountBillingPage onNavigate={navigate} />);

    await user.click(await screen.findByRole("button", { name: "继续支付" }));

    expect(navigate).toHaveBeenCalledWith(`/billing/alipay/return?orderId=${billingOrder.orderId}`);
    expect(window.sessionStorage.getItem(`uml-alipay-form:${billingOrder.orderId}`)).toContain(
      "zpayz.cn/submit.php",
    );
  });

  it("renders account billing system UI in English while preserving SKU text", async () => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, "en");
    stubBillingFetch();
    renderWithI18n(<AccountBillingPage onNavigate={() => {}} />);

    expect(await screen.findByRole("heading", { name: "Credits and billing" })).toBeInTheDocument();
    expect(screen.getByText("Order history")).toBeInTheDocument();
    expect(screen.getByText("Order no.")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Resume payment" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Select a credit pack" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Select payment method" })).toBeInTheDocument();
    expect(screen.getAllByText("100-credit pack").length).toBeGreaterThan(0);
    expect(screen.getByText("Buy 100 and get 20 bonus, for 120 credits total")).toBeInTheDocument();
  });

  it("shows payment success feedback on account billing and clears the return marker", async () => {
    await i18n.changeLanguage("zh-CN");
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, "zh-CN");
    const onSummary = vi.fn();
    stubBillingFetch({ order: paidBillingOrder, onSummary });
    window.history.pushState(
      {},
      "",
      `/account/billing?payment=success&orderId=${billingOrder.orderId}`,
    );

    renderWithI18n(<AccountBillingPage onNavigate={() => {}} />);

    expect(await screen.findByRole("heading", { name: "权益与账单" })).toBeInTheDocument();
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("支付成功，次数已到账");
    });
    expect(window.location.pathname).toBe("/account/billing");
    expect(window.location.search).toBe("");
    expect(onSummary).toHaveBeenCalled();
  });
});

describe("AlipayReturnPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("can recover the order from the merchant order number returned by ZPAY", async () => {
    stubBillingFetch();
    window.history.pushState(
      {},
      "",
      `/billing/alipay/return?out_trade_no=${billingOrder.merchantOrderNo}`,
    );

    const navigate = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithI18n(<AlipayReturnPage onNavigate={navigate} />);

    expect(
      container.querySelector(".motion-card, .motion-rise, .motion-action"),
    ).toBeNull();

    expect(
      await screen.findAllByText((_, element) =>
        Boolean(element?.textContent?.includes(billingOrder.merchantOrderNo)),
      ),
    ).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "返回支付页面" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回项目" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回定价" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回支付页面" }));
    expect(navigate).toHaveBeenCalledWith("/account/billing");
  });

  it("returns to account billing with success marker after the backend confirms payment", async () => {
    stubBillingFetch({ order: paidBillingOrder });
    window.history.pushState(
      {},
      "",
      `/billing/alipay/return?orderId=${billingOrder.orderId}`,
    );
    const navigate = vi.fn();

    renderWithI18n(<AlipayReturnPage onNavigate={navigate} />);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        `/account/billing?payment=success&orderId=${billingOrder.orderId}`,
      );
    });
  });
});

describe("PricingBillingPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("renders only credit packs on the public payment page", async () => {
    stubBillingFetch();
    const user = userEvent.setup();
    const { container } = renderWithI18n(<PricingBillingPage signedIn onNavigate={() => {}} />);

    expect(await screen.findByRole("heading", { name: "开通 AI 生成权益" })).toBeInTheDocument();
    expect(
      container.querySelector(".motion-card, .motion-rise, .motion-action"),
    ).toBeNull();
    expect(screen.getByText("购买次数包后可用于所有可选模型，每次生成扣 1 次。新用户邮箱验证后自动赠送 30 次，有效期 30 天。")).toBeInTheDocument();
    expect(screen.queryByText("通行卡")).not.toBeInTheDocument();
    expect(screen.queryByText("日卡")).not.toBeInTheDocument();
    expect(screen.queryByText("周卡")).not.toBeInTheDocument();
    expect(screen.queryByText("月卡")).not.toBeInTheDocument();
    expect(screen.queryByText("年卡")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "立即开通" })).not.toBeInTheDocument();
    expect(screen.getByText("买 100 次送 20 次，到账 120 次")).toBeInTheDocument();
    expect(screen.getByTestId("billing-recommended-sku")).toHaveClass("p-6");
    expect(screen.getAllByRole("button", { name: "立即购买" })).toHaveLength(4);
    expect(screen.queryByTestId("billing-account-sku-selector")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "立即购买" })[0]!);
    const dialog = await screen.findByTestId("payment-confirm-dialog");
    expect(dialog).toHaveTextContent("支付宝");
    expect(within(dialog).getByTestId("alipay-icon")).toBeInTheDocument();
  });

  it("renders public payment system UI and default SKU copy in English", async () => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, "en");
    stubBillingFetch();
    renderWithI18n(<PricingBillingPage signedIn onNavigate={() => {}} />);

    expect(await screen.findByRole("heading", { name: "Enable AI generation credits" })).toBeInTheDocument();
    expect(screen.getByText("Credit packs")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Buy now" })).toHaveLength(4);
    expect(screen.getAllByText("100-credit pack").length).toBeGreaterThan(0);
    expect(screen.getByText("Buy 100 and get 20 bonus, for 120 credits total")).toBeInTheDocument();
  });
});
