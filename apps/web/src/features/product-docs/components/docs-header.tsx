// Provides public docs navigation, language selection, search, and theme controls.
import { useEffect, useRef } from "react";
import { Moon, Search, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import Link from "../../../shared/lib/template-link";
import Logo from "../../../shared/template/assets/svg/logo";
import { LanguagePreferenceMenu } from "../../../shared/i18n/components/language-preference-menu";
import { Button } from "../../../shared/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../../shared/ui/input-group";
import { useTheme } from "../../../shared/ui/theme-provider";

type DocsHeaderProps = {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
};

export function DocsHeader({ searchQuery, onSearchQueryChange }: DocsHeaderProps) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <header data-testid="docs-header" className="shrink-0 border-b border-border bg-background">
      <div className="mx-auto flex min-h-16 max-w-360 flex-wrap items-center gap-3 px-4 py-3 sm:px-6 @[1040px]/docs:flex-nowrap @[1040px]/docs:gap-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label={t("nav.home")} className="flex shrink-0 items-center gap-2 font-semibold">
            <Logo className="size-8" />
            <span>{t("nav.tutorial")}</span>
          </Link>
          <LanguagePreferenceMenu showLabel />
        </div>

        <InputGroup className="order-last w-full @[1040px]/docs:order-none @[1040px]/docs:mx-auto @[1040px]/docs:max-w-lg @[1040px]/docs:flex-1">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            id="product-docs-search"
            aria-label={t("docs.searchLabel")}
            aria-keyshortcuts="Control+k Meta+k"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder={t("docs.searchPlaceholder")}
          />
          <InputGroupAddon align="inline-end">
            <kbd className="text-xs text-muted-foreground">Ctrl K</kbd>
          </InputGroupAddon>
        </InputGroup>

        <div className="ml-auto flex shrink-0 items-center gap-2 @[1040px]/docs:ml-0">
          <Button nativeButton={false} render={<Link href="/projects" />}>{t("docs.openProjects")}</Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={toggle}
            aria-label={t(theme === "dark" ? "theme.switchToLight" : "theme.switchToDark")}
          >
            <Moon className="size-4 dark:hidden" />
            <Sun className="hidden size-4 dark:block" />
          </Button>
        </div>
      </div>
    </header>
  );
}
