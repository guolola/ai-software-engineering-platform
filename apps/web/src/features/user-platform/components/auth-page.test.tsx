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
