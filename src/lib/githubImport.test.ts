import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "./githubImport";

describe("parseGitHubUrl", () => {
  it("parses raw.githubusercontent.com URL", () => {
    const result = parseGitHubUrl(
      "https://raw.githubusercontent.com/owner/repo/main/path/to/file.md",
    );
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      branch: "main",
      path: "path/to/file.md",
    });
  });

  it("parses raw URL with single-segment path", () => {
    const result = parseGitHubUrl(
      "https://raw.githubusercontent.com/alice/tools/main/SKILL.md",
    );
    expect(result).toEqual({
      owner: "alice",
      repo: "tools",
      branch: "main",
      path: "SKILL.md",
    });
  });

  it("parses github.com/owner/repo (no tree)", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo");
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      branch: "",
      path: "",
    });
  });

  it("parses github.com/owner/repo/tree/branch", () => {
    const result = parseGitHubUrl(
      "https://github.com/owner/repo/tree/main",
    );
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      branch: "main",
      path: "",
    });
  });

  it("parses github.com/owner/repo/tree/branch/path", () => {
    const result = parseGitHubUrl(
      "https://github.com/owner/repo/tree/develop/src/skills",
    );
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      branch: "develop",
      path: "src/skills",
    });
  });

  it("parses github.com URL with deep nested path", () => {
    const result = parseGitHubUrl(
      "https://github.com/org/project/tree/feature-branch/a/b/c/d",
    );
    expect(result).toEqual({
      owner: "org",
      repo: "project",
      branch: "feature-branch",
      path: "a/b/c/d",
    });
  });
});
