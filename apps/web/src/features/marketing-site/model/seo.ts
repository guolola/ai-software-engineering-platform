// Defines the canonical metadata contract shared by runtime navigation and static prerendering.
import type { AppRoute, MarketingRoutePath } from "../../../shared/lib/app-route-types";
import { LOCALE_OG_LOCALE, type AppLocale } from "../../../shared/i18n";

export const PUBLIC_SITE_URL = "https://jianglisoftware.com";
export const SEO_JSON_LD_ID = "marketing-seo-json-ld";

type LocalizedMarketingSeoMetadata = {
  title: string;
  description: string;
};

export type MarketingSeoMetadata = {
  path: MarketingRoutePath;
  title: string;
  description: string;
  canonicalPath: MarketingRoutePath;
  imagePath: "/og-cover.png";
  indexable: true;
  jsonLd?: Record<string, unknown>[];
  localized?: Partial<Record<Exclude<AppLocale, "zh-CN">, LocalizedMarketingSeoMetadata>>;
};

const sharedApplication = {
  "@type": "SoftwareApplication",
  name: "软件工程实践平台",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  url: PUBLIC_SITE_URL,
  description: "面向软件工程教学与实践的需求分析、UML 建模、原型、代码和说明书生成平台。",
};

export const MARKETING_SEO: Record<MarketingRoutePath, MarketingSeoMetadata> = {
  "/": {
    path: "/",
    title: "软件工程实践平台｜AI 驱动的需求分析与 UML 建模",
    description: "面向软件工程教学与实践，从需求分析、UML 建模到原型、代码和说明书生成，提供可追踪的一站式工程工作流。",
    canonicalPath: "/",
    imagePath: "/og-cover.png",
    indexable: true,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "软件工程实践平台",
        url: PUBLIC_SITE_URL,
        inLanguage: "zh-CN",
      },
      { "@context": "https://schema.org", ...sharedApplication },
    ],
    localized: {
      en: {
        title: "Software Engineering Practice Platform | AI-powered Requirements and UML Modeling",
        description:
          "A traceable engineering workflow for software engineering education and practice, from requirements and UML models to prototypes, code, and documents.",
      },
    },
  },

};

function localizeMetadata(metadata: MarketingSeoMetadata, locale: AppLocale) {
  const localized = locale === "zh-CN" ? null : metadata.localized?.[locale];
  return localized
    ? {
        ...metadata,
        title: localized.title,
        description: localized.description,
      }
    : metadata;
}

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element!.setAttribute(name, value));
}

function removeManagedStructuredData() {
  document.getElementById(SEO_JSON_LD_ID)?.remove();
}

export function applyRouteMetadata(
  route: AppRoute,
  siteUrl = PUBLIC_SITE_URL,
  locale: AppLocale = "zh-CN",
) {
  const metadata =
    route.kind === "marketing-home"
      ? localizeMetadata(MARKETING_SEO[route.path], locale)
      : null;
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!metadata) {
    document.title =
      route.kind === "not-found"
        ? locale === "en"
          ? "Page not found | Software Engineering Practice Platform"
          : "页面未找到｜软件工程实践平台"
        : locale === "en"
          ? "Software Engineering Practice Platform"
          : "软件工程实践平台";
    upsertMeta('meta[name="robots"]', { name: "robots", content: "noindex, nofollow" });
    canonical?.remove();
    document.head.querySelector('meta[name="description"]')?.remove();
    document.head.querySelectorAll('[data-seo-social="true"]').forEach((element) => element.remove());
    removeManagedStructuredData();
    return;
  }

  const absoluteCanonical = new URL(metadata.canonicalPath, siteUrl).toString();
  const absoluteImage = new URL(metadata.imagePath, siteUrl).toString();
  document.title = metadata.title;
  upsertMeta('meta[name="description"]', { name: "description", content: metadata.description });
  upsertMeta('meta[name="robots"]', {
    name: "robots",
    content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  });

  const canonicalElement = canonical ?? document.createElement("link");
  canonicalElement.setAttribute("rel", "canonical");
  canonicalElement.setAttribute("href", absoluteCanonical);
  if (!canonical) document.head.appendChild(canonicalElement);

  document.head.querySelectorAll('[data-seo-social="true"]').forEach((element) => element.remove());
  const socialTags: Array<Record<string, string>> = [
    { property: "og:type", content: "website" },
    { property: "og:locale", content: LOCALE_OG_LOCALE[locale] },
    {
      property: "og:site_name",
      content:
        locale === "en"
          ? "Software Engineering Practice Platform"
          : "软件工程实践平台",
    },
    { property: "og:title", content: metadata.title },
    { property: "og:description", content: metadata.description },
    { property: "og:url", content: absoluteCanonical },
    { property: "og:image", content: absoluteImage },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: metadata.title },
    { name: "twitter:description", content: metadata.description },
    { name: "twitter:image", content: absoluteImage },
  ];
  socialTags.forEach((attributes) => {
    const element = document.createElement("meta");
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    element.dataset.seoSocial = "true";
    document.head.appendChild(element);
  });

  removeManagedStructuredData();
  if (metadata.jsonLd?.length) {
    const script = document.createElement("script");
    script.id = SEO_JSON_LD_ID;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(metadata.jsonLd);
    document.head.appendChild(script);
  }
}
