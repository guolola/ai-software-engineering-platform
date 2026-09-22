// Verifies public authentication page navigation and non-blocking feedback.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n";
import { i18n } from "../../../shared/i18n";
import { FloatingAlertProvider } from "../../../shared/ui/floating-alert";
import { AuthPage } from "./auth-page";

afterEach(async () => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
  await i18n.changeLanguage("zh-CN");
});

it("redirects to login after resetting a password from a reset link", async () => {
  await i18n.changeLanguage("zh-CN");
  window.history.pushState({}, "", "/reset-password?token=reset-token");
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const onNavigate = vi.fn();
  const user = userEvent.setup();

  render(
    <AppI18nProvider>
      <AuthPage path="/reset-password" onNavigate={onNavigate} />
    </AppI18nProvider>,
  );

  await user.type(screen.getByLabelText("新密码"), "new-password-123");
  await user.click(screen.getByRole("button", { name: "重置密码" }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/reset-password"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "reset-token", newPassword: "new-password-123" }),
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith("/login");
  });
});

it("shows login-required feedback in the floating alert layer", async () => {
  await i18n.changeLanguage("zh-CN");
  window.history.pushState({}, "", "/login?redirect=%2Fprojects&reason=login-required");

  render(
    <AppI18nProvider>
      <FloatingAlertProvider>
        <AuthPage path="/login" onNavigate={vi.fn()} />
      </FloatingAlertProvider>
    </AppI18nProvider>,
  );

  const notice = await screen.findByText("此页面需要登录，请登录后继续。");
  expect(notice.closest('[aria-live="polite"]')).toHaveClass("fixed");
  expect(screen.getByTestId("auth-form-panel")).not.toContainElement(notice);
});

it("shows a localized fixed alert for login network failures without changing the form layout", async () => {
  await i18n.changeLanguage("zh-CN");
  window.history.pushState({}, "", "/login");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  const user = userEvent.setup();

  render(
    <AppI18nProvider>
      <FloatingAlertProvider>
        <AuthPage path="/login" onNavigate={vi.fn()} />
      </FloatingAlertProvider>
    </AppI18nProvider>,
  );

  await user.type(screen.getByLabelText("邮箱或用户名"), "teacher@example.edu");
  await user.type(screen.getByLabelText("密码"), "password-123");
  await user.click(screen.getByRole("button", { name: "登录" }));

  const message = await screen.findByText("无法连接服务，请检查网络或确认服务已启动后重试。");
  expect(message.closest('[aria-live="polite"]')).toHaveClass("fixed");
  expect(screen.getByTestId("auth-form-panel")).not.toContainElement(message);
  expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
});

it("keeps terms validation next to the registration checkbox", async () => {
  await i18n.changeLanguage("zh-CN");
  window.history.pushState({}, "", "/register");
  const user = userEvent.setup();

  render(
    <AppI18nProvider>
      <FloatingAlertProvider>
        <AuthPage path="/register" onNavigate={vi.fn()} />
      </FloatingAlertProvider>
    </AppI18nProvider>,
  );

  await user.type(screen.getByLabelText("邮箱"), "teacher@example.edu");
  await user.type(screen.getByLabelText("密码"), "password-123");
  await user.type(screen.getByLabelText("用户名"), "teacher_001");
  await user.type(screen.getByLabelText("昵称"), "王老师");
  await user.click(screen.getByRole("button", { name: "注册并发送验证邮件" }));
  const error = screen.getByText("请先阅读并同意服务条款。");
  expect(error).toHaveAttribute("id", "terms-error");
  expect(screen.getByRole("checkbox", { name: /服务条款/ })).toHaveAttribute("aria-describedby", "terms-error");
  expect(error.closest('[aria-live="polite"]')).toBeNull();
});

it("keeps all six MFA code slots inside the mobile form width", async () => {
  await i18n.changeLanguage("zh-CN");
  window.history.pushState({}, "", "/login");
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({
      mfaChallenge: {
        challengeId: "challenge-1",
        expiresAt: "2026-09-22T12:00:00.000Z",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ));
  const user = userEvent.setup();
  const { container } = render(
    <AppI18nProvider>
      <FloatingAlertProvider>
        <AuthPage path="/login" onNavigate={vi.fn()} />
      </FloatingAlertProvider>
    </AppI18nProvider>,
  );

  await user.type(screen.getByLabelText("邮箱或用户名"), "teacher@example.edu");
  await user.type(screen.getByLabelText("密码"), "password-123");
  await user.click(screen.getByRole("button", { name: "登录" }));

  await waitFor(() => {
    expect(container.querySelector('[data-slot="input-otp-group"]')).toBeInTheDocument();
  });
  const group = container.querySelector('[data-slot="input-otp-group"]')!;
  expect(group).toHaveClass("w-full", "min-w-0", "gap-1", "sm:gap-4");
  const slots = group.querySelectorAll('[data-slot="input-otp-slot"]');
  expect(slots).toHaveLength(6);
  slots.forEach((slot) => expect(slot).toHaveClass("size-9", "sm:size-10"));
  // input-otp mirrors the selection on 0/10/50 ms timers; let them finish before jsdom teardown.
  await new Promise((resolve) => window.setTimeout(resolve, 60));
});
