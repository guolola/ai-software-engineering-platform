// Covers account modal profile usage telemetry and security workflows displayed to the current user.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../../shared/i18n/i18n";
import { ThemeProvider } from "../../../shared/ui/theme-provider";
import { AccountDialog } from "./account-dialog";
import type { PlatformAccountProfileResponse } from "../services/platform-api";
import { invalidateProviderConfigCache } from "../services/provider-config-cache";

const baseUser = {
  id: "user-1",
  email: "student@example.edu",
  username: "student",
  displayName: "Student",
  status: "active",
  emailVerified: true,
  mfaEnabled: false,
};

function profileResponse(
  generationUsage: PlatformAccountProfileResponse["generationUsage"],
  user = baseUser,
): PlatformAccountProfileResponse {
  return {
    user,
    session: {
      id: "session-1",
      userId: user.id,
      createdAt: "2026-05-25T08:00:00.000Z",
      expiresAt: "2026-06-01T08:00:00.000Z",
      lastSeenAt: "2026-05-25T08:00:00.000Z",
      ipAddress: "203.0.113.40",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    },
    mfa: { enabled: false, enforcement: "totp" },
    generationUsage,
  };
}

function stubAccountFetch(profile: PlatformAccountProfileResponse) {
  let mfaEnabled = Boolean(profile.mfa?.enabled ?? profile.user.mfaEnabled);
  const currentProfile = () => ({
    ...profile,
    user: { ...profile.user, mfaEnabled },
    mfa: { enabled: mfaEnabled, enforcement: "totp" },
  });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://127.0.0.1:4101");
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/auth/me" || (url.pathname === "/api/account/profile" && method === "GET")) {
      return new Response(JSON.stringify(currentProfile()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/profile" && method === "PATCH") {
      return new Response(
        JSON.stringify({
          ...currentProfile(),
          user: {
            ...currentProfile().user,
            displayName: "Teaching Assistant",
            avatarUrl: "https://cdn.example.edu/avatar.png",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.pathname === "/api/account/sessions") {
      return new Response(JSON.stringify({ sessions: [profile.session] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/provider-configs") {
      return new Response(JSON.stringify({
        providerConfigs: [{
          id: "provider-1",
          name: "课程 OpenAI",
          provider: "openai",
          baseUrl: "https://api.example.com/v1",
          defaultModel: "gpt-5.6",
          allowedModels: ["gpt-5.6", "gpt-5.5"],
          maskedKey: "sk-***",
          keyPurpose: "course",
          status: "active",
          riskState: "approved",
          quota: "managed",
          createdBy: "admin-1",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
          lastUsedAt: null,
          allowlisted: true,
          scopeType: "system",
          scopeId: null,
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/billing/summary") {
      return new Response(JSON.stringify({
        creditBalance: 0,
        signupBonus: { granted: false, creditAmount: 0, validUntil: null },
        recentOrders: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/mfa/setup" && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          secret: "JBSWY3DPEHPK3PXP",
          otpauthUri: "otpauth://totp/UML:student@example.edu?secret=JBSWY3DPEHPK3PXP",
          qrCodeDataUrl: "data:image/png;base64,mfa",
          expiresAt: "2026-05-25T08:05:00.000Z",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.pathname === "/api/account/mfa/confirm" && init?.method === "POST") {
      mfaEnabled = true;
      return new Response(JSON.stringify({ mfa: { enabled: true, enforcement: "totp" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/mfa" && init?.method === "PATCH") {
      mfaEnabled = false;
      return new Response(JSON.stringify({ mfa: { enabled: false, enforcement: "totp" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/sessions/revoke-others" && init?.method === "POST") {
      return new Response(JSON.stringify({ revokedCount: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/auth/logout" && init?.method === "POST") {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ message: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAccountDialog(
  props: ComponentProps<typeof AccountDialog>,
  options: { strict?: boolean } = {},
) {
  const dialog = (
    <ThemeProvider>
      <AccountDialog {...props} />
    </ThemeProvider>
  );
  return render(
    options.strict ? <StrictMode>{dialog}</StrictMode> : dialog,
  );
}

describe("AccountDialog generation usage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    invalidateProviderConfigCache();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });

  it("resolves every session table header in both supported locales", () => {
    expect(i18n.t("account.deviceHeader", { lng: "zh-CN" })).toBe("设备");
    expect(i18n.t("account.lastActiveHeader", { lng: "zh-CN" })).toBe("最近活动");
    expect(i18n.t("account.expiresHeader", { lng: "zh-CN" })).toBe("过期时间");
    expect(i18n.t("account.deviceHeader", { lng: "en" })).toBe("Device");
    expect(i18n.t("account.lastActiveHeader", { lng: "en" })).toBe("Last active");
    expect(i18n.t("account.expiresHeader", { lng: "en" })).toBe("Expires");
  });

  it("keeps the account trigger visible as a compact mobile avatar button", () => {
    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });

    const trigger = screen.getByRole("button", { name: "账号" });
    expect(trigger).toHaveClass("inline-flex", "size-9", "md:w-auto");
    expect(trigger).not.toHaveClass("hidden");
    expect(within(trigger).getByText("Student")).toHaveClass("hidden", "md:inline");
  });

  it("uses expandable top tabs and keyboard navigation on mobile", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    const user = userEvent.setup();
    stubAccountFetch(
      profileResponse({
        usedToday: 0,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));

    const accountDialog = await screen.findByRole("dialog", { name: "设置" });
    expect(accountDialog).toHaveClass("h-[100dvh]", "max-w-none", "md:max-w-[1100px]");
    const tabList = within(accountDialog).getByRole("tablist", { name: "设置" });
    const tabs = within(tabList).getAllByRole("tab");
    expect(tabs).toHaveLength(4);

    const profileTab = within(tabList).getByRole("tab", { name: "个人资料" });
    const securityTab = within(tabList).getByRole("tab", { name: "安全设置" });
    await waitFor(() => expect(profileTab).toHaveStyle({ width: "116px" }));
    expect(securityTab).toHaveStyle({ width: "40px" });

    profileTab.focus();
    fireEvent.keyDown(profileTab, { key: "ArrowRight" });
    expect(securityTab).toHaveFocus();
    expect(securityTab).toHaveAttribute("aria-selected", "true");
    expect((await within(accountDialog).findAllByText("修改密码")).length).toBeGreaterThan(0);
  });

  it("shows the complete session table and preloads provider settings when the dialog opens", async () => {
    const user = userEvent.setup();
    const fetchMock = stubAccountFetch(
      profileResponse({
        usedToday: 0,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    renderAccountDialog(
      { onNavigate: () => {}, initialUser: baseUser },
      { strict: true },
    );
    await user.click(screen.getByRole("button", { name: "账号" }));
    const accountDialog = await screen.findByRole("dialog", { name: "设置" });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/account/sessions"))).toBe(true);
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/provider-configs"))).toBe(true);
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/billing/summary"))).toBe(true);
    });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/provider-configs"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/billing/summary"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/auth/me"))).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/account/login-events"))).toBe(false);

    await user.click(within(accountDialog).getByRole("tab", { name: "登录会话" }));
    const sessionsTable = await within(accountDialog).findByRole("table", { name: "活跃会话" });
    expect(within(sessionsTable).getByRole("columnheader", { name: "设备" })).toBeInTheDocument();
    expect(within(sessionsTable).getByRole("columnheader", { name: "地区" })).toBeInTheDocument();
    expect(within(sessionsTable).getByRole("columnheader", { name: "最近活动" })).toBeInTheDocument();
    expect(within(sessionsTable).getByRole("columnheader", { name: "过期时间" })).toBeInTheDocument();
    expect(sessionsTable.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
    expect(within(sessionsTable).getByText("当前设备")).toBeInTheDocument();
    expect(within(accountDialog).queryByText("登录历史")).not.toBeInTheDocument();
    expect(accountDialog).toHaveClass("md:max-w-[1100px]");
    expect(sessionsTable).toHaveClass("table-fixed");
    expect(within(sessionsTable).getByText("Windows • Chrome").closest("td")).toHaveClass("overflow-hidden");

    const providerRequestCount = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/api/provider-configs"),
    ).length;
    const billingRequestCount = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/api/billing/summary"),
    ).length;
    await user.click(within(accountDialog).getByRole("tab", { name: "全局设置" }));
    expect(await within(accountDialog).findByLabelText("托管 Provider 配置")).not.toBeDisabled();
    expect(within(accountDialog).getByLabelText("默认模型")).not.toBeDisabled();
    expect(within(accountDialog).getByLabelText("托管 Provider 配置")).toHaveTextContent("课程 OpenAI");
    expect(within(accountDialog).getByLabelText("默认模型")).toHaveTextContent("gpt-5.6");
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/provider-configs"))).toHaveLength(providerRequestCount);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/billing/summary"))).toHaveLength(billingRequestCount);
    expect(within(accountDialog).queryByText("暂无可用托管 Provider 配置。")).not.toBeInTheDocument();
    expect(within(accountDialog).queryByText("选择托管 Provider 后才能选择默认模型。")).not.toBeInTheDocument();
  });

  it("does not show today's generation count for regular users", async () => {
    const user = userEvent.setup();
    stubAccountFetch(
      profileResponse({
        usedToday: 3,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));

    await screen.findByText("个人资料信息");
    const accountDialog = screen.getByRole("dialog", { name: "设置" });
    const scrollArea = accountDialog.querySelector('[data-slot="scroll-area"]');
    expect(scrollArea).toBeInTheDocument();
    expect(scrollArea?.querySelector('[data-slot="scroll-area-viewport"]')).toHaveClass("overflow-x-hidden");
    expect(scrollArea?.querySelector("main")).toHaveClass("p-4", "sm:p-6");
    expect(scrollArea?.querySelector("main")).not.toHaveClass("overflow-y-auto");
    expect(screen.queryByText("今日生成次数")).not.toBeInTheDocument();
    expect(screen.queryByText("今日 3 次")).not.toBeInTheDocument();
    expect(screen.queryByText("不限额")).not.toBeInTheDocument();
  });

  it("does not show today's generation quota for guest users", async () => {
    const user = userEvent.setup();
    stubAccountFetch(
      profileResponse(
        {
          usedToday: 3,
          limit: 5,
          remaining: 2,
          windowSeconds: 86400,
          limited: true,
          scope: "visitor",
        },
        {
          ...baseUser,
          id: "guest-user",
          email: "guest@example.edu",
          displayName: "Guest",
        },
      ),
    );

    renderAccountDialog({
      onNavigate: () => {},
      initialUser: {
        ...baseUser,
        id: "guest-user",
        email: "guest@example.edu",
        displayName: "Guest",
      },
    });
    await user.click(screen.getByRole("button", { name: "账号" }));

    await screen.findByText("个人资料信息");
    await waitFor(() => {
      expect(screen.queryByText("今日生成次数")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("今日 3 / 5 次")).not.toBeInTheDocument();
    expect(screen.queryByText("剩余 2 次")).not.toBeInTheDocument();
  });

  it("updates the account profile through the profile API", async () => {
    const user = userEvent.setup();
    const fetchMock = stubAccountFetch(
      profileResponse({
        usedToday: 0,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));
    const accountDialog = await screen.findByRole("dialog", { name: "设置" });
    const displayNameInput = await within(accountDialog).findByLabelText("昵称");

    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Teaching Assistant");
    fireEvent.click(within(accountDialog).getByRole("button", { name: "保存资料" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/profile"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            displayName: "Teaching Assistant",
            avatarUrl: null,
          }),
        }),
      );
    });
  });

  it("manages real TOTP MFA and session revocation through account APIs", async () => {
    const user = userEvent.setup();
    const fetchMock = stubAccountFetch(
      profileResponse({
        usedToday: 0,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));
    const accountDialog = await screen.findByRole("dialog", { name: "设置" });
    await user.click(await within(accountDialog).findByRole("tab", { name: "安全设置" }));

    expect((await within(accountDialog).findAllByText("MFA 已禁用")).length).toBeGreaterThan(0);
    fireEvent.click(within(accountDialog).getByRole("button", { name: "启用 MFA" }));
    expect(await within(accountDialog).findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/account/mfa/setup"),
      expect.objectContaining({ method: "POST" }),
    );

    const mfaCodeInput = within(accountDialog).getByLabelText("MFA 验证码");
    fireEvent.change(mfaCodeInput, { target: { value: "123456" } });
    await waitFor(() => {
      expect(mfaCodeInput).toHaveValue("123456");
    });
    fireEvent.click(await within(accountDialog).findByRole("button", { name: "确认启用 MFA" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/mfa/confirm"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ code: "123456" }),
        }),
      );
    });
    expect((await within(accountDialog).findAllByText("MFA 已启用")).length).toBeGreaterThan(0);

    fireEvent.change(await within(accountDialog).findByLabelText("停用验证码"), {
      target: { value: "654321" },
    });
    fireEvent.click(await within(accountDialog).findByRole("button", { name: "停用 MFA" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/mfa"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ enabled: false, code: "654321" }),
        }),
      );
    });
    expect((await within(accountDialog).findAllByText("MFA 已禁用")).length).toBeGreaterThan(0);

    fireEvent.click(within(accountDialog).getByRole("button", { name: "退出其他设备" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/sessions/revoke-others"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("logs out through the account dialog and navigates to login", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const fetchMock = stubAccountFetch(
      profileResponse({
        usedToday: 0,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    renderAccountDialog({ onNavigate, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));
    const accountDialog = await screen.findByRole("dialog", { name: "设置" });
    await within(accountDialog).findByText("个人资料信息");
    fireEvent.click(within(accountDialog).getAllByRole("button", { name: "退出登录" })[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/logout"),
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(onNavigate).toHaveBeenCalledWith("/login");
  });
});
