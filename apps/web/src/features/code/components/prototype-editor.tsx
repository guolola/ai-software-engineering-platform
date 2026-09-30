// Composes the prototype file browser and editor inside the WebPreview code tab.
import { FolderTree } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCompactViewport } from "../../workspace-shell/hooks/use-compact-viewport";
import type { FileTreeNode } from "../hooks/use-prototype-files";
import { fileLabel } from "../lib/file-paths";
import { Button } from "../../../shared/ui/button";
import { cn } from "../../../shared/ui/utils";
import { EditorBridge, MonacoFileModelSync } from "./file-editor";
import { FileTree } from "./file-tree";

export function PrototypeEditor({ files, activeFile, sortedFiles, fileTree, expandedDirs, onSelectFile, onToggleDirectory, onChange }: {
  files: Record<string, string>;
  activeFile: string;
  sortedFiles: string[];
  fileTree: FileTreeNode[];
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  onChange: (path: string, value: string) => void;
}) {
  const { t } = useTranslation();
  const compact = useCompactViewport();
  return (
    <section data-testid="code-editor-region" aria-label={t("code.panes.editor")} className="flex h-full w-full min-h-0 min-w-0 flex-col">
      <MonacoFileModelSync files={files} />
      <div className={cn("grid min-h-0 min-w-0 flex-1", compact ? "grid-cols-1" : "grid-cols-[210px_minmax(0,1fr)]")}>
        {!compact && <aside className="flex min-h-0 min-w-0 flex-col border-r border-border bg-sidebar">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-xs font-semibold text-muted-foreground"><FolderTree className="size-3.5" />{t("code.panes.files")}</div>
          <div className="min-h-0 flex-1 overflow-auto py-2">
            <FileTree nodes={fileTree} activeFile={activeFile} expandedDirs={expandedDirs} onToggleDirectory={onToggleDirectory} onSelectFile={onSelectFile} />
          </div>
        </aside>}
        <div className="flex min-h-0 min-w-0 flex-col">
          <div data-testid="code-file-tabs" className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-border bg-card px-2 pt-1 [scrollbar-width:thin]">
            {sortedFiles.map(path => <Button key={path} variant="ghost" type="button" aria-pressed={activeFile === path} onClick={() => onSelectFile(path)} title={path} className={cn("h-8 w-32 shrink-0 truncate rounded-b-none border border-b-0 px-3 text-xs", activeFile === path ? "border-border bg-background text-foreground" : "border-transparent text-muted-foreground hover:bg-muted")}>
              {fileLabel(path)}
            </Button>)}
          </div>
          <div className="min-h-0 flex-1 bg-muted"><EditorBridge activeFile={activeFile} files={files} onChange={onChange} /></div>
        </div>
      </div>
    </section>
  );
}
