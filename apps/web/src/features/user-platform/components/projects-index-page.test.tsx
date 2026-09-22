// Covers project index card background rendering without changing navigation behavior.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedRouteSessionProvider } from "./authenticated-route-session";
import { ProjectsIndexPage } from "./projects-index-page";
import { formatProjectDateTimeMinute } from "../lib/project-presentation";

describe("ProjectsIndexPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders project cards with resolved background images and accessible entry actions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === "/api/projects") {
        return new Response(
          JSON.stringify({
            projects: [
              {
                id: "project-booking",
                name: "课程预约系统",
                description: "用于课程实验的预约项目",
                visibility: "team",
                status: "active",
                ownerUserId: "owner-user",
                ownerDisplayName: "Owner User",
                backgroundKey: "booking",
                updatedAt: "2026-06-21T08:09:30.000Z",
                memberCount: 1,
                memberPreviews: [
                  {
                    id: "member-owner",
                    userId: "owner-user",
                    displayName: "Owner User",
                    role: "owner",
                    status: "active",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthenticatedRouteSessionProvider
        value={{
          user: {
            id: "owner-user",
            email: "owner@example.com",
            username: "owner",
            displayName: "Owner User",
            status: "active",
            emailVerified: true,
            mfaEnabled: false,
          },
          session: {
            id: "session-a",
            userId: "owner-user",
            createdAt: "2026-06-21T00:00:00.000Z",
            expiresAt: "2026-06-28T00:00:00.000Z",
            lastSeenAt: "2026-06-21T00:00:00.000Z",
            ipAddress: "127.0.0.1",
            userAgent: "vitest",
          },
        }}
      >
        <ProjectsIndexPage onNavigate={() => {}} />
      </AuthenticatedRouteSessionProvider>,
    );

    const card = await screen.findByRole("article");
    const filterPanel = screen.getByTestId("projects-filter-panel");
    expect(within(filterPanel).getByRole("group", { name: "项目范围" })).toHaveClass(
      "grid-cols-4",
      "min-w-0",
    );
    expect(within(filterPanel).getByPlaceholderText("搜索项目、成员...").closest('[data-slot="input-group"]')).toHaveClass(
      "min-w-0",
      "flex-1",
    );
    expect(within(filterPanel).getByLabelText("排序方式")).toHaveClass("w-28", "shrink-0");
    expect(card).toHaveAttribute("data-slot", "perspective-card");
    expect(card).toHaveAttribute("data-background-key", "booking");
    expect(within(card).getByRole("button", { name: /进入项目/u })).toBeInTheDocument();
    expect(card).toHaveTextContent(`最近更新：${formatProjectDateTimeMinute("2026-06-21T08:09:30.000Z")}`);
    expect(card).not.toHaveTextContent(":30");
    expect(card.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("57_booking"),
    );
    const memberTrigger = within(card).getByLabelText("成员头像 Owner User");
    expect(memberTrigger).toHaveAttribute("tabindex", "0");
    await userEvent.hover(memberTrigger);
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("Owner User")).toBeInTheDocument();
    expect(within(tooltip).getByText("所有者")).toBeInTheDocument();
  });
});
