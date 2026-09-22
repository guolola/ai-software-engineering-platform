// Platform-level workbench dashboard page: aggregates the current user's projects into the shared
// WorkbenchDashboard composition. Mirrors the projects-index page shell (auth session, stable
// scroll container, i18n fallback, error/empty states).
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Plus } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { Skeleton } from "../../../shared/ui/skeleton";
import { cn } from "../../../shared/ui/utils";
import { EmptyState, PageContainer, PageHeader } from "../../../shared/template/layout/page";
import { WorkbenchDashboard } from "../../../shared/template/blocks/dashboard/workbench-dashboard";
import { demoWorkbenchData } from "../../../shared/template/blocks/dashboard/demo-workbench-data";
import { i18n as appI18n } from "../../../shared/i18n";
import { usePlatformWorkbench } from "../../user-platform/hooks/use-platform-workbench";

type Navigate = (path: string) => void;

const STABLE_PLATFORM_SCROLL_CLASS =
  "min-h-0 min-w-0 w-full overflow-x-clip bg-background";

export function DashboardPage({ onNavigate }: { onNavigate: Navigate }) {
  const { t: translate, i18n: activeI18n } = useTranslation();
  const hasProviderResources =
    typeof activeI18n.exists === "function" && activeI18n.exists("dashboard.title");
  const t = hasProviderResources ? translate : appI18n.t.bind(appI18n);
  const language = hasProviderResources
    ? activeI18n.resolvedLanguage || activeI18n.language
    : appI18n.resolvedLanguage || appI18n.language;
  const locale = language === "en" ? "en" : "zh-CN";

  const demoMode =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("wbdemo");
  const liveState = usePlatformWorkbench(t, locale, { enabled: !demoMode });
  const { loading, error, reload } = liveState;
  const data = demoMode ? demoWorkbenchData : liveState.data;
  const projectCount = demoMode ? demoWorkbenchData.tableRows.length : liveState.projectCount;

  if (!demoMode && loading) {
    return (
      <main data-testid="dashboard-shell" className={cn("relative", STABLE_PLATFORM_SCROLL_CLASS)} aria-busy="true">
        <PageContainer className="flex flex-col gap-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-44 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 w-full rounded-xl" />
        </PageContainer>
      </main>
    );
  }

  return (
    <main data-testid="dashboard-shell" className={cn("relative", STABLE_PLATFORM_SCROLL_CLASS)}>
      <PageContainer className="flex flex-col gap-6">
        <PageHeader title={t("dashboard.title")} description={t("dashboard.subtitle")} />

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>
              <h2 className="text-base font-medium">{t("dashboard.errorTitle")}</h2>
            </AlertTitle>
            <AlertDescription>{error || t("dashboard.errorDescription")}</AlertDescription>
            <AlertAction>
              <Button type="button" variant="outline" onClick={reload}>
                {t("dashboard.retry")}
              </Button>
            </AlertAction>
          </Alert>
        ) : null}

        {!error && projectCount === 0 ? (
          <EmptyState
            icon={LayoutDashboard}
            title={t("dashboard.emptyTitle")}
            description={t("dashboard.emptyDescription")}
            className="mx-auto"
            action={
              <Button type="button" size="lg" onClick={() => onNavigate("/projects/new")}>
                <Plus className="size-4" />
                {t("dashboard.emptyAction")}
              </Button>
            }
          />
        ) : null}

        {!error && data && projectCount > 0 ? <WorkbenchDashboard data={data} /> : null}
      </PageContainer>
    </main>
  );
}
