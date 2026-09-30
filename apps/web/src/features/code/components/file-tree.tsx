// Adapts prototype paths and workspace state to the installed shadcn-tree-view component.
import { FileCode2, Folder, FolderOpen } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TreeView, type TreeDataItem } from "../../../shared/ui/tree-view";
import type { FileTreeNode } from "../hooks/use-prototype-files";

function toTreeItems(nodes: FileTreeNode[]): TreeDataItem[] {
  return nodes.map((node) => ({
    id: node.path,
    name: node.name,
    children: node.type === "directory" ? toTreeItems(node.children) : undefined,
    draggable: false,
    droppable: false,
    className: "min-w-0 h-8 py-1 text-xs focus-visible:outline-2 focus-visible:outline-ring",
  }));
}

export function FileTree({ nodes, activeFile, expandedDirs, onToggleDirectory, onSelectFile }: {
  nodes: FileTreeNode[];
  activeFile: string;
  expandedDirs: Set<string>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const { t } = useTranslation();
  const data = useMemo(() => toTreeItems(nodes), [nodes]);
  // The upstream selection backdrop uses a negative z-index; isolate it from the sidebar background.
  return (
    <TreeView
      data={data}
      className="isolate"
      aria-label={t("code.panes.files")}
      selectedItemId={activeFile}
      expandedItemIds={[...expandedDirs]}
      onExpandedItemChange={(path) => onToggleDirectory(path)}
      onSelectChange={(item) => { if (item && !item.children) onSelectFile(item.id); }}
      renderItem={({ item, isLeaf, isOpen }) => {
        const Icon = isLeaf ? FileCode2 : isOpen ? FolderOpen : Folder;
        return <>
          <Icon className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
          <span title={item.id} data-testid={`file-tree-${isLeaf ? "file" : "dir"}-${item.id}`} className="min-w-0 flex-1 truncate text-left text-xs">{item.name}</span>
        </>;
      }}
    />
  );
}
