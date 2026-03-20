import { describe, it, expect } from "vitest";
import {
  parseDependencySpec,
  parseVersion,
  compareVersions,
  satisfiesVersion,
  extractSlug,
} from "./versionSpec";

describe("parseDependencySpec", () => {
  it("parses bare slug as latest", () => {
    const spec = parseDependencySpec("my-skill");
    expect(spec.slug).toBe("my-skill");
    expect(spec.operator).toBe("latest");
    expect(spec.version).toBeNull();
  });

  it("parses exact version spec", () => {
    const spec = parseDependencySpec("my-skill==1.2.3");
    expect(spec.slug).toBe("my-skill");
    expect(spec.operator).toBe("==");
    expect(spec.version).toBe("1.2.3");
  });

  it("parses wildcard", () => {
    const spec = parseDependencySpec("*");
    expect(spec.slug).toBe("*");
    expect(spec.operator).toBe("wildcard");
  });

  it("strips surrounding quotes", () => {
    const spec = parseDependencySpec('"my-skill"');
    expect(spec.slug).toBe("my-skill");
    expect(spec.operator).toBe("latest");
  });

  it("strips single quotes", () => {
    const spec = parseDependencySpec("'my-skill==1.0.0'");
    expect(spec.slug).toBe("my-skill");
    expect(spec.operator).toBe("==");
    expect(spec.version).toBe("1.0.0");
  });

  it("trims whitespace", () => {
    const spec = parseDependencySpec("  my-skill  ");
    expect(spec.slug).toBe("my-skill");
  });

  it("strips inline comments", () => {
    const spec = parseDependencySpec("strawpot-ceo  # escalation target");
    expect(spec.slug).toBe("strawpot-ceo");
    expect(spec.operator).toBe("latest");
  });

  it("strips inline comment from versioned spec", () => {
    const spec = parseDependencySpec("code-review==1.0.0 # pinned");
    expect(spec.slug).toBe("code-review");
    expect(spec.operator).toBe("==");
    expect(spec.version).toBe("1.0.0");
  });

  it("throws on invalid spec", () => {
    expect(() => parseDependencySpec("INVALID_SLUG")).toThrow();
    expect(() => parseDependencySpec("has spaces")).toThrow();
  });
});

describe("parseVersion", () => {
  it("parses valid semver", () => {
    const v = parseVersion("1.2.3");
    expect(v).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("parses zeros", () => {
    const v = parseVersion("0.0.0");
    expect(v).toEqual({ major: 0, minor: 0, patch: 0 });
  });

  it("throws on invalid version", () => {
    expect(() => parseVersion("1.2")).toThrow();
    expect(() => parseVersion("abc")).toThrow();
    expect(() => parseVersion("")).toThrow();
  });
});

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions(parseVersion("1.0.0"), parseVersion("1.0.0"))).toBe(0);
  });

  it("compares major versions", () => {
    expect(compareVersions(parseVersion("2.0.0"), parseVersion("1.0.0"))).toBe(1);
    expect(compareVersions(parseVersion("1.0.0"), parseVersion("2.0.0"))).toBe(-1);
  });

  it("compares minor versions", () => {
    expect(compareVersions(parseVersion("1.2.0"), parseVersion("1.1.0"))).toBe(1);
  });

  it("compares patch versions", () => {
    expect(compareVersions(parseVersion("1.0.2"), parseVersion("1.0.1"))).toBe(1);
  });
});

describe("satisfiesVersion", () => {
  it("latest always satisfies", () => {
    expect(satisfiesVersion("1.0.0", { slug: "x", operator: "latest", version: null })).toBe(true);
  });

  it("wildcard always satisfies", () => {
    expect(satisfiesVersion("1.0.0", { slug: "*", operator: "wildcard", version: null })).toBe(true);
  });

  it("exact match satisfies", () => {
    expect(satisfiesVersion("1.0.0", { slug: "x", operator: "==", version: "1.0.0" })).toBe(true);
  });

  it("exact mismatch does not satisfy", () => {
    expect(satisfiesVersion("1.0.1", { slug: "x", operator: "==", version: "1.0.0" })).toBe(false);
  });
});

describe("extractSlug", () => {
  it("extracts slug from bare spec", () => {
    expect(extractSlug("my-skill")).toBe("my-skill");
  });

  it("extracts slug from versioned spec", () => {
    expect(extractSlug("my-skill==1.0.0")).toBe("my-skill");
  });
});
