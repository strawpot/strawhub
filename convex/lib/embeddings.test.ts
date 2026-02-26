import { describe, it, expect } from "vitest";
import { buildEmbeddingText } from "./embeddings";

describe("buildEmbeddingText", () => {
  it("includes name and displayName", () => {
    const result = buildEmbeddingText({
      name: "git-workflow",
      displayName: "Git Workflow",
    });
    expect(result).toBe("git-workflow Git Workflow");
  });

  it("includes summary when provided", () => {
    const result = buildEmbeddingText({
      name: "test",
      displayName: "Test Skill",
      summary: "A testing utility",
    });
    expect(result).toBe("test Test Skill A testing utility");
  });

  it("includes description when provided", () => {
    const result = buildEmbeddingText({
      name: "test",
      displayName: "Test",
      description: "Detailed description here",
    });
    expect(result).toBe("test Test Detailed description here");
  });

  it("includes tags joined by spaces", () => {
    const result = buildEmbeddingText({
      name: "test",
      displayName: "Test",
      tags: ["ci", "testing", "quality"],
    });
    expect(result).toBe("test Test ci testing quality");
  });

  it("includes all fields when provided", () => {
    const result = buildEmbeddingText({
      name: "code-review",
      displayName: "Code Review",
      summary: "Automated code review",
      description: "Reviews pull requests",
      tags: ["review", "pr"],
    });
    expect(result).toBe(
      "code-review Code Review Automated code review Reviews pull requests review pr",
    );
  });

  it("skips empty tags array", () => {
    const result = buildEmbeddingText({
      name: "test",
      displayName: "Test",
      tags: [],
    });
    expect(result).toBe("test Test");
  });
});
