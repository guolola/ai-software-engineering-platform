// Owns Sandpack synchronization and the local iframe prototype preview.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useSandpack } from "@codesandbox/sandpack-react";
import { useTranslation } from "react-i18next";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { CircularProgress } from "../../../shared/ui/circular-progress";
import { WebPreviewBody } from "../../../shared/ai-elements/web-preview";
import type { PreviewConsoleLog } from "../lib/preview-console";
import { buildLocalPreviewDocument, previewErrorMessage } from "../lib/preview-runtime";

export function SandpackFileSync({
  files,
}: {
  files: Record<string, string>;
}) {
  const { sandpack } = useSandpack();
  const updateFileRef = useRef(sandpack.updateFile);
  const syncedFilesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    updateFileRef.current = sandpack.updateFile;
  }, [sandpack.updateFile]);

  useEffect(() => {
    const previousFiles = syncedFilesRef.current;
    for (const [path, code] of Object.entries(files)) {
      if (previousFiles[path] !== code) {
        updateFileRef.current(path, code);
      }
    }
    syncedFilesRef.current = { ...files };
  }, [files]);

  return null;
}

export type LocalPrototypePreviewHandle = {
  openPreviewWindow: () => void;
};

export const LocalPrototypePreview = forwardRef<LocalPrototypePreviewHandle, {
  files: Record<string, string>;
  entryFile: string;
  onBuildError?: (message: string) => void;
  onBuildReady?: () => void;
  onBuildStart?: () => void;
  onConsoleLog?: (log: PreviewConsoleLog) => void;
}>(function LocalPrototypePreview(
  {
    files,
    entryFile,
    onBuildError,
    onBuildReady,
    onBuildStart,
    onConsoleLog,
  },
  ref,
) {
  const { t } = useTranslation();
  const buildIndexRef = useRef(0);
  const activeBuildIdRef = useRef("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewState, setPreviewState] = useState<{
    srcDoc: string;
    buildError: string | null;
    runtimeError: string | null;
    ready: boolean;
  }>({
    srcDoc: "",
    buildError: null,
    runtimeError: null,
    ready: false,
  });

  useEffect(() => {
    const buildId = `preview-${Date.now()}-${buildIndexRef.current + 1}`;
    buildIndexRef.current += 1;
    activeBuildIdRef.current = buildId;
    let objectUrls: string[] = [];
    let disposed = false;

    setPreviewState({
      srcDoc: "",
      buildError: null,
      runtimeError: null,
      ready: false,
    });
    onBuildStart?.();

    void buildLocalPreviewDocument(files, entryFile, buildId)
      .then((result) => {
        if (disposed) {
          for (const url of result.objectUrls) {
            URL.revokeObjectURL(url);
          }
          return;
        }
        objectUrls = result.objectUrls;
        setPreviewState({
          srcDoc: result.srcDoc,
          buildError: null,
          runtimeError: null,
          ready: false,
        });
        onBuildReady?.();
      })
      .catch((error) => {
        if (disposed) return;
        const message = previewErrorMessage(error);
        setPreviewState({
          srcDoc: "",
          buildError: message,
          runtimeError: null,
          ready: false,
        });
        onBuildError?.(message);
        onConsoleLog?.({ level: "error", message, timestamp: new Date() });
      });

    return () => {
      disposed = true;
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [entryFile, files, onBuildError, onBuildReady, onBuildStart, onConsoleLog]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as {
        source?: string;
        buildId?: string;
        type?: string;
        message?: string;
        level?: string;
        timestamp?: number;
      };

      if (
        !data || typeof data !== "object" ||
        event.source !== iframeRef.current?.contentWindow ||
        data.source !== "local-prototype-preview" ||
        data.buildId !== activeBuildIdRef.current
      ) {
        return;
      }

      if (data.type === "console") {
        if ((data.level === "log" || data.level === "warn" || data.level === "error") && typeof data.message === "string" && Number.isFinite(data.timestamp)) {
          onConsoleLog?.({ level: data.level, message: data.message, timestamp: new Date(data.timestamp!) });
        }
        return;
      }

      if (data.type === "ready") {
        setPreviewState((current) => ({
          ...current,
          ready: true,
          runtimeError: null,
        }));
        return;
      }

      if (data.type === "error") {
        const message = typeof data.message === "string" ? data.message : "预览运行出错";
        setPreviewState((current) => ({
          ...current,
          ready: false,
          runtimeError: message,
        }));
        onBuildError?.(message);
        onConsoleLog?.({ level: "error", message, timestamp: new Date() });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onBuildError, onConsoleLog]);

  const previewMessage =
    previewState.buildError ??
    previewState.runtimeError ??
    (previewState.ready ? null : t("code.preview.compiling"));
  const isError = Boolean(previewState.buildError || previewState.runtimeError);

  const openPreviewWindow = useCallback(() => {
    if (!previewState.srcDoc) {
      floatingAlert.error(t("code.preview.notReady"));
      return;
    }

    const blobUrl = URL.createObjectURL(
      new Blob([previewState.srcDoc], { type: "text/html" }),
    );
    // noopener can return null after a successful open; keep the document alive for navigation.
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }, [previewState.srcDoc, t]);

  useImperativeHandle(ref, () => ({ openPreviewWindow }), [openPreviewWindow]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background [&>div]:min-h-0">
      {isError && (
        <div
          data-testid="local-preview-status"
          role="alert"
          className="absolute left-3 right-3 top-3 z-10 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-sm"
        >
          {previewMessage}
        </div>
      )}
      {/* Empty srcDoc navigation can overwrite a fast cached build when this page remounts. */}
      <WebPreviewBody
        ref={iframeRef}
        title="Prototype Preview"
        sandbox="allow-scripts allow-forms"
        src="about:blank"
        srcDoc={previewState.srcDoc || undefined}
        className="h-full w-full bg-white"
      />
      {!previewState.ready && !isError && (
        <div
          data-testid="local-preview-status"
          role="status"
          aria-busy="true"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-background px-4 py-10"
        >
          {/* Build percentages are unavailable; a rotating arc represents indeterminate loading. */}
          <CircularProgress
            role="progressbar"
            aria-label={t("code.preview.compiling")}
            size={110}
            strokeWidth={8}
            value={25}
            className="motion-safe:animate-spin"
            progressClassName="stroke-primary transition-all duration-300 ease-in-out"
            progressBgClassName="stroke-primary/10"
          />
          <span className="text-xs font-medium text-muted-foreground">{previewMessage}</span>
        </div>
      )}
    </div>
  );
});
