import { describe, it, expect } from "vitest";
import { parseClawHubUrl } from "./clawhubImport";

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
