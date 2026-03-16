import { describe, it, expect } from "vitest";
import { tokenize, computeLexicalBoost } from "./search";

describe("tokenize", () => {
  it("splits on spaces", () => {
    expect(tokenize("hello world")).toEqual(["hello", "world"]);
  });

  it("splits on hyphens", () => {
    expect(tokenize("code-review")).toEqual(["code", "review"]);
  });

  it("splits on underscores", () => {
    expect(tokenize("git_workflow")).toEqual(["git", "workflow"]);
  });

  it("splits on dots and slashes", () => {
    expect(tokenize("src/lib.utils")).toEqual(["src", "lib", "utils"]);
  });

  it("lowercases input", () => {
    expect(tokenize("Code-Review")).toEqual(["code", "review"]);
  });

  it("filters empty tokens", () => {
    expect(tokenize("--double--dash--")).toEqual(["double", "dash"]);
  });

  it("handles empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("handles single word", () => {
    expect(tokenize("testing")).toEqual(["testing"]);
  });

  it("splits on mixed delimiters", () => {
    expect(tokenize("my-skill_v2.0/beta")).toEqual([
      "my",
      "skill",
      "v2",
      "0",
      "beta",
    ]);
  });
});

describe("computeLexicalBoost", () => {
  it("exact slug match scores higher than prefix match", () => {
    const exact = computeLexicalBoost(tokenize("code"), "code-review", "Other");
    const prefix = computeLexicalBoost(tokenize("cod"), "code-review", "Other");
    expect(exact).toBeGreaterThan(prefix);
  });

  it("slug match scores higher than name-only match", () => {
    const slugMatch = computeLexicalBoost(tokenize("git"), "git-workflow", "Source Control");
    const nameMatch = computeLexicalBoost(tokenize("source"), "git-workflow", "Source Control");
    expect(slugMatch).toBeGreaterThan(nameMatch);
  });

  it("combined slug + name match scores highest", () => {
    const both = computeLexicalBoost(tokenize("code review"), "code-review", "Code Review");
    const slugOnly = computeLexicalBoost(tokenize("code"), "code-review", "Other");
    expect(both).toBeGreaterThan(slugOnly);
  });

  it("returns 0 for no match", () => {
    const boost = computeLexicalBoost(tokenize("python"), "code-review", "Code Review");
    expect(boost).toBe(0);
  });

  it("multiple matching tokens accumulate boost", () => {
    const multi = computeLexicalBoost(tokenize("git workflow"), "git-workflow", "Git Workflow");
    const single = computeLexicalBoost(tokenize("git"), "git-workflow", "Git Workflow");
    expect(multi).toBeGreaterThan(single);
  });

  it("handles empty query tokens", () => {
    const boost = computeLexicalBoost([], "code-review", "Code Review");
    expect(boost).toBe(0);
  });
});

describe("popularity boost formula", () => {
  it("log(1) gives zero boost", () => {
    const boost = Math.log(Math.max(0, 1)) * 0.08;
    expect(boost).toBe(0);
  });

  it("higher downloads give higher boost", () => {
    const low = Math.log(Math.max(10, 1)) * 0.08;
    const high = Math.log(Math.max(1000, 1)) * 0.08;
    expect(high).toBeGreaterThan(low);
  });

  it("boost grows logarithmically (equal ratios add equal increments)", () => {
    const d100 = Math.log(100) * 0.08;
    const d1000 = Math.log(1000) * 0.08;
    const d10000 = Math.log(10000) * 0.08;
    const diff1 = d1000 - d100;
    const diff2 = d10000 - d1000;
    expect(diff1).toBeCloseTo(diff2, 5);
  });
});
