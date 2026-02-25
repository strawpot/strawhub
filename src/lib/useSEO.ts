import { useEffect } from "react";

export interface SEOOptions {
  title: string;
  description?: string;
  url?: string;
  noindex?: boolean;
}

export const BASE_TITLE = "StrawHub";
export const BASE_URL = "https://strawhub.dev";
export const DEFAULT_DESCRIPTION =
  "Discover, share, and install reusable roles and skills for your StrawPot agents.";

/** Set a <meta> tag by name or property attribute. */
export function setMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

/** Set <link rel="canonical">. */
export function setCanonical(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Apply SEO tags to the document. */
export function applySEO({ title, description, url, noindex }: SEOOptions) {
  const desc = description || DEFAULT_DESCRIPTION;
  const fullUrl = url ? `${BASE_URL}${url}` : BASE_URL;

  document.title = title;

  setMeta("name", "description", desc);

  if (noindex) {
    setMeta("name", "robots", "noindex, nofollow");
  } else {
    const robotsEl = document.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );
    if (robotsEl) robotsEl.remove();
  }

  setMeta("property", "og:title", title);
  setMeta("property", "og:description", desc);
  setMeta("property", "og:url", fullUrl);

  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", desc);

  setCanonical(fullUrl);
}

/** Restore SEO tags to static defaults. */
export function resetSEO() {
  document.title = BASE_TITLE;
  setMeta("name", "description", DEFAULT_DESCRIPTION);
  setMeta("property", "og:title", `${BASE_TITLE} - Role & Skill Registry for StrawPot`);
  setMeta("property", "og:description", DEFAULT_DESCRIPTION);
  setMeta("property", "og:url", `${BASE_URL}/`);
  setMeta("name", "twitter:title", `${BASE_TITLE} - Role & Skill Registry for StrawPot`);
  setMeta("name", "twitter:description", DEFAULT_DESCRIPTION);
  setCanonical(`${BASE_URL}/`);
  const robotsEl = document.querySelector<HTMLMetaElement>(
    'meta[name="robots"]',
  );
  if (robotsEl) robotsEl.remove();
}

/**
 * Lightweight hook that sets document title, meta description,
 * Open Graph / Twitter Card tags, and canonical link.
 *
 * On unmount the tags revert to the static defaults in index.html.
 */
export function useSEO(options: SEOOptions) {
  useEffect(() => {
    applySEO(options);
    return () => resetSEO();
  }, [options.title, options.description, options.url, options.noindex]);
}
