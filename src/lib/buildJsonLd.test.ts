import { describe, it, expect } from "vitest";
import { buildJsonLd, BASE_URL } from "./buildJsonLd";

describe("buildJsonLd", () => {
  it("builds basic schema for a skill", () => {
    const result = buildJsonLd({
      displayName: "Git Workflow",
      summary: "Git branching conventions",
      slug: "git-workflow",
      kind: "skills",
    });

    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("SoftwareSourceCode");
    expect(result.name).toBe("Git Workflow");
    expect(result.description).toBe("Git branching conventions");
    expect(result.url).toBe(`${BASE_URL}/skills/git-workflow`);
    expect(result.codeRepository).toBe(`${BASE_URL}/skills/git-workflow`);
  });

  it("builds basic schema for a role", () => {
    const result = buildJsonLd({
      displayName: "Implementer",
      summary: "Writes code",
      slug: "implementer",
      kind: "roles",
    });

    expect(result.url).toBe(`${BASE_URL}/roles/implementer`);
    expect(result.codeRepository).toBe(`${BASE_URL}/roles/implementer`);
  });

  it("includes author when owner has displayName", () => {
    const result = buildJsonLd({
      displayName: "Test Skill",
      slug: "test",
      kind: "skills",
      owner: { displayName: "Alice", handle: "alice123" },
    });

    expect(result.author).toEqual({
      "@type": "Person",
      name: "Alice",
    });
  });

  it("falls back to handle when displayName is null", () => {
    const result = buildJsonLd({
      displayName: "Test Skill",
      slug: "test",
      kind: "skills",
      owner: { displayName: null, handle: "bob42" },
    });

    expect(result.author).toEqual({
      "@type": "Person",
      name: "bob42",
    });
  });

  it("falls back to 'unknown' when both displayName and handle are null", () => {
    const result = buildJsonLd({
      displayName: "Test Skill",
      slug: "test",
      kind: "skills",
      owner: { displayName: null, handle: null },
    });

    expect(result.author).toEqual({
      "@type": "Person",
      name: "unknown",
    });
  });

  it("omits author when owner is null", () => {
    const result = buildJsonLd({
      displayName: "Test Skill",
      slug: "test",
      kind: "skills",
      owner: null,
    });

    expect(result.author).toBeUndefined();
  });

  it("omits author when owner is not provided", () => {
    const result = buildJsonLd({
      displayName: "Test Skill",
      slug: "test",
      kind: "skills",
    });

    expect(result.author).toBeUndefined();
  });

  it("sets description to undefined when summary is null", () => {
    const result = buildJsonLd({
      displayName: "Test Skill",
      summary: null,
      slug: "test",
      kind: "skills",
    });

    expect(result.description).toBeUndefined();
  });
});
