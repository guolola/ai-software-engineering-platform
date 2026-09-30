// Adds code/preview navigation around the installed official AI Elements WebPreview.
import { ExternalLink, Loader2, Maximize2, Minimize2, Play, RefreshCw } from "lucide-react";
import { useState, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { WebPreview, WebPreviewConsole, WebPreviewNavigation, WebPreviewNavigationButton, WebPreviewUrl } from "../../../shared/ai-elements/web-preview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/tabs";
import { cn } from "../../../shared/ui/utils";
import { usePreviewFullscreen } from "../hooks/use-preview-fullscreen";
import type { PreviewConsoleLog } from "../lib/preview-console";
import type { LocalPrototypePreviewHandle } from "./prototype-preview";

export function PrototypeWorkspace({ editor, preview, previewRef, logs, canRun, building, pending, appName, onRunPreview }: {
  editor: ReactNode;
  preview: ReactNode;
  previewRef: RefObject<LocalPrototypePreviewHandle | null>;
  logs: PreviewConsoleLog[];
  canRun: boolean;
  building: boolean;
  pending: boolean;
  appName?: string;
  onRunPreview: () => void;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<"code" | "preview">("preview");
  const [codeVisited, setCodeVisited] = useState(false);
  const { rootRef, expanded, fullscreen, toggleFullscreen } = usePreviewFullscreen();
  const run = () => {
    if (!canRun || building) return;
    onRunPreview();
    setView("preview");
  };
  return (
    <div ref={rootRef} data-testid="code-workspace-frame" data-fullscreen={fullscreen} className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs", expanded && "fixed inset-0 z-50 rounded-none", "[&:fullscreen]:rounded-none")}>
      <WebPreview defaultUrl="/" className="min-h-0 min-w-0 rounded-none border-0 text-foreground">
        <Tabs value={view} onValueChange={(value) => { if (value === "code" || value === "preview") { setView(value); if (value === "code") setCodeVisited(true); } }} className="min-h-0 min-w-0 flex-1 flex-col gap-0">
          <WebPreviewNavigation data-testid="code-preview-navigation" className="min-w-0 shrink-0 flex-wrap gap-2">
            <TabsList aria-label={t("code.views.label")} className="h-8 shrink-0">
              <TabsTrigger value="code" className="px-3 text-xs">{t("code.views.code")}</TabsTrigger>
              <TabsTrigger value="preview" className="px-3 text-xs">{t("code.views.preview")}</TabsTrigger>
            </TabsList>
            <WebPreviewUrl readOnly value="/" aria-label={t("code.preview.address")} className="h-8 min-w-0 flex-1 text-xs" />
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <WebPreviewNavigationButton tooltip={t(view === "preview" ? "code.preview.refresh" : "code.actions.runPreview")} aria-label={t("code.actions.runPreview")} onClick={run} disabled={!canRun || building}>
                {building ? <Loader2 className="size-4 animate-spin" /> : view === "preview" ? <RefreshCw className="size-4" /> : <Play className="size-4" />}
              </WebPreviewNavigationButton>
              <WebPreviewNavigationButton tooltip={t("code.preview.openWindow")} aria-label={t("code.preview.openWindow")} onClick={() => previewRef.current?.openPreviewWindow()}>
                <ExternalLink className="size-4" />
              </WebPreviewNavigationButton>
              <WebPreviewNavigationButton tooltip={t(fullscreen ? "code.preview.exitFullscreen" : "code.preview.fullscreen")} aria-label={t(fullscreen ? "code.preview.exitFullscreen" : "code.preview.fullscreen")} onClick={() => void toggleFullscreen()}>
                {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </WebPreviewNavigationButton>
            </div>
          </WebPreviewNavigation>
          {appName && <div className="shrink-0 truncate border-b border-border px-3 py-1.5 text-xs text-muted-foreground">{appName}</div>}
          {pending && <div role="status" className="shrink-0 border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t("code.status.pending.message")}</div>}
          <div data-testid="code-workspace-content" className={cn("flex h-[560px] min-h-0 min-w-0 shrink-0 flex-col lg:h-[680px]", fullscreen && "h-auto flex-1 shrink lg:h-auto")}>
            {/* Keep the iframe and visited editor mounted: tab changes must not reset either view. */}
            <TabsContent value="code" keepMounted className="h-full min-h-0 min-w-0 overflow-hidden data-[hidden]:hidden">{codeVisited && editor}</TabsContent>
            <TabsContent value="preview" keepMounted className="h-full min-h-0 min-w-0 overflow-hidden data-[hidden]:hidden">
              <section data-testid="code-preview-region" aria-label={t("code.panes.preview")} className="flex h-full w-full min-h-0 min-w-0 flex-col">{preview}</section>
            </TabsContent>
          </div>
          <WebPreviewConsole logs={logs} className={cn("shrink-0", view !== "preview" && "hidden")} />
        </Tabs>
      </WebPreview>
    </div>
  );
}
