// Composes the in-app documentation center from modular docs data, search, and article panels.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, BookOpenCheck, Menu, ChevronDown } from "lucide-react";
import { cn } from "../../../shared/ui/utils";
import { Button } from "../../../shared/ui/button";
import { PageContainer } from "../../../shared/template/layout/page";
import { i18n as appI18n } from "../../../shared/i18n";
import { getProductDocArticles, getProductDocCategories } from "../model/docs-content";
import {
  extractMarkdownHeadings,
  searchProductDocs,
} from "../lib/docs-markdown";
import { DocsArticleView } from "./docs-article-view";
import { DocsOnThisPage } from "./docs-on-this-page";
import { DocsSidebar } from "./docs-sidebar";

type ProductDocsPageProps = {
  onNavigate?: (route: string) => void;
};

export function ProductDocsPage({ onNavigate }: ProductDocsPageProps) {
  const { t: translate, i18n } = useTranslation();
  const t = i18n.exists("docs.title") ? translate : appI18n.t.bind(appI18n);
  const locale = i18n.resolvedLanguage === "en" || i18n.language === "en" ? "en" : "zh-CN";
  const articles = useMemo(() => getProductDocArticles(locale), [locale]);
  const categories = useMemo(() => getProductDocCategories(locale), [locale]);
  const [selection, setSelection] = useState({ id: articles[0]?.id ?? "", revision: 0 });
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const selectArticle = (id: string) => {
    setSelection((current) => ({ id, revision: current.revision + 1 }));
    setDirectoryOpen(false);
    // A heading hash belongs to the previous article, not the next selection.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  };
  useLayoutEffect(() => {
    if (selection.revision === 0) return;
    // Wait for the new article and collapsed mobile directory to commit together.
    const title = pageRef.current?.querySelector<HTMLElement>("article h1");
    title?.focus({ preventScroll: true });
    title?.scrollIntoView({ block: "start" });
  }, [selection]);
  const [searchQuery, setSearchQuery] = useState("");
  const selectedArticle =
    articles.find((article) => article.id === selection.id) ??
    articles[0];
  const searchResults = useMemo(
    () => searchProductDocs(articles, searchQuery),
    [articles, searchQuery],
  );
  const headings = useMemo(
    () => extractMarkdownHeadings(selectedArticle.content),
    [selectedArticle.content],
  );

  return (
    <main ref={pageRef} data-testid="product-docs-page" className="@container/docs h-full min-h-0 min-w-0 w-full overflow-y-auto overflow-x-clip overscroll-contain bg-background text-foreground">
      <div className="sticky top-0 z-40 border-b border-border bg-background px-4 py-2 @[720px]/docs:hidden">
        <Button
          variant="ghost"
          className="w-full justify-start"
          aria-expanded={directoryOpen}
          aria-controls="product-docs-directory"
          onClick={() => setDirectoryOpen((open) => !open)}
        >
          <Menu className="size-4" />
          {t("docs.directory")}
          <ChevronDown className="ml-auto size-4" />
        </Button>
      </div>
      <PageContainer className="h-auto flex-none py-8 @[720px]/docs:py-10">
        <div className="grid w-full grid-cols-1 items-start gap-8 @[720px]/docs:grid-cols-[256px_minmax(0,1fr)] @[1200px]/docs:grid-cols-[256px_minmax(0,800px)_200px]">
          <div id="product-docs-directory" className={cn("min-w-0 @[720px]/docs:block", !directoryOpen && "hidden")}>
            <DocsSidebar
              articles={articles}
              categories={categories}
              searchQuery={searchQuery}
              searchResults={searchResults}
              selectedArticleId={selectedArticle.id}
              onSearchQueryChange={setSearchQuery}
              onSelectArticle={selectArticle}
            />
          </div>

          <DocsArticleView
            article={selectedArticle}
            headings={headings}
            onNavigate={onNavigate}
          />

          <DocsOnThisPage headings={headings} />
        </div>

        <footer data-testid="docs-footer" className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <BookOpenCheck className="size-4 text-primary" />
            {t("docs.maintainedNotice")}
          </span>
          <Button variant="ghost"
            type="button"
            className="inline-flex items-center gap-1 hover:underline"
            onClick={() => selectArticle(articles[0]?.id ?? selectedArticle.id)}
          >
            {t("docs.backToQuickStart")}
            <ArrowRight className="size-4" />
          </Button>
        </footer>
      </PageContainer>
    </main>
  );
}
