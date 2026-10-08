// Verifies payment-style records retain an empty table and credential revocation guards.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { ConnectionRecordsTable } from "./connection-records-table";
import type { Connection } from "../services/mcp-api";

const connection: Connection = { id: "pat-1", name: "我的工具", kind: "pat", projectIds: [], projectScope: "account", createdAt: "2026-01-01", expiresAt: "2099-01-01", revokedAt: null, lastUsedAt: null };

it("shows the payment order table headers and empty row before any connections exist", () => {
  render(<AppI18nProvider><ConnectionRecordsTable connections={[]} projects={[]} disabled={false} stale={false} onRevoke={vi.fn()} /></AppI18nProvider>);
  const table = screen.getByRole("table", { name: "连接记录" });
  expect(table).toHaveClass("min-w-[760px]", "text-left", "leading-5");
  expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
  expect(table.querySelector("thead")).toHaveClass("bg-muted/40");
  expect(within(table).getByText("还没有外部工具连接。")).toHaveAttribute("colspan", "6");
  expect(screen.getByText("0 条")).toBeInTheDocument();
});

it("shows account scope and passes the selected connection to revocation while guarding revoked records", async () => {
  const user = userEvent.setup();
  const onRevoke = vi.fn();
  render(<AppI18nProvider><ConnectionRecordsTable connections={[connection, { ...connection, id: "revoked", name: "旧工具", revokedAt: "2026-01-02" }]} projects={[]} disabled={false} stale={false} onRevoke={onRevoke} /></AppI18nProvider>);
  expect(screen.getAllByText("账号可访问的全部项目")).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "撤销 我的工具" }));
  expect(onRevoke).toHaveBeenCalledWith(connection);
  expect(screen.getByRole("button", { name: "撤销 旧工具" })).toBeDisabled();
});
