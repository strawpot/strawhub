import { useEffect } from "react";

interface SEOOptions {
  title: string;
  description?: string;
  url?: string;
  noindex?: boolean;
}

const BASE_TITLE = "StrawHub";
const BASE_URL = "https://strawhub.dev";
const DEFAULT_DESCRIPTION =
  "Discover, share, and install reusable roles and skills for your StrawPot agents.";

/**
 * Lightweight hook that sets document title, meta description,
 * Open Graph / Twitter Card tags, and canonical link.
 *
 * On unmount the tags revert to the static defaults in index.html.
 */
export function useSEO({ title, description, url, noindex }: SEOOptions) {
  useEffect(() => {
    const desc = description || DEFAULT_DESCRIPTION;
    const fullUrl = url ? `${BASE_URL}${url}` : BASE_URL;

    // Title
    document.title = title;

    // Helper to set a <meta> tag by name or property attribute
    const setMeta = (attr: "name" | "property", key: string, value: string) => {
      let el = document.querySelector<HTMLMetaElement>(
        `meta[${attr}="${key}"]`,
      );
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };

    // Helper to set <link rel="canonical">
    const setCanonical = (href: string) => {
      let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", "canonical");
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    };

    // Description
    setMeta("name", "description", desc);

    // Robots (noindex for private pages)
    if (noindex) {
      setMeta("name", "robots", "noindex, nofollow");
    } else {
      const robotsEl = document.querySelector<HTMLMetaElement>(
        'meta[name="robots"]',
      );
      if (robotsEl) robotsEl.remove();
    }

    // Open Graph
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", fullUrl);

    // Twitter Card
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", desc);

    // Canonical
    setCanonical(fullUrl);

    // Cleanup: restore defaults
    return () => {
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
    };
  }, [title, description, url, noindex]);
}
