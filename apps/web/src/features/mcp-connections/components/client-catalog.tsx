// Presents the client directory and opens existing connection instructions from each catalog card.
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { mcpClients, type McpClientId } from "../model/client-configurations";
import { ClientIcon } from "./client-icon";

export function ClientCatalogHero() {
  const { t } = useTranslation();

  return <div className="grid min-w-0 items-center gap-8 py-4 sm:py-6 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.6fr)] lg:gap-12 lg:py-10">
    <div className="min-w-0">
      <p className="mb-5 font-mono text-xs font-medium uppercase tracking-[0.16em] text-foreground sm:mb-6">{t("mcp.catalog.eyebrow")}</p>
      <h1 className="whitespace-pre-line text-4xl font-normal leading-[1.16] tracking-tight text-foreground sm:text-5xl xl:text-[3.6rem]">{t("mcp.catalog.title")}</h1>
      <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">{t("mcp.catalog.description")}</p>
    </div>
    <svg aria-hidden="true" viewBox="0 0 320 320" fill="none" className="aspect-square w-full max-w-72 justify-self-start sm:max-w-80 lg:justify-self-end">
      <path fill="#D6F255" d="M0 0h160v160H0z" />
      <path fill="#BC9CF2" d="M160 0h160v160H160z" />
      <path fill="#FF985B" d="M0 160h160v160H0z" />
      <path fill="#D947BD" d="M160 160h160v160H160z" />
      <path d="M0 160V80a80 80 0 0 1 160 0v80H0Z" fill="#754DDB" />
      <path d="M40 160V80a40 40 0 0 1 80 0v80H40Z" fill="#D6F255" />
      <path d="m240 18 62 62-62 62-62-62 62-62Z" fill="#202020" />
      <path d="m240 50 30 30-30 30-30-30 30-30Z" fill="#BC9CF2" />
      <path d="M0 280h40v-40h40v-40h40v-40h40v160H0v-40Z" fill="#202020" />
      <path d="M160 320V160" stroke="#FF985B" strokeWidth="2" />
      <circle cx="240" cy="240" r="63" stroke="#D6F255" strokeWidth="2" />
      <ellipse cx="240" cy="240" rx="42" ry="63" stroke="#D6F255" strokeWidth="2" />
      <ellipse cx="240" cy="240" rx="20" ry="63" stroke="#D6F255" strokeWidth="2" />
      <path d="M177 240h126M183 214h114M183 266h114" stroke="#D6F255" strokeWidth="2" />
    </svg>
  </div>;
}

export function ClientCatalog({ onSelect }: { onSelect: (id: McpClientId, trigger: HTMLButtonElement) => void }) {
  const { t } = useTranslation();

  return <section className="min-w-0 space-y-6" aria-labelledby="mcp-client-catalog-title">
    <h2 id="mcp-client-catalog-title" className="text-2xl font-medium leading-8 text-foreground sm:text-3xl">{t("mcp.catalog.clients")}</h2>
    <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {mcpClients.map((client) => <article key={client.id} className="flex min-w-0 flex-col border border-border bg-background p-6 transition-colors hover:border-foreground/40">
        <ClientIcon clientId={client.id} />
        <h3 className="mb-5 mt-6 min-h-14 break-words text-[22px] font-medium leading-7 text-foreground">{client.name}</h3>
        <ul className="list-disc space-y-2 pl-4 text-sm leading-6 text-muted-foreground marker:text-foreground">
          <li>{t("mcp.catalog.sources")}</li>
          <li>{t("mcp.catalog.readOnly")}</li>
          <li>{t(client.mode === "manual" ? "mcp.catalog.manual" : "mcp.catalog.remote")}</li>
        </ul>
        <div className="mt-auto pt-8">
          <Button
            variant="link"
            className="h-auto max-w-full justify-start gap-2 rounded-none border-0 p-0 text-sm font-medium text-foreground underline underline-offset-4 hover:text-foreground/70"
            aria-label={t("mcp.catalog.openGuide", { name: client.name })}
            aria-haspopup="dialog"
            onClick={(event) => onSelect(client.id, event.currentTarget)}
          >
            {t("mcp.catalog.installGuide")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </article>)}
    </div>
  </section>;
}
