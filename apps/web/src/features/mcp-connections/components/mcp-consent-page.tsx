// Presents external-client project consent independently of the connection-management workbench.
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../shared/ui/card";
import { Label } from "../../../shared/ui/label";
import MultipleSelector from "../../../shared/ui/multi-select";
import { Skeleton } from "../../../shared/ui/skeleton";
import { useMcpConnections } from "../model/use-mcp-connections";

type McpConsentProps = { interactionId: string; onNavigate: (path: string) => void };

export function McpConsentPanel({ interactionId, onNavigate }: McpConsentProps) {
  const { t } = useTranslation();
  const state = useMcpConnections(interactionId, onNavigate);
  const projects = state.info?.projects ?? [];
  const disabled = state.busy || !state.info?.enabled || Boolean(state.error);
  const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));

  return <Card className="w-full min-w-0 overflow-visible shadow-xl">
    {state.loading ? <CardContent aria-busy="true" className="space-y-5">
      <p role="status" className="text-sm text-muted-foreground">{t("mcp.loading")}</p>
      <Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" />
    </CardContent> : <>
      <CardHeader>
        <CardTitle><h1 className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-5 shrink-0" />{t("mcp.consentTitle", { name: state.client?.clientName ?? t("mcp.title") })}</h1></CardTitle>
        {state.client && <CardDescription className="break-all">{t("mcp.clientId")}: {state.client.clientId}</CardDescription>}
        <CardDescription>{t("mcp.consentHelp")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {state.error && <Alert variant="destructive"><AlertTitle>{state.error}</AlertTitle><AlertDescription>{t("mcp.stale")}</AlertDescription><Button variant="outline" disabled={state.busy || state.refreshing} onClick={state.retry}>{t("mcp.retry")}</Button></Alert>}
        {state.info && !state.info.enabled && <Alert><AlertTitle>{t("mcp.status.disabled")}</AlertTitle><AlertDescription>{t("mcp.disabled")}</AlertDescription></Alert>}
        {state.info?.enabled && <>
          <div className="space-y-3">
            <h2 className="text-sm font-medium"><Label id="mcp-consent-projects-label" htmlFor="mcp-consent-projects">{t("mcp.projects")}</Label></h2>
            <p id="mcp-consent-projects-help" className="text-sm text-muted-foreground">{t("mcp.projectsHelp")}</p>
            {!projects.length && <p className="text-sm text-muted-foreground">{t("mcp.noProjects")}</p>}
            <MultipleSelector
              commandProps={{ label: t("mcp.guideProject") }}
              inputProps={{ id: "mcp-consent-projects", "aria-labelledby": "mcp-consent-projects-label", "aria-describedby": "mcp-consent-projects-help" }}
              value={projectOptions.filter((option) => state.selected.includes(option.value))}
              options={projectOptions}
              onChange={(options) => { if (!disabled) state.setSelected(options.map((option) => option.value)); }}
              disabled={disabled || !projects.length}
              placeholder={t("mcp.guidePlaceholder")}
              hideClearAllButton
              hidePlaceholderWhenSelected
              emptyIndicator={<p className="text-center text-sm">{t("mcp.noMatchingProjects")}</p>}
              removeOptionLabel={(option) => t("mcp.removeProject", { name: option.label })}
              className="w-full"
            />
            {!state.selected.length && <p className="text-xs text-muted-foreground">{t("mcp.selectRequired")}</p>}
          </div>
          <div className="flex flex-wrap gap-3"><Button disabled={disabled || !state.selected.length || !state.client} onClick={() => void state.consent()}>{t("mcp.authorize")}</Button><Button variant="outline" disabled={state.busy} onClick={() => void state.deny()}>{t("mcp.cancel")}</Button></div>
        </>}
      </CardContent>
    </>}
  </Card>;
}

export function McpConsentPage(props: McpConsentProps) {
  return <main className="relative isolate flex min-h-svh w-full flex-1 items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-6">
    {/* The decorative workbench stays inert; only the consent card receives focus or interaction. */}
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
      <img src="/help/images/docs-workspace-shell.png" alt="" className="size-full scale-105 object-cover object-left-top blur-[12px] saturate-50" />
    </div>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-background/65 backdrop-blur-md dark:bg-background/85" />
    <div className="w-full min-w-0 max-w-2xl"><McpConsentPanel key={props.interactionId} {...props} /></div>
  </main>;
}
