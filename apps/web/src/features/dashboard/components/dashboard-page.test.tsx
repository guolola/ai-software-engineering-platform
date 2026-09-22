// Verifies that the deterministic marketing dashboard mode bypasses platform API loading.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./dashboard-page";

describe("DashboardPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/dashboard?wbdemo");
  });

  it("renders deterministic demo data without requesting project data", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage onNavigate={() => {}} />);

    expect(await screen.findByText("48")).toBeInTheDocument();
    expect(screen.getAllByText("图书馆系统").length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
