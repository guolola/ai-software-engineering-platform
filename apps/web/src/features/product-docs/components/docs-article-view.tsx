// Renders Markdown documentation with project-local navigation and shared UI styling.
import { Table } from '../../../shared/ui/table';
import { TableCell } from '../../../shared/ui/table';
import { TableHead } from '../../../shared/ui/table';
import { TableHeader } from '../../../shared/ui/table';
import type { AnchorHTMLAttributes, HTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Clock, ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../../shared/ui/badge";
import { VideoPlayer } from "../../../shared/ui/video-player";
import { cn } from "../../../shared/ui/utils";
import { i18n as appI18n } from "../../../shared/i18n";
import {
  isAppRouteHref,
  slugifyMarkdownHeading,
  type ProductDocHeading,
} from "../lib/docs-markdown";
import type { ProductDocArticle } from "../model/docs-content";

type DocsArticleViewProps = {
  article: ProductDocArticle;
  headings: readonly ProductDocHeading[];
  onNavigate?: (route: string) => void;
};

export function DocsArticleView({
  article,
  headings,
  onNavigate,
}: DocsArticleViewProps) {
  const { t: translate, i18n } = useTranslation();
  const t = i18n.exists("docs.minutes") ? translate : appI18n.t.bind(appI18n);
  const headingIds = new Map(
    headings.map((heading) => [headingKey(heading.level, heading.title), heading.id]),
  );
  const components = createMarkdownComponents({ headingIds, onNavigate });

  return (
    <article className="min-w-0 w-full max-w-[800px]">
      <header className="mb-8">
        <h1 id={headings.find((heading) => heading.level === 1)?.id ?? article.id}
          tabIndex={-1} className="scroll-mt-20 break-words text-3xl font-semibold tracking-tight outline-none @[720px]/docs:scroll-mt-6 @[720px]/docs:text-4xl">
          {headings.find((heading) => heading.level === 1)?.title ?? article.title}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{article.categoryLabel}</Badge>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {t("docs.minutes", { count: article.estimatedMinutes })}
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          {article.summary}
        </p>
        {article.video && (
          <VideoPlayer
            className="mt-5"
            src={article.video.src}
            title={article.video.title}
            description={article.video.description}
            caption={article.video.caption}
          />
        )}
        {article.screenshot && (
          <figure className="mt-5 overflow-hidden rounded-lg border border-border bg-background">
            <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
              <img
                src={article.screenshot.src}
                alt={article.screenshot.alt}
                className="h-full w-full object-cover object-top"
              />
            </div>
            <figcaption className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
              <ImageIcon className="size-3.5" />
              {article.screenshot.caption}
            </figcaption>
          </figure>
        )}
      </header>

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={components}
      >
        {article.content}
      </ReactMarkdown>
    </article>
  );
}

function createMarkdownComponents({
  headingIds,
  onNavigate,
}: {
  headingIds: Map<string, string>;
  onNavigate?: (route: string) => void;
}): Components {
  const headingId = (level: ProductDocHeading["level"], children: ReactNode) => {
    const title = getTextContent(children);
    return headingIds.get(headingKey(level, title)) ?? slugifyMarkdownHeading(title);
  };

  return {
    // The article's H1 is rendered above its summary and media.
    h1() { return null; },
    h2({ children, node: _node, ...props }) {
      return (
        <h2
          id={headingId(2, children)}
          className="mt-6 scroll-mt-20 @[720px]/docs:scroll-mt-6 break-words text-xl font-semibold first:mt-0"
          {...props}
        >
          {children}
        </h2>
      );
    },
    h3({ children, node: _node, ...props }) {
      return (
        <h3
          id={headingId(3, children)}
          className="mt-4 scroll-mt-20 @[720px]/docs:scroll-mt-6 break-words text-base font-semibold"
          {...props}
        >
          {children}
        </h3>
      );
    },
    p({ children, node: _node, ...props }) {
      return (
        <p className="mt-4 break-words text-sm leading-6 text-muted-foreground" {...props}>
          {children}
        </p>
      );
    },
    ul({ children, node: _node, ...props }) {
      return (
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground" {...props}>
          {children}
        </ul>
      );
    },
    ol({ children, node: _node, ...props }) {
      return (
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground" {...props}>
          {children}
        </ol>
      );
    },
    li({ children, node: _node, ...props }) {
      return (
        <li className="break-words pl-1" {...props}>
          {children}
        </li>
      );
    },
    strong({ children, node: _node, ...props }) {
      return (
        <strong className="font-semibold text-foreground" {...props}>
          {children}
        </strong>
      );
    },
    a({ href = "", children, node: _node, ...props }) {
      return (
        <DocsMarkdownLink href={href} onNavigate={onNavigate} {...props}>
          {children}
        </DocsMarkdownLink>
      );
    },
    blockquote({ children, node: _node, ...props }) {
      return (
        <blockquote
          className="mt-5 border-l-4 border-primary/40 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground"
          {...props}
        >
          {children}
        </blockquote>
      );
    },
    code({ children, className, node: _node, ...props }) {
      return (
        <code
          className={cn(
            "rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground",
            className,
          )}
          {...props}
        >
          {children}
        </code>
      );
    },
    pre({ children, node: _node, ...props }) {
      return (
        <pre
          className="bg-muted text-foreground mt-4 max-w-full overflow-x-auto rounded-lg p-4 text-sm leading-6"
          {...props}
        >
          {children}
        </pre>
      );
    },
    table({ children, node: _node, ...props }) {
      return (
        <div className="mt-5 max-w-full overflow-hidden rounded-lg border border-border">
          <Table className="min-w-[620px] border-collapse text-left text-sm"   {...props}>
            {children}
          </Table>
        </div>
      );
    },
    thead({ children, node: _node, ...props }) {
      return (
        <TableHeader className="bg-muted text-foreground" {...props}>
          {children}
        </TableHeader>
      );
    },
    th({ children, node: _node, ...props }) {
      return (
        <TableHead className="border-b border-border px-3 py-2 font-semibold" {...props}>
          {children}
        </TableHead>
      );
    },
    td({ children, node: _node, ...props }) {
      return (
        <TableCell className="border-t border-border px-3 py-2 text-muted-foreground" {...props}>
          {children}
        </TableCell>
      );
    },
    img({ src, alt, node: _node, ...props }) {
      return <DocsMarkdownImage src={src} alt={alt} {...props} />;
    },
    hr({ node: _node, ...props }) {
      return <hr className="my-8 border-border" {...props} />;
    },
  };
}

function DocsMarkdownLink({
  href,
  onNavigate,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  onNavigate?: (route: string) => void;
}) {
  const routeHref = isAppRouteHref(href);
  return (
    <a
      href={href}
      className="font-medium text-primary underline-offset-4 hover:underline"
      target={routeHref || href.startsWith("#") ? undefined : "_blank"}
      rel={routeHref || href.startsWith("#") ? undefined : "noreferrer"}
      onClick={(event) => {
        if (!routeHref || !onNavigate) return;
        event.preventDefault();
        onNavigate(href);
      }}
      {...props}
    >
      {children}
    </a>
  );
}

function DocsMarkdownImage({
  src,
  alt,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt ?? ""}
      loading="lazy"
      className="mt-5 max-h-[520px] w-full rounded-lg border border-border bg-background object-contain"
      {...props}
    />
  );
}

function getTextContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getTextContent).join("");
  }
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return getTextContent(props?.children);
  }
  return "";
}

function headingKey(level: ProductDocHeading["level"], title: string) {
  return `${level}:${title.trim()}`;
}
