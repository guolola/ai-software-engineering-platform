// Composes the prototype file browser and editor inside the WebPreview code tab.
import { FolderTree } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FileTreeNode } from "../hooks/use-prototype-files";
import { EditorBridge, MonacoFileModelSync } from "./file-editor";
import { FileTree } from "./file-tree";

export function PrototypeEditor({ files, activeFile, fileTree, expandedDirs, onSelectFile, onToggleDirectory, onChange }: {
  files: Record<string, string>;
  activeFile: string;
  fileTree: FileTreeNode[];
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  onChange: (path: string, value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <section data-testid="code-editor-region" aria-label={t("code.panes.editor")} className="flex h-full w-full min-h-0 min-w-0 flex-col">
      <MonacoFileModelSync files={files} />
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[210px_minmax(0,1fr)]">
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-border bg-sidebar">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-xs font-semibold text-muted-foreground"><FolderTree className="size-3.5" />{t("code.panes.files")}</div>
          <div className="min-h-0 flex-1 overflow-auto py-2">
            <FileTree nodes={fileTree} activeFile={activeFile} expandedDirs={expandedDirs} onToggleDirectory={onToggleDirectory} onSelectFile={onSelectFile} />
          </div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="min-h-0 flex-1 bg-muted"><EditorBridge activeFile={activeFile} files={files} onChange={onChange} /></div>
        </div>
      </div>
    </section>
  );
}
