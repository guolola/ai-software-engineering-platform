// Renders the code generation workspace, including model selection, file browser, and preview actions.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer, PageHeader } from "../../../shared/template/layout/page";
import { SandpackProvider } from "@codesandbox/sandpack-react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { ModelPicker } from "../../../shared/ui/model-picker";
import {
  normalizeProviderModelCapability,
} from "../../../shared/lib/provider-model-display";
import {
  loadUserSettings,
  patchUserSettings,
  USER_SETTINGS_CHANGED_EVENT,
} from "../../../shared/lib/user-settings";
import { formatCodeDiagnosticSummary } from "../../../shared/lib/code-diagnostics";
import { DEFAULT_FILES } from "../lib/default-prototype-files";
import { isMonacoManualCancelation } from "../lib/monaco-extra-libs";
import { CodeStatusDialog } from "./code-status-dialog";
import { PrototypeEditor } from "./prototype-editor";
import { PrototypeWorkspace } from "./prototype-workspace";
import type { PreviewConsoleLog } from "../lib/preview-console";
import {
  LocalPrototypePreview,
  SandpackFileSync,
  type LocalPrototypePreviewHandle,
} from "./prototype-preview";
import { useWorkspaceSession } from "../../workspace-session/state";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { usePrototypeFiles } from "../hooks/use-prototype-files";
import {
  FeedbackReopenButton,
  type FeedbackDialogState,
} from "../../../shared/ui/feedback-dialog";

