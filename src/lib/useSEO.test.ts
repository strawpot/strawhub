// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  applySEO,
  resetSEO,
  BASE_TITLE,
  BASE_URL,
  DEFAULT_DESCRIPTION,
} from "./useSEO";

function getMeta(attr: "name" | "property", key: string) {
  return document
    .querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
    ?.getAttribute("content");
}

function getCanonical() {
  return document
    .querySelector<HTMLLinkElement>('link[rel="canonical"]')
    ?.getAttribute("href");
}

beforeEach(() => {
  // Reset head to a clean state before each test
  document.head.innerHTML = "";
  document.title = "";
});

describe("applySEO", () => {
  it("sets document title", () => {
    applySEO({ title: "My Page - StrawHub" });
    expect(document.title).toBe("My Page - StrawHub");
  });

  it("sets meta description", () => {
    applySEO({ title: "T", description: "Custom description" });
    expect(getMeta("name", "description")).toBe("Custom description");
  });

  it("uses default description when none provided", () => {
    applySEO({ title: "T" });
    expect(getMeta("name", "description")).toBe(DEFAULT_DESCRIPTION);
  });

  it("sets Open Graph tags", () => {
    applySEO({ title: "OG Test", description: "OG Desc", url: "/skills/foo" });
    expect(getMeta("property", "og:title")).toBe("OG Test");
    expect(getMeta("property", "og:description")).toBe("OG Desc");
    expect(getMeta("property", "og:url")).toBe(`${BASE_URL}/skills/foo`);
  });

  it("sets Twitter Card tags", () => {
    applySEO({ title: "TW Test", description: "TW Desc" });
    expect(getMeta("name", "twitter:title")).toBe("TW Test");
    expect(getMeta("name", "twitter:description")).toBe("TW Desc");
  });

  it("sets canonical link", () => {
    applySEO({ title: "T", url: "/roles/bar" });
    expect(getCanonical()).toBe(`${BASE_URL}/roles/bar`);
  });

  it("uses BASE_URL when no url provided", () => {
    applySEO({ title: "T" });
    expect(getCanonical()).toBe(BASE_URL);
    expect(getMeta("property", "og:url")).toBe(BASE_URL);
  });

  it("adds robots noindex when noindex is true", () => {
    applySEO({ title: "T", noindex: true });
    expect(getMeta("name", "robots")).toBe("noindex, nofollow");
  });

  it("removes robots meta when noindex is false", () => {
    // First apply with noindex
    applySEO({ title: "T", noindex: true });
    expect(getMeta("name", "robots")).toBe("noindex, nofollow");

    // Then apply without noindex
    applySEO({ title: "T", noindex: false });
    expect(getMeta("name", "robots")).toBeUndefined();
  });

  it("reuses existing meta elements instead of creating duplicates", () => {
    applySEO({ title: "First" });
    applySEO({ title: "Second" });
    const descriptions = document.querySelectorAll('meta[name="description"]');
    expect(descriptions.length).toBe(1);
  });
});

describe("resetSEO", () => {
  it("restores document title to default", () => {
    applySEO({ title: "Custom Title" });
    resetSEO();
    expect(document.title).toBe(BASE_TITLE);
  });

  it("restores meta description to default", () => {
    applySEO({ title: "T", description: "Custom" });
    resetSEO();
    expect(getMeta("name", "description")).toBe(DEFAULT_DESCRIPTION);
  });

  it("restores Open Graph tags to defaults", () => {
    applySEO({ title: "T", url: "/skills/foo" });
    resetSEO();
    expect(getMeta("property", "og:title")).toBe(
      `${BASE_TITLE} - Role & Skill Registry for StrawPot`,
    );
    expect(getMeta("property", "og:description")).toBe(DEFAULT_DESCRIPTION);
    expect(getMeta("property", "og:url")).toBe(`${BASE_URL}/`);
  });

  it("restores Twitter Card tags to defaults", () => {
    applySEO({ title: "T" });
    resetSEO();
    expect(getMeta("name", "twitter:title")).toBe(
      `${BASE_TITLE} - Role & Skill Registry for StrawPot`,
    );
    expect(getMeta("name", "twitter:description")).toBe(DEFAULT_DESCRIPTION);
  });

  it("restores canonical link to default", () => {
    applySEO({ title: "T", url: "/skills/foo" });
    resetSEO();
    expect(getCanonical()).toBe(`${BASE_URL}/`);
  });

  it("removes robots meta tag", () => {
    applySEO({ title: "T", noindex: true });
    resetSEO();
    expect(getMeta("name", "robots")).toBeUndefined();
  });
});
