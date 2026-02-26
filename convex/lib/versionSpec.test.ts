import { describe, it, expect } from "vitest";
import {
  parseDependencySpec,
  parseVersion,
  compareVersions,
  satisfiesVersion,
  extractSlug,
} from "./versionSpec";

describe("parseDependencySpec", () => {
  it("parses bare slug", () => {
    expect(parseDependencySpec("git-workflow")).toEqual({
      slug: "git-workflow",
      operator: "latest",
      version: null,
    });
  });

  it("parses exact version ==", () => {
    expect(parseDependencySpec("code-review==1.0.0")).toEqual({
      slug: "code-review",
      operator: "==",
      version: "1.0.0",
    });
  });

  it("parses minimum version >=", () => {
    expect(parseDependencySpec("testing>=2.1.0")).toEqual({
      slug: "testing",
      operator: ">=",
      version: "2.1.0",
    });
  });

  it("parses caret version ^", () => {
    expect(parseDependencySpec("utils^1.2.3")).toEqual({
      slug: "utils",
      operator: "^",
      version: "1.2.3",
    });
  });

  it("trims whitespace", () => {
    expect(parseDependencySpec("  git-workflow>=1.0.0  ")).toEqual({
      slug: "git-workflow",
      operator: ">=",
      version: "1.0.0",
    });
  });

  it("handles single-char slug", () => {
    expect(parseDependencySpec("x")).toEqual({
      slug: "x",
      operator: "latest",
      version: null,
    });
  });

  it("throws on invalid spec", () => {
    expect(() => parseDependencySpec("!!!invalid")).toThrow(
      "Invalid dependency specifier",
    );
  });

  it("throws on empty string", () => {
    expect(() => parseDependencySpec("")).toThrow(
      "Invalid dependency specifier",
    );
  });
});

describe("parseVersion", () => {
  it("parses valid version", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("parses zeros", () => {
    expect(parseVersion("0.0.0")).toEqual({ major: 0, minor: 0, patch: 0 });
  });

  it("throws on invalid version", () => {
    expect(() => parseVersion("1.2")).toThrow("Invalid version");
    expect(() => parseVersion("abc")).toThrow("Invalid version");
  });
});

describe("compareVersions", () => {
  it("equal versions", () => {
    expect(compareVersions({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 3 })).toBe(0);
  });

  it("major difference", () => {
    expect(compareVersions({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 9, patch: 9 })).toBe(1);
    expect(compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(-1);
  });

  it("minor difference", () => {
    expect(compareVersions({ major: 1, minor: 3, patch: 0 }, { major: 1, minor: 2, patch: 0 })).toBe(1);
    expect(compareVersions({ major: 1, minor: 2, patch: 0 }, { major: 1, minor: 3, patch: 0 })).toBe(-1);
  });

  it("patch difference", () => {
    expect(compareVersions({ major: 1, minor: 2, patch: 4 }, { major: 1, minor: 2, patch: 3 })).toBe(1);
    expect(compareVersions({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 4 })).toBe(-1);
  });
});

describe("satisfiesVersion", () => {
  it("latest always satisfies", () => {
    const spec = { slug: "x", operator: "latest" as const, version: null };
    expect(satisfiesVersion("0.0.1", spec)).toBe(true);
    expect(satisfiesVersion("99.99.99", spec)).toBe(true);
  });

  it("== exact match", () => {
    const spec = { slug: "x", operator: "==" as const, version: "1.2.3" };
    expect(satisfiesVersion("1.2.3", spec)).toBe(true);
    expect(satisfiesVersion("1.2.4", spec)).toBe(false);
    expect(satisfiesVersion("1.2.2", spec)).toBe(false);
  });

  it(">= minimum", () => {
    const spec = { slug: "x", operator: ">=" as const, version: "1.2.0" };
    expect(satisfiesVersion("1.2.0", spec)).toBe(true);
    expect(satisfiesVersion("1.3.0", spec)).toBe(true);
    expect(satisfiesVersion("2.0.0", spec)).toBe(true);
    expect(satisfiesVersion("1.1.9", spec)).toBe(false);
    expect(satisfiesVersion("0.9.0", spec)).toBe(false);
  });

  it("^ caret: same major and >=", () => {
    const spec = { slug: "x", operator: "^" as const, version: "1.2.0" };
    expect(satisfiesVersion("1.2.0", spec)).toBe(true);
    expect(satisfiesVersion("1.9.0", spec)).toBe(true);
    expect(satisfiesVersion("1.2.1", spec)).toBe(true);
    expect(satisfiesVersion("2.0.0", spec)).toBe(false); // different major
    expect(satisfiesVersion("1.1.0", spec)).toBe(false); // below minimum
    expect(satisfiesVersion("0.2.0", spec)).toBe(false); // different major
  });
});

describe("extractSlug", () => {
  it("extracts from bare slug", () => {
    expect(extractSlug("git-workflow")).toBe("git-workflow");
  });

  it("extracts from versioned spec", () => {
    expect(extractSlug("git-workflow>=1.0.0")).toBe("git-workflow");
    expect(extractSlug("code-review==2.1.0")).toBe("code-review");
    expect(extractSlug("utils^3.0.0")).toBe("utils");
  });
});