export function CodeGenerationPage() {
  const { t } = useTranslation();
  const {
    requirementText,
    designModels,
    codeSpec,
    codeFiles,
    codeEditVersion,
    codeEntryFile,
    codeDependencies,
    codeDiagnostics,
    generating,
    runProgress,
    runMessage,
    generateCodePrototype,
    updateCodeFile,
    recordCodePreviewDiagnostic,
    clearCodePreviewDiagnostics,
    generationModelBlockedReason,
  } = useWorkspaceSession();
  const { openDesignHome, openSystemRequirements } = useWorkspaceShell();
  const [defaultModel, setDefaultModel] = useState(
    () => loadUserSettings().defaultModel,
  );
  const [providerModelCapabilities, setProviderModelCapabilities] = useState(
    () => loadUserSettings().providerModelCapabilities,
  );
  const {
    files,
    activeFile,
    setActiveFile,
    expandedDirs,
    sortedFiles,
    fileTree,
    updateFile,
    toggleDirectory,
  } = usePrototypeFiles({
    defaultFiles: DEFAULT_FILES,
    generatedFiles: codeFiles,
    entryFile: codeEntryFile,
    onFileChange: updateCodeFile,
  });
  const previewRef = useRef<LocalPrototypePreviewHandle | null>(null);
  const previewEditVersionRef = useRef(codeEditVersion);
  const manualPreviewEditPendingRef = useRef(false);
  const [previewFiles, setPreviewFiles] = useState<Record<string, string>>(() => ({ ...files }));
  const [previewLogs, setPreviewLogs] = useState<PreviewConsoleLog[]>([]);
  const [previewState, setPreviewState] = useState<"success" | "pending" | "building" | "error">(
    () => (Object.keys(codeFiles).length > 0 ? "success" : "pending"),
  );
  const previewSandpackFiles = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(previewFiles).map(([path, code]) => [
          path,
          {
            code,
            active: path === activeFile,
          },
        ]),
      ),
    [activeFile, previewFiles],
  );

  useEffect(() => {
    const syncSettings = () => {
      const settings = loadUserSettings();
      setDefaultModel(settings.defaultModel);
      setProviderModelCapabilities(settings.providerModelCapabilities);
    };
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
    return () => window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
  }, []);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isMonacoManualCancelation(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () =>
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, []);

  const modelCapability = normalizeProviderModelCapability(
    defaultModel,
    providerModelCapabilities[defaultModel],
  );
  const designModelCount = Object.values(designModels).filter(Boolean).length;
  const requirementSourceMissing = requirementText.trim().length === 0;
  const prerequisitesReady = designModelCount > 0 && !requirementSourceMissing;
  const canGenerate = prerequisitesReady && !generationModelBlockedReason;
  const generationBlockFeedback: FeedbackDialogState | null = prerequisitesReady
    ? null
    : {
        dedupeKey: requirementSourceMissing
          ? "code:prerequisite:requirements"
          : "code:prerequisite:design",
        revision: `${requirementText.length}:${designModelCount}`,
        tone: "warning",
        title: t("code.guidanceTitle"),
        message: t(
          requirementSourceMissing
            ? "code.missingRequirementPrerequisite"
            : "code.missingDesignPrerequisite",
        ),
        primaryAction: requirementSourceMissing
          ? {
              label: t("feedback.actions.systemRequirements"),
              onSelect: openSystemRequirements,
            }
          : {
              label: t("feedback.actions.designModels"),
              onSelect: openDesignHome,
            },
        keepReopenEntry: true,
      };
  const generatedFileCount = Object.keys(codeFiles).length;
  const previewReady = generatedFileCount > 0 && Boolean(codeEntryFile || codeFiles["/src/main.tsx"]);
  const codeDiagnosticSummary = useMemo(
    () => formatCodeDiagnosticSummary({ diagnostics: codeDiagnostics }),
    [codeDiagnostics],
  );
  const hasPreviewFiles = Object.keys(previewFiles).length > 0;
  const isRepairingGeneratedPrototype =
    generating &&
    previewReady &&
    /修复|覆盖检查|质量|验证|repair/i.test(runMessage ?? "");
  const codeStatus = isRepairingGeneratedPrototype
      ? {
          tone: "primary" as const,
          icon: Loader2,
          title: t("code.status.previewReadyPolishing.title"),
          message:
            runMessage ??
            t("code.status.previewReadyPolishing.message"),
        }
      : generating
        ? {
            tone: "primary" as const,
            icon: Loader2,
            title: t("code.status.generating.title"),
            message: runMessage ?? t("code.status.generating.message"),
          }
        : previewState === "pending" && previewReady
          ? {
              tone: "primary" as const,
              icon: Info,
              title: t("code.status.pending.title"),
              message: t("code.status.pending.message"),
            }
          : previewState === "building" && hasPreviewFiles
            ? {
                tone: "primary" as const,
                icon: Loader2,
                title: t("code.status.building.title"),
                message: t("code.status.building.message"),
              }
            : previewState === "error" && hasPreviewFiles
              ? {
                  tone: "destructive" as const,
                  icon: AlertTriangle,
                  title: t("code.status.error.title"),
                  message: t("code.status.error.message"),
                }
              : previewReady
                ? requirementSourceMissing
                  ? {
                      tone: "warning" as const,
                      icon: AlertTriangle,
                      title: t("code.status.requirementMissing.title"),
                      message:
                        t("code.status.requirementMissing.message"),
                    }
                  : codeDiagnosticSummary
                  ? {
                      tone: "warning" as const,
                      icon: AlertTriangle,
                      title: t("code.status.diagnostics.title"),
                      message: t("code.status.diagnostics.message", { summary: codeDiagnosticSummary }),
                    }
                  : {
                      tone: "success" as const,
                      icon: CheckCircle2,
                      title: t("code.status.updated.title"),
                      message: t("code.status.updated.message"),
                    }
                : canGenerate
                  ? {
                      tone: "muted" as const,
                      icon: Info,
                      title: t("code.status.ready.title"),
                      message: t("code.status.ready.message"),
              }
            : null;
  const visibleDependencies = {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.487.0",
    "@radix-ui/react-checkbox": "^1.1.4",
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-dropdown-menu": "^2.1.6",
    "@radix-ui/react-label": "^2.1.2",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-slot": "^1.1.2",
    "@radix-ui/react-switch": "^1.1.3",
    "@radix-ui/react-tabs": "^1.1.3",
    "class-variance-authority": "^0.7.1",
    clsx: "^2.1.1",
    "tailwind-merge": "^3.2.0",
    ...codeDependencies,
  };
  const sandpackBundlerUrl =
    typeof window === "undefined"
      ? "/sandpack/index.html"
      : new URL("/sandpack/index.html", window.location.origin).toString();
  const updateModel = (model: string) => {
    setDefaultModel(model);
    patchUserSettings({ defaultModel: model });
  };

  useEffect(() => {
    if (!previewReady) return;
    if (manualPreviewEditPendingRef.current) return;
    if (codeEditVersion !== previewEditVersionRef.current) return;

    setPreviewFiles({ ...files });
    setPreviewState("success");
  }, [codeEditVersion, files, previewReady]);

  const handleFileChange = (path: string, value: string) => {
    manualPreviewEditPendingRef.current = true;
    clearCodePreviewDiagnostics();
    updateFile(path, value);
    if (previewReady) {
      setPreviewState("pending");
    }
  };

  const runPreview = () => {
    if (!previewReady || previewState === "building") return;
    manualPreviewEditPendingRef.current = false;
    previewEditVersionRef.current = codeEditVersion;
    setPreviewFiles({ ...files });
    setPreviewState("building");
  };

  const handlePreviewBuildStart = useCallback(() => {
    setPreviewLogs([]);
    clearCodePreviewDiagnostics();
    setPreviewState((current) => (current === "pending" ? current : "building"));
  }, [clearCodePreviewDiagnostics]);

  const handlePreviewBuildReady = useCallback(() => {
    if (manualPreviewEditPendingRef.current) return;
    clearCodePreviewDiagnostics();
    setPreviewState("success");
  }, [clearCodePreviewDiagnostics]);

  const handlePreviewBuildError = useCallback((message: string) => {
    if (manualPreviewEditPendingRef.current) return;
    recordCodePreviewDiagnostic(message);
    setPreviewState("error");
  }, [recordCodePreviewDiagnostic]);

  const handlePreviewConsoleLog = useCallback((log: PreviewConsoleLog) => {
    // Keep the current build's log stream bounded even for noisy generated prototypes.
    setPreviewLogs(current => [...current.slice(-199), log]);
  }, []);

  return (
    <PageContainer className="flex min-h-0 min-w-0 flex-col">
      <PageHeader
        className="mb-5"
        title={t("code.title")}
        description={t("code.description")}
        notice={codeStatus || generationBlockFeedback ? <div className="flex flex-wrap items-center gap-2"><CodeStatusDialog status={codeStatus} diagnostics={codeDiagnostics} />{generationBlockFeedback && <FeedbackReopenButton feedback={generationBlockFeedback} />}</div> : null}
      />
      <div data-testid="code-generation-page" className="flex min-h-0 min-w-0 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div data-testid="code-generation-toolbar" className="flex min-h-12 w-full min-w-0 flex-col items-stretch gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            {generating && (
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                <span className="truncate">{runMessage ?? t("code.generatingCode")}</span>
                <span className="font-mono">{runProgress}%</span>
              </div>
            )}
            <div className="flex w-full min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 sm:ml-auto sm:w-auto sm:overflow-visible sm:pb-0">
              <ModelPicker value={defaultModel} onValueChange={updateModel} align="end" triggerClassName="bg-card" />
              <Button onClick={() => void generateCodePrototype(generatedFileCount > 0 ? "continue" : "regenerate")} disabled={!canGenerate || generating}>
                {generating ? <Loader2 className="size-4 animate-spin" /> : generatedFileCount > 0 ? <RefreshCw className="size-4" /> : <Play className="size-4" />}
                <span className="hidden min-[430px]:inline">{generatedFileCount > 0 ? t("code.actions.continue") : t("code.actions.start")}</span>
                <span className="min-[430px]:hidden">{generatedFileCount > 0 ? t("code.actions.continueShort") : t("code.actions.generateShort")}</span>
              </Button>
              {generatedFileCount > 0 && (
                <Button variant="outline" onClick={() => void generateCodePrototype("regenerate")} disabled={!canGenerate || generating}>
                  {generating ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  <span className="hidden min-[430px]:inline">{t("code.actions.regenerate")}</span>
                  <span className="min-[430px]:hidden">{t("code.actions.redoShort")}</span>
                </Button>
              )}
            </div>
          </div>
          {modelCapability.structuredOutputMode === "compatible" && defaultModel.trim() && (
            <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t("code.compatibleWarning")}</div>
          )}
          <SandpackProvider
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            style={{ display: "flex", flexDirection: "column", flex: "1 1 0%", minHeight: 0, overflow: "hidden" }}
            template="vite-react-ts"
            files={previewSandpackFiles}
            customSetup={{ entry: "/src/main.tsx", dependencies: visibleDependencies }}
            options={{ activeFile, visibleFiles: sortedFiles, bundlerURL: sandpackBundlerUrl, initMode: "immediate", recompileMode: "delayed", recompileDelay: 500 }}
          >
            <SandpackFileSync files={previewFiles} />
            <PrototypeWorkspace
              appName={codeSpec?.appName}
              canRun={previewReady}
              building={previewState === "building"}
              pending={previewState === "pending" && previewReady}
              onRunPreview={runPreview}
              previewRef={previewRef}
              logs={previewLogs}
              editor={<PrototypeEditor files={files} activeFile={activeFile} sortedFiles={sortedFiles} fileTree={fileTree} expandedDirs={expandedDirs} onSelectFile={setActiveFile} onToggleDirectory={toggleDirectory} onChange={handleFileChange} />}
              preview={<LocalPrototypePreview ref={previewRef} files={previewFiles} entryFile="/src/main.tsx" onBuildError={handlePreviewBuildError} onBuildReady={handlePreviewBuildReady} onBuildStart={handlePreviewBuildStart} onConsoleLog={handlePreviewConsoleLog} />}
            />
          </SandpackProvider>
        </div>
      </div>
    </PageContainer>
  );
}
