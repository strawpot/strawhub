import { describe, it, expect } from "vitest";
import {
  parseDependencySpec,
  parseVersion,
  compareVersions,
  satisfiesVersion,
  extractSlug,
  splitDependencies,
} from "./versionSpec";

describe("parseDependencySpec", () => {
  it("parses bare slug as skill", () => {
    expect(parseDependencySpec("git-workflow")).toEqual({
      kind: "skill",
      slug: "git-workflow",
      operator: "latest",
      version: null,
    });
  });

  it("parses exact version ==", () => {
    expect(parseDependencySpec("code-review==1.0.0")).toEqual({
      kind: "skill",
      slug: "code-review",
      operator: "==",
      version: "1.0.0",
    });
  });

  it("parses minimum version >=", () => {
    expect(parseDependencySpec("testing>=2.1.0")).toEqual({
      kind: "skill",
      slug: "testing",
      operator: ">=",
      version: "2.1.0",
    });
  });

  it("parses caret version ^", () => {
    expect(parseDependencySpec("utils^1.2.3")).toEqual({
      kind: "skill",
      slug: "utils",
      operator: "^",
      version: "1.2.3",
    });
  });

  it("trims whitespace", () => {
    expect(parseDependencySpec("  git-workflow>=1.0.0  ")).toEqual({
      kind: "skill",
      slug: "git-workflow",
      operator: ">=",
      version: "1.0.0",
    });
  });

  it("handles single-char slug", () => {
    expect(parseDependencySpec("x")).toEqual({
      kind: "skill",
      slug: "x",
      operator: "latest",
      version: null,
    });
  });

  it("parses role: prefix as role dep", () => {
    expect(parseDependencySpec("role:implementer")).toEqual({
      kind: "role",
      slug: "implementer",
      operator: "latest",
      version: null,
    });
  });

  it("parses role: prefix with version", () => {
    expect(parseDependencySpec("role:reviewer>=1.0.0")).toEqual({
      kind: "role",
      slug: "reviewer",
      operator: ">=",
      version: "1.0.0",
    });
  });

  it("parses role: prefix with caret", () => {
    expect(parseDependencySpec("role:fixer^2.0.0")).toEqual({
      kind: "role",
      slug: "fixer",
      operator: "^",
      version: "2.0.0",
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
    const spec = { kind: "skill" as const, slug: "x", operator: "latest" as const, version: null };
    expect(satisfiesVersion("0.0.1", spec)).toBe(true);
    expect(satisfiesVersion("99.99.99", spec)).toBe(true);
  });

  it("== exact match", () => {
    const spec = { kind: "skill" as const, slug: "x", operator: "==" as const, version: "1.2.3" };
    expect(satisfiesVersion("1.2.3", spec)).toBe(true);
    expect(satisfiesVersion("1.2.4", spec)).toBe(false);
    expect(satisfiesVersion("1.2.2", spec)).toBe(false);
  });

  it(">= minimum", () => {
    const spec = { kind: "skill" as const, slug: "x", operator: ">=" as const, version: "1.2.0" };
    expect(satisfiesVersion("1.2.0", spec)).toBe(true);
    expect(satisfiesVersion("1.3.0", spec)).toBe(true);
    expect(satisfiesVersion("2.0.0", spec)).toBe(true);
    expect(satisfiesVersion("1.1.9", spec)).toBe(false);
    expect(satisfiesVersion("0.9.0", spec)).toBe(false);
  });

  it("^ caret: same major and >=", () => {
    const spec = { kind: "skill" as const, slug: "x", operator: "^" as const, version: "1.2.0" };
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

  it("extracts from role: prefixed spec", () => {
    expect(extractSlug("role:implementer")).toBe("implementer");
    expect(extractSlug("role:reviewer>=1.0.0")).toBe("reviewer");
  });
});

describe("splitDependencies", () => {
  it("splits skill-only deps", () => {
    expect(splitDependencies(["code-review", "testing>=1.0.0"])).toEqual({
      skills: ["code-review", "testing>=1.0.0"],
    });
  });

  it("splits role-only deps", () => {
    expect(splitDependencies(["role:implementer", "role:reviewer>=2.0.0"])).toEqual({
      roles: ["implementer", "reviewer>=2.0.0"],
    });
  });

  it("splits mixed deps", () => {
    expect(splitDependencies(["code-review", "role:implementer>=1.0.0", "testing"])).toEqual({
      skills: ["code-review", "testing"],
      roles: ["implementer>=1.0.0"],
    });
  });

  it("returns empty object for empty array", () => {
    expect(splitDependencies([])).toEqual({});
  });

  it("trims whitespace", () => {
    expect(splitDependencies(["  code-review  ", "  role:implementer  "])).toEqual({
      skills: ["code-review"],
      roles: ["implementer"],
    });
  });
});
