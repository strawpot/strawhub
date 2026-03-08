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

  it("parses YAML list", () => {
    const text = `---
name: code-review
tags:
  - security-baseline
  - git-workflow
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.tags).toEqual([
      "security-baseline",
      "git-workflow",
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
topics:
  - skill-a
  - skill-b
tags:
  - foo
  - bar
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.topics).toEqual(["skill-a", "skill-b"]);
    expect(result.frontmatter.tags).toEqual(["foo", "bar"]);
  });

  it("parses nested object with sub-key arrays", () => {
    const text = `---
name: implementer
config:
  skills:
    - git-workflow
    - code-review
  roles:
    - reviewer
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.name).toBe("implementer");
    expect(result.frontmatter.config).toEqual({
      skills: ["git-workflow", "code-review"],
      roles: ["reviewer"],
    });
  });

  it("parses deeply nested objects (metadata.strawpot.dependencies)", () => {
    const text = `---
name: implementer
metadata:
  strawpot:
    dependencies:
      skills:
        - git-workflow
        - code-review
      roles:
        - reviewer
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.name).toBe("implementer");
    expect(result.frontmatter.metadata).toEqual({
      strawpot: {
        dependencies: {
          skills: ["git-workflow", "code-review"],
          roles: ["reviewer"],
        },
      },
    });
  });

  it("parses skill deps under metadata.strawpot.dependencies as flat array", () => {
    const text = `---
name: code-review
metadata:
  strawpot:
    dependencies:
      - security-baseline
      - git-workflow
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.metadata).toEqual({
      strawpot: {
        dependencies: ["security-baseline", "git-workflow"],
      },
    });
  });

  it("parses deep nesting with scalar values", () => {
    const text = `---
name: implementer
metadata:
  strawpot:
    default_agent: strawpot-claude-code
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.metadata).toEqual({
      strawpot: {
        default_agent: "strawpot-claude-code",
      },
    });
  });

  it("parses nested object followed by another top-level key", () => {
    const text = `---
name: implementer
metadata:
  strawpot:
    dependencies:
      skills:
        - git-workflow
        - code-review
      roles:
        - reviewer
tags:
  - coding
---
Body.
`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter.name).toBe("implementer");
    expect(result.frontmatter.metadata).toEqual({
      strawpot: {
        dependencies: {
          skills: ["git-workflow", "code-review"],
          roles: ["reviewer"],
        },
      },
    });
    expect(result.frontmatter.tags).toEqual(["coding"]);
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
