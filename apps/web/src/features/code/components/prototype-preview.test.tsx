// Verifies official iframe/Console integration and the isolated build message contract.
import { useCallback, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebPreview, WebPreviewConsole } from "../../../shared/ai-elements/web-preview";
import { AppI18nProvider } from "../../../shared/i18n";
import type { PreviewConsoleLog } from "../lib/preview-console";
import { LocalPrototypePreview } from "./prototype-preview";

const build = vi.hoisted(() => vi.fn(async (_files: Record<string, string>, _entry: string, buildId: string) => ({ srcDoc: `<html><body>${buildId}</body></html>`, objectUrls: [] })));
vi.mock("../lib/preview-runtime", () => ({ buildLocalPreviewDocument: build, previewErrorMessage: (error: Error) => error.message }));

function Harness({ files, onError }: { files: Record<string, string>; onError: (message: string) => void }) {
  const [logs, setLogs] = useState<PreviewConsoleLog[]>([]);
  const clearLogs = useCallback(() => setLogs([]), []);
  const appendLog = useCallback((log: PreviewConsoleLog) => setLogs(current => [...current, log]), []);
  return <AppI18nProvider><WebPreview><LocalPrototypePreview files={files} entryFile="/src/main.ts" onBuildError={onError} onBuildStart={clearLogs} onConsoleLog={appendLog} /><WebPreviewConsole logs={logs} /></WebPreview></AppI18nProvider>;
}

const initialFiles = { "/src/main.ts": "first build" };
const nextFiles = { "/src/main.ts": "second build" };
function send(source: Window | null, buildId: string, data: Record<string, unknown>) {
  act(() => window.dispatchEvent(new MessageEvent("message", { source, data: { source: "local-prototype-preview", buildId, ...data } })));
}

describe("LocalPrototypePreview", () => {
  beforeEach(() => build.mockClear());

  it("shows circular loading until the current iframe is ready and restores it for a rebuild", async () => {
    const onError = vi.fn();
    const { rerender } = render(<Harness files={initialFiles} onError={onError} />);
    const iframe = screen.getByTitle("Prototype Preview") as HTMLIFrameElement;
    expect(iframe).not.toHaveAttribute("srcdoc");
    const progress = screen.getByRole("progressbar", { name: "预览正在编译" });
    expect(progress).toBeVisible();
    expect(progress).not.toHaveAttribute("aria-valuenow");
    expect(progress).toHaveClass("motion-safe:animate-spin");
    expect(screen.getByTestId("local-preview-status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("65%")).not.toBeInTheDocument();
    await waitFor(() => expect(iframe.srcdoc).toContain(build.mock.calls.at(-1)![2]));
    const buildId = build.mock.calls.at(-1)![2];
    send(iframe.contentWindow, "expired", { type: "ready" });
    expect(progress).toBeVisible();
    send(iframe.contentWindow, buildId, { type: "ready" });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("local-preview-status")).not.toBeInTheDocument();
    rerender(<Harness files={nextFiles} onError={onError} />);
    expect(screen.getByRole("progressbar", { name: "预览正在编译" })).toBeVisible();
    expect(screen.getByTitle("Prototype Preview")).toBe(iframe);
  });

  it("replaces loading with the build error when compilation fails", async () => {
    build.mockRejectedValueOnce(new Error("cannot resolve module"));
    const onError = vi.fn();
    render(<Harness files={initialFiles} onError={onError} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot resolve module");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith("cannot resolve module");
    expect(screen.getByTitle("Prototype Preview")).toHaveAttribute("sandbox", "allow-scripts allow-forms");
  });

  it("accepts only current iframe/build logs and clears the official Console for a new build", async () => {
    const onError = vi.fn();
    const { rerender } = render(<Harness files={initialFiles} onError={onError} />);
    const iframe = screen.getByTitle("Prototype Preview") as HTMLIFrameElement;
    await waitFor(() => expect(iframe.srcdoc).toContain(build.mock.calls.at(-1)![2]));
    const buildId = build.mock.calls.at(-1)![2];
    const log = { type: "console", level: "warn", message: "current warning", timestamp: 1234 };
    expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-forms");
    expect(screen.getByRole("button", { name: "Console" })).toHaveAttribute("aria-expanded", "false");
    send(window, buildId, { ...log, message: "other iframe" });
    send(iframe.contentWindow, "expired", { ...log, message: "expired build" });
    send(iframe.contentWindow, buildId, { ...log, level: "invalid", message: "invalid level" });
    send(iframe.contentWindow, buildId, { ...log, timestamp: Infinity, message: "invalid timestamp" });
    send(iframe.contentWindow, buildId, log);
    fireEvent.click(screen.getByRole("button", { name: "Console" }));
    expect(await screen.findByText("current warning", { exact: false })).toBeVisible();
    for (const ignored of ["other iframe", "expired build", "invalid level", "invalid timestamp"]) expect(screen.queryByText(ignored, { exact: false })).not.toBeInTheDocument();
    rerender(<Harness files={nextFiles} onError={onError} />);
    await waitFor(() => expect(build).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("current warning", { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText("No console output")).toBeVisible();
    send(iframe.contentWindow, buildId, { ...log, message: "late log" });
    expect(screen.queryByText("late log", { exact: false })).not.toBeInTheDocument();
    expect(screen.getByTitle("Prototype Preview")).toBe(iframe);
  });

  it("routes current runtime errors to diagnostics and Console while ignoring expired errors", async () => {
    const onError = vi.fn();
    render(<Harness files={initialFiles} onError={onError} />);
    const iframe = screen.getByTitle("Prototype Preview") as HTMLIFrameElement;
    await waitFor(() => expect(iframe.srcdoc).toContain(build.mock.calls.at(-1)![2]));
    const buildId = build.mock.calls.at(-1)![2];
    send(iframe.contentWindow, "expired", { type: "error", message: "old failure" });
    expect(onError).not.toHaveBeenCalled();
    send(iframe.contentWindow, buildId, { type: "ready" });
    expect(screen.queryByTestId("local-preview-status")).not.toBeInTheDocument();
    send(iframe.contentWindow, buildId, { type: "error", message: "runtime failure" });
    expect(screen.getByTestId("local-preview-status")).toHaveTextContent("runtime failure");
    expect(onError).toHaveBeenCalledWith("runtime failure");
    fireEvent.click(screen.getByRole("button", { name: "Console" }));
    expect(screen.getAllByText("runtime failure", { exact: false })).toHaveLength(2);
  });
});
