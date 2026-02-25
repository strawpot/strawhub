import { describe, it, expect } from "vitest";
import {
  validateSlug,
  validateVersion,
  validateDisplayName,
  validateChangelog,
  validateFiles,
  validateRoleFiles,
  MAX_SLUG_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_CHANGELOG_LENGTH,
  MAX_FILE_SIZE,
  MAX_FILE_COUNT,
} from "./publishValidation";

describe("validateSlug", () => {
  it("accepts valid slugs", () => {
    expect(() => validateSlug("my-skill")).not.toThrow();
    expect(() => validateSlug("a")).not.toThrow();
    expect(() => validateSlug("hello-world-123")).not.toThrow();
    expect(() => validateSlug("0-starts-with-number")).not.toThrow();
  });

  it("rejects empty slug", () => {
    expect(() => validateSlug("")).toThrow(/1-64 characters/);
  });

  it("rejects slug exceeding max length", () => {
    const long = "a".repeat(MAX_SLUG_LENGTH + 1);
    expect(() => validateSlug(long)).toThrow(/1-64 characters/);
  });

  it("accepts slug at max length", () => {
    const exact = "a".repeat(MAX_SLUG_LENGTH);
    expect(() => validateSlug(exact)).not.toThrow();
  });

  it("rejects uppercase characters", () => {
    expect(() => validateSlug("MySkill")).toThrow(/lowercase/);
  });

  it("rejects slugs starting with hyphen", () => {
    expect(() => validateSlug("-bad")).toThrow(/lowercase/);
  });

  it("rejects slugs with spaces", () => {
    expect(() => validateSlug("has space")).toThrow(/lowercase/);
  });

  it("rejects slugs with special characters", () => {
    expect(() => validateSlug("no_underscores")).toThrow(/lowercase/);
    expect(() => validateSlug("no.dots")).toThrow(/lowercase/);
  });
});

describe("validateVersion", () => {
  it("accepts valid semver versions", () => {
    expect(() => validateVersion("1.0.0")).not.toThrow();
    expect(() => validateVersion("0.0.1")).not.toThrow();
    expect(() => validateVersion("10.20.30")).not.toThrow();
  });

  it("rejects missing patch", () => {
    expect(() => validateVersion("1.0")).toThrow(/Invalid version/);
  });

  it("rejects non-numeric", () => {
    expect(() => validateVersion("a.b.c")).toThrow(/Invalid version/);
  });

  it("rejects empty string", () => {
    expect(() => validateVersion("")).toThrow(/Invalid version/);
  });

  it("rejects extra segments", () => {
    expect(() => validateVersion("1.0.0.0")).toThrow(/Invalid version/);
  });
});

describe("validateDisplayName", () => {
  it("accepts valid names", () => {
    expect(() => validateDisplayName("My Skill")).not.toThrow();
    expect(() => validateDisplayName("A")).not.toThrow();
  });

  it("rejects empty name", () => {
    expect(() => validateDisplayName("")).toThrow(/1-128 characters/);
  });

  it("rejects name exceeding max length", () => {
    const long = "x".repeat(MAX_DISPLAY_NAME_LENGTH + 1);
    expect(() => validateDisplayName(long)).toThrow(/1-128 characters/);
  });

  it("accepts name at max length", () => {
    const exact = "x".repeat(MAX_DISPLAY_NAME_LENGTH);
    expect(() => validateDisplayName(exact)).not.toThrow();
  });
});

describe("validateChangelog", () => {
  it("accepts valid changelog", () => {
    expect(() => validateChangelog("Fixed a bug")).not.toThrow();
    expect(() => validateChangelog("")).not.toThrow();
  });

  it("rejects changelog exceeding max length", () => {
    const long = "x".repeat(MAX_CHANGELOG_LENGTH + 1);
    expect(() => validateChangelog(long)).toThrow(/under 10000/);
  });
});

describe("validateFiles", () => {
  const validFile = { path: "SKILL.md", size: 1000 };

  it("accepts valid file list", () => {
    expect(() => validateFiles([validFile])).not.toThrow();
  });

  it("rejects empty file list", () => {
    expect(() => validateFiles([])).toThrow(/At least one file/);
  });

  it("rejects too many files", () => {
    const files = Array.from({ length: MAX_FILE_COUNT + 1 }, (_, i) => ({
      path: `file-${i}.md`,
      size: 100,
    }));
    expect(() => validateFiles(files)).toThrow(/Maximum 20 files/);
  });

  it("accepts exactly MAX_FILE_COUNT files", () => {
    const files = Array.from({ length: MAX_FILE_COUNT }, (_, i) => ({
      path: `file-${i}.md`,
      size: 100,
    }));
    expect(() => validateFiles(files)).not.toThrow();
  });

  it("rejects oversized file", () => {
    const files = [{ path: "big.md", size: MAX_FILE_SIZE + 1 }];
    expect(() => validateFiles(files)).toThrow(/exceeds 512KB/);
  });

  it("accepts file at max size", () => {
    const files = [{ path: "big.md", size: MAX_FILE_SIZE }];
    expect(() => validateFiles(files)).not.toThrow();
  });

  it("rejects when total size exceeds limit", () => {
    const files = Array.from({ length: 5 }, (_, i) => ({
      path: `file-${i}.md`,
      size: MAX_FILE_SIZE, // 512KB each = 2.5MB total > 2MB limit
    }));
    expect(() => validateFiles(files)).toThrow(/Total upload size/);
  });

  it("rejects disallowed extensions", () => {
    const files = [{ path: "script.js", size: 100 }];
    expect(() => validateFiles(files)).toThrow(/extension '.js' not allowed/);
  });

  it("rejects files with no extension", () => {
    const files = [{ path: "Makefile", size: 100 }];
    expect(() => validateFiles(files)).toThrow(/extension '' not allowed/);
  });

  it("accepts all allowed extensions", () => {
    const allowed = [".md", ".txt", ".json", ".yaml", ".yml", ".toml"];
    for (const ext of allowed) {
      expect(() => validateFiles([{ path: `test${ext}`, size: 100 }])).not.toThrow();
    }
  });
});

describe("validateRoleFiles", () => {
  it("accepts exactly one ROLE.md file", () => {
    expect(() => validateRoleFiles([{ path: "ROLE.md", size: 500 }])).not.toThrow();
  });

  it("rejects empty file list", () => {
    expect(() => validateRoleFiles([])).toThrow(/exactly one file: ROLE.md/);
  });

  it("rejects multiple files", () => {
    expect(() =>
      validateRoleFiles([
        { path: "ROLE.md", size: 500 },
        { path: "extra.md", size: 100 },
      ]),
    ).toThrow(/exactly one file: ROLE.md/);
  });

  it("rejects single file that is not ROLE.md", () => {
    expect(() => validateRoleFiles([{ path: "SKILL.md", size: 500 }])).toThrow(
      /exactly one file: ROLE.md/,
    );
  });

  it("rejects lowercase role.md", () => {
    expect(() => validateRoleFiles([{ path: "role.md", size: 500 }])).toThrow(
      /exactly one file: ROLE.md/,
    );
  });
});
