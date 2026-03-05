import { describe, it, expect } from "vitest";
import { parseClawHubUrl, transformClawHubFrontmatter } from "./clawhubImport";

describe("parseClawHubUrl", () => {
  it("parses /skills/<slug> format", () => {
    expect(parseClawHubUrl("https://clawhub.ai/skills/git-workflow")).toBe(
      "git-workflow",
    );
  });

  it("parses /<owner>/<slug> format", () => {
    expect(parseClawHubUrl("https://clawhub.ai/alice/my-skill")).toBe(
      "my-skill",
    );
  });

  it("handles trailing slash", () => {
    expect(parseClawHubUrl("https://clawhub.ai/skills/git-workflow/")).toBe(
      "git-workflow",
    );
  });

  it("prefers /skills/ interpretation when path starts with skills", () => {
    expect(parseClawHubUrl("https://clawhub.ai/skills/some-slug")).toBe(
      "some-slug",
    );
  });

  it("works with www subdomain", () => {
    expect(
      parseClawHubUrl("https://www.clawhub.ai/alice/my-skill"),
    ).toBe("my-skill");
  });

  it("throws on non-clawhub URL", () => {
    expect(() => parseClawHubUrl("https://github.com/owner/repo")).toThrow(
      "Not a ClawHub URL",
    );
  });

  it("throws on single-segment path", () => {
    expect(() => parseClawHubUrl("https://clawhub.ai/only-one")).toThrow(
      "Invalid ClawHub URL",
    );
  });

  it("throws on root path", () => {
    expect(() => parseClawHubUrl("https://clawhub.ai/")).toThrow(
      "Invalid ClawHub URL",
    );
  });
});

describe("transformClawHubFrontmatter", () => {
  it("adds strawpot metadata from inline JSON openclaw metadata", () => {
    const input = `---
name: my-skill
metadata: {"openclaw":{"emoji":"🔧","requires":{"bins":["node","curl"]}}}
---
Body content.
`;
    const result = transformClawHubFrontmatter(input);
    expect(result).toContain("strawpot:");
    expect(result).toContain("node:");
    expect(result).toContain('description: "Required binary: node"');
    expect(result).toContain("brew install node");
    expect(result).toContain("curl:");
    expect(result).toContain("brew install curl");
    expect(result).toContain("dependencies: []");
    // Preserves original openclaw
    expect(result).toContain("openclaw:");
    expect(result).toContain("Body content.");
  });

  it("adds strawpot metadata from inline JSON clawdbot metadata", () => {
    const input = `---
name: my-skill
metadata: {"clawdbot":{"requires":{"bins":["python3"]}}}
---
Body.
`;
    const result = transformClawHubFrontmatter(input);
    expect(result).toContain("strawpot:");
    expect(result).toContain("clawdbot:");
    expect(result).toContain("python3:");
    expect(result).toContain("brew install python3");
  });

  it("adds strawpot metadata from YAML-style openclaw metadata", () => {
    const input = `---
name: my-skill
metadata:
  openclaw:
    requires:
      bins:
        - git
        - jq
---
Body.
`;
    const result = transformClawHubFrontmatter(input);
    expect(result).toContain("strawpot:");
    expect(result).toContain("git:");
    expect(result).toContain("jq:");
    expect(result).toContain("brew install git");
    expect(result).toContain("brew install jq");
    // Preserves original block
    expect(result).toContain("openclaw:");
  });

  it("handles no bins gracefully", () => {
    const input = `---
name: my-skill
metadata: {"openclaw":{"emoji":"🔧"}}
---
Body.
`;
    const result = transformClawHubFrontmatter(input);
    expect(result).toContain("strawpot:");
    expect(result).toContain("dependencies: []");
    expect(result).not.toContain("tools:");
  });

  it("handles unknown bins without install hints", () => {
    const input = `---
name: my-skill
metadata: {"openclaw":{"requires":{"bins":["custom-tool"]}}}
---
Body.
`;
    const result = transformClawHubFrontmatter(input);
    expect(result).toContain("custom-tool:");
    expect(result).toContain('"Required binary: custom-tool"');
    expect(result).not.toContain("install:");
  });

  it("skips if strawpot already present", () => {
    const input = `---
name: my-skill
metadata:
  strawpot:
    dependencies: []
---
Body.
`;
    const result = transformClawHubFrontmatter(input);
    expect(result).toBe(input);
  });

  it("returns unchanged if no frontmatter", () => {
    const input = "Just markdown, no frontmatter.";
    expect(transformClawHubFrontmatter(input)).toBe(input);
  });

  it("adds metadata.strawpot when no metadata key exists", () => {
    const input = `---
name: my-skill
---
Body.
`;
    const result = transformClawHubFrontmatter(input);
    expect(result).toContain("metadata:");
    expect(result).toContain("strawpot:");
    expect(result).toContain("dependencies: []");
  });
});
