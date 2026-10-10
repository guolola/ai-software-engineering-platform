// Covers billing page responsive layout contracts for entitlement cards, orders, and payment dialogs.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  waitForOrderCreation,
  recentOrders,
}: {
  order?: typeof billingOrder | typeof paidBillingOrder;
  onSummary?: () => void;
  onCreateOrder?: (body: unknown) => void;
  failOrderCreation?: boolean | (() => boolean);
  waitForOrderCreation?: () => Promise<void>;
  recentOrders?: Array<typeof billingOrder | typeof paidBillingOrder>;
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
          recentOrders: recentOrders ?? [order],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.pathname === "/api/billing/orders" && method === "POST") {
      onCreateOrder?.(JSON.parse(String(init?.body ?? "{}")) as unknown);
      await waitForOrderCreation?.();
      if (typeof failOrderCreation === "function" ? failOrderCreation() : failOrderCreation) {
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

  it("pages orders with dashboard controls and resumes the correct order on a later page", async () => {
    const orders = Array.from({ length: 6 }, (_, index) => ({
      ...paidBillingOrder, orderId: `paid-${index}`, merchantOrderNo: `PAID-${index}`,
    }));
    stubBillingFetch({ recentOrders: [...orders, billingOrder] });
    const user = userEvent.setup();
    const navigate = vi.fn();
    renderWithI18n(<AccountBillingPage onNavigate={navigate} />);
    expect(await screen.findByText("显示第 1–5 条，共 7 条")).toBeInTheDocument();
    expect(screen.queryByText(billingOrder.merchantOrderNo)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "前往下一页" }));
    expect(screen.getByText("显示第 6–7 条，共 7 条")).toBeInTheDocument();
    expect(screen.queryByText("PAID-0")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前往下一页" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "继续支付" }));
    expect(navigate).toHaveBeenCalledWith(`/billing/alipay/return?orderId=${billingOrder.orderId}`);
    await user.click(screen.getByRole("button", { name: "前往上一页" }));
    expect(screen.getByText("PAID-0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "前往下一页" }));
    await user.click(screen.getByRole("combobox", { name: "每页显示条数" }));
    await user.click(await screen.findByRole("option", { name: "10" }));
    expect(screen.getByText("显示第 1–7 条，共 7 条")).toBeInTheDocument();
    expect(screen.getByText("PAID-0")).toBeInTheDocument();
  });

  it("keeps a disabled first page for an empty order list", async () => {
    stubBillingFetch({ recentOrders: [] });
    renderWithI18n(<AccountBillingPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("正在加载权益...")).not.toBeInTheDocument());
    expect(screen.getByText("显示第 0–0 条，共 0 条")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前往上一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "前往下一页" })).toBeDisabled();
  });

  it("uses the supplied gift-card gallery and opens checkout before purchasing the selected pack", async () => {
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
    expect(within(selector).queryByRole("radiogroup", { name: "选择支付方式" })).not.toBeInTheDocument();
    const artwork = within(selector).getByRole("img");
    expect(artwork).toHaveAttribute("src", "https://cdn.shadcnstudio.com/ss-assets/blocks/ecommerce/gift-card/image-09.png");
    await user.click(within(selector).getByRole("button", { name: "预览 500 次包" }));
    expect(within(packGroup).getByRole("radio", { name: "500 次包" })).toBeChecked();
    expect(artwork).toHaveAttribute("src", "https://cdn.shadcnstudio.com/ss-assets/blocks/ecommerce/gift-card/image-10.png");
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
    const checkout = await screen.findByTestId("billing-checkout-dialog");
    expect(onCreateOrder).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(within(checkout).getByRole("heading", { name: "订单结算" })).toBeInTheDocument();
    expect(checkout).toHaveTextContent("10 次包");
    expect(checkout).toHaveTextContent("11 次");
    expect(checkout).toHaveTextContent("9.90");
    expect(within(checkout).getByRole("radio", { name: "支付宝" })).toBeChecked();
    expect(within(checkout).getByTestId("alipay-icon")).toBeInTheDocument();
    expect(within(checkout).queryByRole("textbox")).not.toBeInTheDocument();
    expect(checkout).not.toHaveTextContent("EPay");
    expect(checkout).toHaveTextContent("使用支付宝完成付款");
    const checkoutBlock = within(checkout).getByTestId("billing-checkout-block");
    expect(checkoutBlock.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    const usageGuide = within(checkout).getByRole("region", { name: "购买后如何使用" });
    expect(within(usageGuide).getAllByRole("listitem")).toHaveLength(3);
    expect(usageGuide).toHaveTextContent("每次生成扣 1 次");
    expect(usageGuide).toHaveTextContent("核对订单状态");
    await user.click(within(checkout).getByRole("button", { name: "立即支付" }));

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

  it("keeps checkout and the selected pack after failure and allows retry", async () => {
    const onCreateOrder = vi.fn();
    let attempts = 0;
    stubBillingFetch({ onCreateOrder, failOrderCreation: () => ++attempts === 1 });
    const user = userEvent.setup();
    const navigate = vi.fn();
    renderWithI18n(<AccountBillingPage onNavigate={navigate} />);
    const selector = await screen.findByTestId("billing-account-sku-selector");
    await user.click(within(selector).getByRole("button", { name: "立即购买" }));
    const checkout = await screen.findByTestId("billing-checkout-dialog");
    await user.click(within(checkout).getByRole("button", { name: "立即支付" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("支付订单创建失败"));
    expect(checkout).toBeInTheDocument();
    expect(checkout).toHaveTextContent("100 次包");
    expect(within(checkout).getByRole("button", { name: "立即支付" })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
    await user.click(within(checkout).getByRole("button", { name: "立即支付" }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(onCreateOrder).toHaveBeenCalledTimes(2);
  });

  it("preserves the pack and returns focus when checkout is closed", async () => {
    const onCreateOrder = vi.fn();
    stubBillingFetch({ onCreateOrder });
    const user = userEvent.setup();
    renderWithI18n(<AccountBillingPage onNavigate={vi.fn()} />);
    const selector = await screen.findByTestId("billing-account-sku-selector");
    await user.click(within(selector).getByRole("button", { name: "预览 50 次包" }));
    const buyButton = within(selector).getByRole("button", { name: "立即购买" });
    await user.click(buyButton);
    const checkout = await screen.findByTestId("billing-checkout-dialog");
    expect(checkout).toHaveTextContent("50 次包");
    await user.click(within(checkout).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(buyButton).toHaveFocus());
    expect(within(selector).getByRole("radio", { name: "50 次包" })).toBeChecked();
    expect(onCreateOrder).not.toHaveBeenCalled();
    await user.click(buyButton);
    expect(await screen.findByRole("dialog")).toHaveTextContent("50 次包");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("blocks duplicate payment and dismissal while the order request is pending", async () => {
    let releaseOrder: () => void;
    const pending = new Promise<void>(resolve => { releaseOrder = resolve; });
    const onCreateOrder = vi.fn();
    stubBillingFetch({ onCreateOrder, waitForOrderCreation: () => pending });
    const user = userEvent.setup();
    const navigate = vi.fn();
    renderWithI18n(<AccountBillingPage onNavigate={navigate} />);
    await user.click(await screen.findByRole("button", { name: "立即购买" }));
    const checkout = await screen.findByTestId("billing-checkout-dialog");
    const payButton = within(checkout).getByRole("button", { name: "立即支付" });
    fireEvent.click(payButton);
    fireEvent.click(payButton);
    await waitFor(() => expect(onCreateOrder).toHaveBeenCalledTimes(1));
    expect(payButton).toBeDisabled();
    expect(within(checkout).getByRole("button", { name: "取消" })).toBeDisabled();
    expect(within(checkout).getByRole("radio", { name: "支付宝" })).toBeDisabled();
    await user.keyboard("{Escape}");
    fireEvent.click(document.querySelector('[data-slot="dialog-overlay"]')!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => releaseOrder!());
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(onCreateOrder).toHaveBeenCalledTimes(1);
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
    expect(screen.getByText("Showing 1 to 1 of 1 entries")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Rows per page" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Select a credit pack" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Select payment method" })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Buy now" }));
    const checkout = await screen.findByRole("dialog");
    expect(within(checkout).getByRole("heading", { name: "Checkout" })).toBeInTheDocument();
    expect(within(checkout).getByRole("radio", { name: "Alipay" })).toBeChecked();
    expect(checkout).toHaveTextContent("Total due");
    expect(checkout).not.toHaveTextContent("EPay");
    expect(within(checkout).getByRole("region", { name: "How to use your credits" })).toBeInTheDocument();
    expect(screen.getAllByText("100-credit pack").length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("billing-account-sku-selector")).getByText("Buy 100 and get 20 bonus, for 120 credits total")).toBeInTheDocument();
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
