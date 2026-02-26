import { describe, it, expect } from "vitest";
import {
  validateSlug,
  validateVersion,
  validateDisplayName,
  validateChangelog,
  validateFiles,
  validateRoleFiles,
  assertRoleFileIsText,
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

  it("accepts any file extension", () => {
    expect(() => validateFiles([{ path: "script.js", size: 100 }])).not.toThrow();
    expect(() => validateFiles([{ path: "Makefile", size: 100 }])).not.toThrow();
    expect(() => validateFiles([{ path: "handler.py", size: 100 }])).not.toThrow();
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

describe("assertRoleFileIsText", () => {
  it("accepts valid markdown text", () => {
    const buf = new TextEncoder().encode("# My Role\n\nThis is a role file.");
    expect(() => assertRoleFileIsText("ROLE.md", buf)).not.toThrow();
  });

  it("accepts empty file", () => {
    expect(() => assertRoleFileIsText("ROLE.md", new Uint8Array(0))).not.toThrow();
  });

  it("accepts file with YAML frontmatter", () => {
    const buf = new TextEncoder().encode("---\ntitle: Test\n---\n# Hello");
    expect(() => assertRoleFileIsText("ROLE.md", buf)).not.toThrow();
  });

  it("rejects file without recognized text extension", () => {
    const buf = new TextEncoder().encode("just text");
    expect(() => assertRoleFileIsText("binary.exe", buf)).toThrow(
      /does not have a recognized text file extension/,
    );
  });

  it("rejects PNG disguised as .md", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(() => assertRoleFileIsText("ROLE.md", png)).toThrow(
      /binary file signature/,
    );
  });

  it("rejects ZIP disguised as .md", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(() => assertRoleFileIsText("ROLE.md", zip)).toThrow(
      /binary file signature/,
    );
  });

  it("rejects PDF disguised as .md", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(() => assertRoleFileIsText("ROLE.md", pdf)).toThrow(
      /binary file signature/,
    );
  });

  it("rejects file with null bytes (unknown binary)", () => {
    const buf = new Uint8Array([0x41, 0x42, 0x43, 0x00, 0x44, 0x45]);
    expect(() => assertRoleFileIsText("ROLE.md", buf)).toThrow(
      /contains null bytes/,
    );
  });

  it("rejects ELF binary disguised as .md", () => {
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02]);
    expect(() => assertRoleFileIsText("ROLE.md", elf)).toThrow(
      /binary file signature/,
    );
  });
});
