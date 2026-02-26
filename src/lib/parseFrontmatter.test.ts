import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "./parseFrontmatter";

describe("parseFrontmatter", () => {
  it("parses basic key-value pairs", () => {
    const text = `---
name: my-skill
description: "A cool skill"
---
Body content here.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.name).toBe("my-skill");
    expect(result.frontmatter.description).toBe("A cool skill");
    expect(result.body).toBe("Body content here.\n");
  });

  it("returns empty frontmatter when no delimiters", () => {
    const text = "Just plain markdown.";
    const result = parseFrontmatter(text);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("Just plain markdown.");
  });

  it("parses YAML list dependencies", () => {
    const text = `---
name: code-review
dependencies:
  - security-baseline
  - git-workflow>=1.0.0
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.dependencies).toEqual([
      "security-baseline",
      "git-workflow>=1.0.0",
    ]);
  });

  it("parses inline array", () => {
    const text = `---
tags: [testing, ci, quality]
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.tags).toEqual(["testing", "ci", "quality"]);
  });

  it("parses inline array with quoted values", () => {
    const text = `---
tags: ["testing", 'ci']
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.tags).toEqual(["testing", "ci"]);
  });

  it("parses boolean values", () => {
    const text = `---
enabled: true
disabled: false
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.enabled).toBe(true);
    expect(result.frontmatter.disabled).toBe(false);
  });

  it("parses numeric values", () => {
    const text = `---
count: 42
ratio: 3.14
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.count).toBe(42);
    expect(result.frontmatter.ratio).toBe(3.14);
  });

  it("parses single-quoted strings", () => {
    const text = `---
name: 'my-skill'
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.name).toBe("my-skill");
  });

  it("preserves unquoted string values", () => {
    const text = `---
name: my-skill
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.name).toBe("my-skill");
  });

  it("handles empty body", () => {
    const text = `---
name: test
---
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.name).toBe("test");
    expect(result.body).toBe("");
  });

  it("handles multiple YAML lists", () => {
    const text = `---
dependencies:
  - skill-a
  - skill-b
tags:
  - foo
  - bar
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.dependencies).toEqual(["skill-a", "skill-b"]);
    expect(result.frontmatter.tags).toEqual(["foo", "bar"]);
  });

  it("handles mixed scalar and list fields", () => {
    const text = `---
name: implementer
description: "One-line summary"
dependencies:
  - git-workflow>=1.0.0
  - role:reviewer
---
Instructions here.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.name).toBe("implementer");
    expect(result.frontmatter.description).toBe("One-line summary");
    expect(result.frontmatter.dependencies).toEqual([
      "git-workflow>=1.0.0",
      "role:reviewer",
    ]);
    expect(result.body).toBe("Instructions here.\n");
  });

  it("skips blank lines in frontmatter", () => {
    const text = `---
name: test

description: "hello"
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.name).toBe("test");
    expect(result.frontmatter.description).toBe("hello");
  });
});
