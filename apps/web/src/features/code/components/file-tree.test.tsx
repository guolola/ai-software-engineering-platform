// Verifies path selection and controlled expansion through the upstream TreeView adapter.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n";
import { usePrototypeFiles } from "../hooks/use-prototype-files";
import { FileTree } from "./file-tree";

const defaultFiles = {};
const onFileChange = vi.fn();
function Browser({ files }: { files: Record<string, string> }) {
  const state = usePrototypeFiles({ defaultFiles, generatedFiles: files, entryFile: "/src/a/index.ts", onFileChange });
  return <>
    <output data-testid="active-file">{state.activeFile}</output>
    <AppI18nProvider><FileTree nodes={state.fileTree} activeFile={state.activeFile} expandedDirs={state.expandedDirs} onSelectFile={state.setActiveFile} onToggleDirectory={state.toggleDirectory} /></AppI18nProvider>
  </>;
}

describe("prototype TreeView adapter", () => {
  const files = { "/src/a/index.ts": "a", "/src/b/index.ts": "b", "/index.ts": "root" };
  it("uses complete paths for duplicate names and supports keyboard file selection", () => {
    render(<Browser files={files} />);
    expect(screen.getByTestId("file-tree-file-/src/a/index.ts").closest('[role="treeitem"]')).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByTestId("file-tree-dir-/src/b"));
    const otherFile = screen.getByTestId("file-tree-file-/src/b/index.ts").closest('[role="treeitem"]')!;
    fireEvent.keyDown(otherFile, { key: "Enter" });
    expect(screen.getByTestId("active-file")).toHaveTextContent("/src/b/index.ts");
    expect(otherFile).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByTestId("file-tree-file-/index.ts").closest('[role="treeitem"]')!, { key: " " });
    expect(screen.getByTestId("active-file")).toHaveTextContent(/^\/index.ts$/);
  });

  it("toggles folders without changing the active file and retains expansion on rerender", () => {
    const { rerender } = render(<Browser files={files} />);
    const directory = screen.getByTestId("file-tree-dir-/src/a");
    fireEvent.click(directory);
    expect(screen.queryByTestId("file-tree-file-/src/a/index.ts")).not.toBeInTheDocument();
    expect(screen.getByTestId("active-file")).toHaveTextContent("/src/a/index.ts");
    rerender(<Browser files={{ ...files, "/another.ts": "another" }} />);
    expect(screen.queryByTestId("file-tree-file-/src/a/index.ts")).not.toBeInTheDocument();
    fireEvent.click(directory);
    expect(screen.getByTestId("file-tree-file-/src/a/index.ts")).toBeInTheDocument();
  });

  it("keeps valid selections after regeneration and reveals the fallback file ancestors", async () => {
    const { rerender } = render(<Browser files={files} />);
    fireEvent.click(screen.getByTestId("file-tree-file-/index.ts"));
    rerender(<Browser files={{ ...files, "/extra.ts": "extra" }} />);
    expect(screen.getByTestId("active-file")).toHaveTextContent(/^\/index.ts$/);
    rerender(<Browser files={{ "/src/new/deep/file.ts": "new" }} />);
    await waitFor(() => expect(screen.getByTestId("file-tree-file-/src/new/deep/file.ts").closest('[role="treeitem"]')).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByTestId("active-file")).toHaveTextContent("/src/new/deep/file.ts");
  });
});
