// Composes client setup, source instructions and revocable credentials for connection management.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { SelectControl } from "../../../shared/ui/select";
import { Card, CardContent } from "../../../shared/ui/card";
import { Alert, AlertDescription, AlertTitle } from "../../../shared/ui/alert";
import { Skeleton } from "../../../shared/ui/skeleton";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../../shared/ui/dialog";
import { PageContainer, PageHeader } from "../../../shared/template/layout/page";
import { useMcpConnections } from "../model/use-mcp-connections";
import { mcpClients, type McpClientId } from "../model/client-configurations";
import type { Connection } from "../services/mcp-api";
import { ClientConnectionGuide } from "./client-connection-guide";
import { ProjectUsageExamples } from "./project-usage-examples";
import { ConnectionRecordsTable } from "./connection-records-table";

export function McpConnectionsPanel({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t } = useTranslation();
  const state = useMcpConnections(null, onNavigate);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState<McpClientId>("qoder");
  const [mode, setMode] = useState<"oauth" | "pat">("oauth");
  const [revokeTarget, setRevokeTarget] = useState<Connection | null>(null);
  const client = mcpClients.find((item) => item.id === clientId)!;
  const authMode = client.mode === "pat" ? "pat" : mode;
  const projects = state.info?.projects ?? [];
  const connections = state.info?.connections ?? [];
  const disabled = state.busy || !state.info?.enabled || Boolean(state.error);
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); floatingAlert.success(t("mcp.copied"), { id: "mcp-copy", durationMs: 3000 }); return true; }
    catch { floatingAlert.error(t("mcp.copyFailed"), { id: "mcp-copy", durationMs: 6000 }); return false; }
  }
  if (state.loading) return <section aria-label={t("mcp.title")} aria-busy="true" className="space-y-5"><p role="status">{t("mcp.loading")}</p><Skeleton className="h-28 w-full" /><div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-96" /><Skeleton className="h-96" /></div></section>;
  return <section className="min-w-0 space-y-6" aria-label={t("mcp.title")}>
    {state.error && <Alert variant="destructive"><AlertTitle>{state.error}</AlertTitle><AlertDescription>{t("mcp.stale")}</AlertDescription><Button variant="outline" disabled={state.busy || state.refreshing} onClick={state.retry}>{t("mcp.retry")}</Button></Alert>}
    {state.info && !state.info.enabled && <Alert><AlertTitle>{t("mcp.status.disabled")}</AlertTitle><AlertDescription>{t("mcp.disabled")}</AlertDescription></Alert>}
    {state.info?.enabled && <>
      <div className="min-w-0 space-y-8">
        <section className="min-w-0 space-y-5" aria-label={t("mcp.setup")}>
          <div className="space-y-1"><h2 className="text-base font-medium">{t("mcp.setup")}</h2><p className="text-sm text-muted-foreground">{t("mcp.setupDescription")}</p></div>
          <div className="space-y-2"><Label htmlFor="mcp-address">{t("mcp.address")}</Label><div className="flex flex-wrap gap-2"><Input id="mcp-address" className="min-w-0 flex-1" readOnly value={state.info.serverUrl ?? ""} /><Button variant="outline" disabled={!state.info.serverUrl} onClick={() => void copy(state.info?.serverUrl ?? "")}><Copy className="size-4" />{t("mcp.copyAddress")}</Button></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="mcp-client">{t("mcp.software")}</Label><SelectControl id="mcp-client" value={clientId} onValueChange={(value) => { const id = value as McpClientId; setClientId(id); setMode(mcpClients.find((item) => item.id === id)?.mode === "pat" ? "pat" : "oauth"); }} options={mcpClients.map((item) => ({ value: item.id, label: item.name }))} /></div>
            <div className="space-y-2"><Label htmlFor="mcp-auth-mode">{t("mcp.authMode")}</Label><SelectControl id="mcp-auth-mode" value={authMode} disabled={client.mode === "pat"} onValueChange={(value) => setMode(value as "oauth" | "pat")} options={[{ value: "oauth", label: t("mcp.oauth") }, { value: "pat", label: t("mcp.pat") }]} /></div></div>
          <ClientConnectionGuide key={clientId} clientId={clientId} url={state.info.serverUrl ?? ""} mode={authMode} onCopy={copy} />
          {authMode === "oauth" ? <p className="text-sm text-muted-foreground">{t("mcp.oauthHelp")}</p> : <div className="space-y-4 border-t pt-5"><div className="space-y-2"><Label htmlFor="mcp-token-name">{t("mcp.name")}</Label><Input id="mcp-token-name" maxLength={80} placeholder={t("mcp.namePlaceholder")} value={name} disabled={disabled} onChange={(event) => setName(event.target.value)} /></div><Button disabled={disabled || !name.trim()} onClick={() => void state.create(name)}>{t("mcp.create")}</Button><p className="text-xs text-muted-foreground">{t("mcp.tokenHelp")}</p></div>}
          {state.token && <Card className="border-primary/30 shadow-none"><CardContent className="space-y-3"><Label htmlFor="mcp-new-token">{t("mcp.token")}</Label><Input id="mcp-new-token" type="password" readOnly value={state.token} autoComplete="off" /><div className="flex flex-wrap gap-2"><Button onClick={() => void copy(state.token)}>{t("mcp.copyToken")}</Button><Button variant="outline" onClick={() => state.setToken("")}>{t("mcp.closeToken")}</Button></div></CardContent></Card>}
        </section>
        <ProjectUsageExamples onCopy={copy} />
      </div>
      <ConnectionRecordsTable connections={connections} projects={projects} disabled={disabled} stale={Boolean(state.error)} onRevoke={setRevokeTarget} />
    </>}
    <Dialog open={Boolean(revokeTarget)} onOpenChange={(open) => { if (!open && !state.busy) setRevokeTarget(null); }}><DialogContent><DialogHeader><DialogTitle>{t("mcp.revokeTitle")}</DialogTitle><DialogDescription>{revokeTarget?.name} · {t("mcp.revokeDescription")}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={state.busy} onClick={() => setRevokeTarget(null)}>{t("mcp.cancel")}</Button><Button variant="destructive" disabled={disabled} onClick={async () => { if (revokeTarget) await state.revoke(revokeTarget.id); setRevokeTarget(null); }}>{t("mcp.revoke")}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
export function McpConnectionsPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t } = useTranslation();
  const legacy = typeof window !== "undefined" && window.location.pathname === "/account/connections";
  useEffect(() => { if (legacy) onNavigate("/projects/connections"); }, [legacy, onNavigate]);
  if (legacy) return null;
  return <PageContainer className="w-full min-w-0 space-y-6"><PageHeader title={t("mcp.title")} description={t("mcp.description")} /><McpConnectionsPanel onNavigate={onNavigate} /></PageContainer>;
}
