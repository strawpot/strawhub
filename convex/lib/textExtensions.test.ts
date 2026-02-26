import { describe, it, expect } from "vitest";
import { isTextFile, allFilesAreText, TEXT_EXTENSIONS } from "./textExtensions";

describe("isTextFile", () => {
  it("recognizes common text extensions", () => {
    expect(isTextFile("README.md")).toBe(true);
    expect(isTextFile("config.json")).toBe(true);
    expect(isTextFile("style.css")).toBe(true);
    expect(isTextFile("index.ts")).toBe(true);
    expect(isTextFile("app.tsx")).toBe(true);
    expect(isTextFile("script.js")).toBe(true);
    expect(isTextFile("script.py")).toBe(true);
    expect(isTextFile("deploy.sh")).toBe(true);
    expect(isTextFile("data.yaml")).toBe(true);
    expect(isTextFile("data.yml")).toBe(true);
    expect(isTextFile("config.toml")).toBe(true);
    expect(isTextFile("page.html")).toBe(true);
    expect(isTextFile("icon.svg")).toBe(true);
    expect(isTextFile("package-lock.lock")).toBe(true);
  });

  it("is case-insensitive for extensions", () => {
    expect(isTextFile("FILE.MD")).toBe(true);
    expect(isTextFile("FILE.Json")).toBe(true);
    expect(isTextFile("FILE.CSS")).toBe(true);
  });

  it("returns false for files without extensions", () => {
    expect(isTextFile("LICENSE")).toBe(false);
    expect(isTextFile("Makefile")).toBe(false);
    expect(isTextFile("Dockerfile")).toBe(false);
  });

  it("returns false for unknown extensions", () => {
    expect(isTextFile("image.png")).toBe(false);
    expect(isTextFile("binary.exe")).toBe(false);
    expect(isTextFile("archive.zip")).toBe(false);
    expect(isTextFile("photo.jpg")).toBe(false);
  });

  it("handles nested paths", () => {
    expect(isTextFile("src/components/App.tsx")).toBe(true);
    expect(isTextFile("assets/logo.png")).toBe(false);
  });

  it("handles dotfiles", () => {
    expect(isTextFile(".env")).toBe(true);
    expect(isTextFile(".gitignore")).toBe(true);
    expect(isTextFile(".editorconfig")).toBe(true);
  });
});

describe("allFilesAreText", () => {
  it("returns true when all files have text extensions", () => {
    expect(
      allFilesAreText([
        { path: "SKILL.md" },
        { path: "helper.ts" },
        { path: "config.json" },
      ]),
    ).toBe(true);
  });

  it("returns false when any file has an unknown extension", () => {
    expect(
      allFilesAreText([
        { path: "SKILL.md" },
        { path: "image.png" },
      ]),
    ).toBe(false);
  });

  it("returns false when any file has no extension", () => {
    expect(
      allFilesAreText([
        { path: "SKILL.md" },
        { path: "LICENSE" },
      ]),
    ).toBe(false);
  });

  it("returns false for empty file list", () => {
    expect(allFilesAreText([])).toBe(false);
  });

  it("returns true for a single text file", () => {
    expect(allFilesAreText([{ path: "ROLE.md" }])).toBe(true);
  });
});
