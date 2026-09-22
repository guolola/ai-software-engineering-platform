// Renders the H2/H3 outline for the currently selected documentation article.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../shared/ui/utils";
import { i18n as appI18n } from "../../../shared/i18n";
import type { ProductDocHeading } from "../lib/docs-markdown";

type DocsOnThisPageProps = {
  headings: readonly ProductDocHeading[];
};

export function DocsOnThisPage({ headings }: DocsOnThisPageProps) {
  const { t: translate, i18n } = useTranslation();
  const t = i18n.exists("docs.onThisPage") ? translate : appI18n.t.bind(appI18n);
  const visibleHeadings = headings.filter(
    (heading) => heading.level === 2 || heading.level === 3,
  );
  // Track the highlighted anchor: start from the URL hash, update on click.
  const [activeHeadingId, setActiveHeadingId] = useState(() =>
    decodeURIComponent(window.location.hash.replace(/^#/, "")),
  );

  useEffect(() => {
    setActiveHeadingId(decodeURIComponent(window.location.hash.replace(/^#/, "")));
  }, [headings]);

  return (
    <aside aria-label={t("docs.outlineAria")} className="hidden min-w-0 @[1200px]/docs:block">
      <div className="border-l border-border pl-5 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("docs.onThisPage")}
          </h2>
        </div>
        {visibleHeadings.length > 0 ? (
          <nav aria-label={t("docs.onThisPage")} className="mt-3 grid gap-0.5">
            {visibleHeadings.map((heading) => {
              const isActive = heading.id === activeHeadingId;
              return (
                <a
                  key={heading.id}
                  href={`#${heading.id}`}
                  aria-current={isActive ? "true" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    setActiveHeadingId(heading.id);
                    document.getElementById(heading.id)?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                    window.history.replaceState(
                      null,
                      "",
                      `${window.location.pathname}${window.location.search}#${heading.id}`,
                    );
                  }}
                  className={cn(
                    "block break-words border-l py-1.5 pl-3 text-sm leading-5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground",
                    heading.level === 3 && "pl-6",
                    isActive
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent",
                  )}
                >
                  {heading.title}
                </a>
              );
            })}
          </nav>
        ) : (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {t("docs.noOutline")}
          </p>
        )}
      </div>
    </aside>
  );
}
