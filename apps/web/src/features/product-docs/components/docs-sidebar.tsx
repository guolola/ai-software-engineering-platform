// Owns documentation navigation, category grouping, and search result selection.
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../../shared/ui/badge";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "../../../shared/ui/sidebar";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../../../shared/ui/input-group";
import { Label } from "../../../shared/ui/label";
import { i18n as appI18n } from "../../../shared/i18n";
import type {
  ProductDocArticle,
  ProductDocCategory,
} from "../model/docs-content";
import type { ProductDocSearchResult } from "../lib/docs-markdown";

type DocsSidebarProps = {
  articles: readonly ProductDocArticle[];
  categories: readonly ProductDocCategory[];
  searchQuery: string;
  searchResults: readonly ProductDocSearchResult[];
  selectedArticleId: string;
  onSearchQueryChange: (query: string) => void;
  onSelectArticle: (articleId: string) => void;
};

export function DocsSidebar({
  articles,
  categories,
  searchQuery,
  searchResults,
  selectedArticleId,
  onSearchQueryChange,
  onSelectArticle,
}: DocsSidebarProps) {
  const { t: translate, i18n } = useTranslation();
  const t = i18n.exists("docs.directory") ? translate : appI18n.t.bind(appI18n);
  const trimmedQuery = searchQuery.trim();
  const visibleArticles = trimmedQuery
    ? searchResults.map((result) => result.article)
    : articles;

  return (
    <aside
      aria-label={t("docs.directoryAria")}
      className="min-w-0 py-2 @[720px]/docs:pr-6"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">{t("docs.directory")}</h2>
      </div>

      <Label
        className="mt-4 text-xs font-medium tracking-wide text-muted-foreground"
        htmlFor="product-docs-search"
      >
        {t("docs.searchLabel")}
      </Label>
      <InputGroup className="mt-2">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          id="product-docs-search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder={t("docs.searchPlaceholder")}
        />
      </InputGroup>

      {trimmedQuery ? (
        <div className="mt-4 grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("docs.searchResults")}
            </span>
            <Badge variant="outline">{t("docs.resultCount", { count: searchResults.length })}</Badge>
          </div>
          {visibleArticles.length > 0 ? (
            <SidebarMenu>
              {visibleArticles.map((article) => (
                <ArticleButton
                  key={article.id}
                  article={article}
                  active={article.id === selectedArticleId}
                  onSelect={() => onSelectArticle(article.id)}
                />
              ))}
            </SidebarMenu>
          ) : (
            <p className="py-3 text-sm leading-6 text-muted-foreground">
              {t("docs.noResults")}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {categories.map((category) => {
            const categoryArticles = articles.filter(
              (article) => article.category === category.id,
            );
            return (
              <SidebarGroup key={category.id} className="p-0" aria-labelledby={`docs-category-${category.id}`}>
                <SidebarGroupLabel
                  render={<h3 />}
                  id={`docs-category-${category.id}`}
                  className="h-auto min-w-0 break-words px-2 py-2 text-xs font-medium text-muted-foreground"
                >
                  {category.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {categoryArticles.map((article) => (
                      <ArticleButton
                        key={article.id}
                        article={article}
                        active={article.id === selectedArticleId}
                        onSelect={() => onSelectArticle(article.id)}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function ArticleButton({
  article,
  active,
  onSelect,
}: {
  article: ProductDocArticle;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={active}
        aria-current={active ? "page" : undefined}
        className="h-auto min-h-8 items-start whitespace-normal px-2 py-1.5 [&>span:last-child]:whitespace-normal [&>span:last-child]:overflow-visible"
        onClick={onSelect}
      >
        <span className="min-w-0 break-words text-sm leading-5">
          {article.title}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
