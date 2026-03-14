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
  it("gives max boost for exact slug + name match", () => {
    const tokens = tokenize("code review");
    const boost = computeLexicalBoost(tokens, "code-review", "Code Review");
    // "code": slug exact (1.4) + name exact (1.1)
    // "review": slug exact (1.4) + name exact (1.1)
    expect(boost).toBeCloseTo(5.0);
  });

  it("gives slug prefix boost when partial match", () => {
    const tokens = tokenize("cod");
    const boost = computeLexicalBoost(tokens, "code-review", "Code Review");
    // "cod": slug prefix (0.8) + name prefix (0.6)
    expect(boost).toBeCloseTo(1.4);
  });

  it("returns 0 for no match", () => {
    const tokens = tokenize("python");
    const boost = computeLexicalBoost(tokens, "code-review", "Code Review");
    expect(boost).toBe(0);
  });

  it("handles slug match but no name match", () => {
    const tokens = tokenize("git");
    const boost = computeLexicalBoost(
      tokens,
      "git-workflow",
      "Source Control Flow",
    );
    // "git": slug exact (1.4), no name match (0)
    expect(boost).toBeCloseTo(1.4);
  });

  it("handles name match but no slug match", () => {
    const tokens = tokenize("source");
    const boost = computeLexicalBoost(
      tokens,
      "git-workflow",
      "Source Control",
    );
    // "source": no slug match, name exact (1.1)
    expect(boost).toBeCloseTo(1.1);
  });

  it("accumulates boost for multiple matching tokens", () => {
    const tokens = tokenize("git workflow");
    const boost = computeLexicalBoost(tokens, "git-workflow", "Git Workflow");
    // "git": slug exact (1.4) + name exact (1.1)
    // "workflow": slug exact (1.4) + name exact (1.1)
    expect(boost).toBeCloseTo(5.0);
  });

  it("prefix match scores lower than exact", () => {
    const exact = computeLexicalBoost(
      tokenize("code"),
      "code-review",
      "Other Name",
    );
    const prefix = computeLexicalBoost(
      tokenize("cod"),
      "code-review",
      "Other Name",
    );
    expect(exact).toBeGreaterThan(prefix);
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
