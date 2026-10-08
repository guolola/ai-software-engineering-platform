// Presents text-only CLI setup with copyable examples and client documentation.
import { useTranslation } from "react-i18next";
import { CodeBlock } from "../../../shared/ui/code-block";
import { clientGuide } from "../model/client-guides";
import { mcpClients, type McpClientId } from "../model/client-configurations";

export function ClientConnectionGuide({ clientId, url, mode, onCopy }: { clientId: McpClientId; url: string; mode: "oauth" | "pat"; onCopy: (value: string) => Promise<void | boolean> }) {
  const { t, i18n } = useTranslation();
  const guide = clientGuide(clientId, "cli", url, mode, i18n.resolvedLanguage ?? i18n.language);
  const source = guide?.source ?? mcpClients.find((client) => client.id === clientId)!.source;

  return <div className="min-w-0 space-y-4">
    {guide ? <>
      <ol className="list-decimal space-y-2 break-words pl-5 text-sm">{guide.steps.map((step) => <li key={step}>{step.split(/(`[^`]+`)/g).map((part, index) => part.startsWith("`") ? <code key={index} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code> : part)}</li>)}</ol>
      {guide.command && <CodeBlock aria-label={t("mcp.commands")} code={guide.command} language="bash" filename="terminal.sh" onCopy={onCopy} copyLabel={t("mcp.copyCode")} copiedLabel={t("mcp.copied")} />}
      {guide.configuration && <CodeBlock aria-label={t("mcp.config")} code={guide.configuration} language={clientId === "deepseek" ? "yaml" : "json"} filename={clientId === "deepseek" ? "profile.yaml" : clientId === "qoder" ? "settings.json" : "mcp.json"} onCopy={onCopy} copyLabel={t("mcp.copyCode")} copiedLabel={t("mcp.copied")} />}
    </> : <p className="text-sm text-muted-foreground">{t("mcp.noCliGuide")}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <a className="inline-block text-sm text-primary underline underline-offset-4" href={source} target="_blank" rel="noreferrer">{t("mcp.clientDocs")}</a>
    </div>
  </div>;
}
