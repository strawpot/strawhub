import type { GitHubFile } from "./githubImport";
import JSZip from "jszip";

const CLAWHUB_DOWNLOAD_BASE =
  "https://wry-manatee-359.convex.site/api/v1/download";

const INSTALL_HINTS: Record<string, Record<string, string>> = {
  node: {
    macos: "brew install node",
    linux: "apt install nodejs",
    windows: "winget install OpenJS.NodeJS",
  },
  python3: {
    macos: "brew install python3",
    linux: "apt install python3",
    windows: "winget install Python.Python.3",
  },
  python: { macos: "brew install python3", linux: "apt install python3" },
  curl: { macos: "brew install curl", linux: "apt install curl" },
  jq: { macos: "brew install jq", linux: "apt install jq" },
  git: { macos: "brew install git", linux: "apt install git" },
  ffmpeg: { macos: "brew install ffmpeg", linux: "apt install ffmpeg" },
  cwebp: { macos: "brew install webp", linux: "apt install webp" },
  gh: {
    macos: "brew install gh",
    linux: "apt install gh",
    windows: "winget install GitHub.cli",
  },
};

/**
 * Parse a ClawHub skill URL into its slug.
 * Accepts:
 *   https://clawhub.ai/<owner>/<slug>
 *   https://clawhub.ai/skills/<slug>
 */
export function parseClawHubUrl(url: string): string {
  const u = new URL(url);
  if (!u.hostname.endsWith("clawhub.ai")) {
    throw new Error("Not a ClawHub URL");
  }
  const parts = u.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  // /skills/<slug>
  if (parts.length >= 2 && parts[0] === "skills") {
    return parts[1];
  }
  // /<owner>/<slug>
  if (parts.length >= 2) {
    return parts[1];
  }
  throw new Error(
    "Invalid ClawHub URL. Expected: https://clawhub.ai/<owner>/<slug>",
  );
}

/**
 * Extract openclaw/clawdbot metadata from parsed frontmatter.
 * Handles both inline JSON (`metadata: {"openclaw":{...}}`) and nested YAML objects.
 */
function extractOpenclawMeta(
  fmText: string,
): Record<string, unknown> {
  // Try inline JSON: `metadata: {"openclaw":...}` or `metadata: {"clawdbot":...}`
  const inlineMatch = fmText.match(
    /^metadata:\s*(\{.*\})\s*$/m,
  );
  if (inlineMatch) {
    try {
      const parsed = JSON.parse(inlineMatch[1]);
      return parsed.openclaw ?? parsed.clawdbot ?? {};
    } catch {
      // fall through to YAML-style parsing
    }
  }

  // YAML-style: look for metadata.openclaw or metadata.clawdbot block
  // Extract requires.bins array
  const blockMatch = fmText.match(
    /^\s+(?:openclaw|clawdbot):\s*$/m,
  );
  if (!blockMatch) return {};

  const bins: string[] = [];
  const binsMatch = fmText.match(
    /requires:\s*\n\s+bins:\s*\n((?:\s+-\s+\S+\n?)+)/,
  );
  if (binsMatch) {
    for (const m of binsMatch[1].matchAll(/^\s+-\s+(\S+)/gm)) {
      bins.push(m[1]);
    }
  }

  // Also try inline bins: `bins: [node, curl]`
  const inlineBins = fmText.match(/bins:\s*\[([^\]]*)\]/);
  if (inlineBins) {
    for (const b of inlineBins[1].split(",")) {
      const trimmed = b.trim().replace(/^["']|["']$/g, "");
      if (trimmed) bins.push(trimmed);
    }
  }

  if (bins.length > 0) {
    return { requires: { bins } };
  }
  return {};
}

/**
 * Build strawpot metadata from openclaw/clawdbot metadata.
 * Maps requires.bins → tools.<name> with per-platform install hints.
 */
function buildStrawpotMetadata(
  openclaw: Record<string, unknown>,
): Record<string, unknown> {
  const strawpot: Record<string, unknown> = { dependencies: [] };
  const requires = openclaw.requires as
    | Record<string, unknown>
    | undefined;
  const bins = (requires?.bins as string[]) ?? [];

  if (bins.length > 0) {
    const tools: Record<string, unknown> = {};
    for (const b of bins) {
      const entry: Record<string, unknown> = {
        description: `Required binary: ${b}`,
      };
      if (b in INSTALL_HINTS) {
        entry.install = INSTALL_HINTS[b];
      }
      tools[b] = entry;
    }
    strawpot.tools = tools;
  }

  return strawpot;
}

/**
 * Serialize a nested object as YAML lines with the given base indent.
 */
function toYamlLines(obj: unknown, indent: number): string[] {
  const prefix = " ".repeat(indent);
  const lines: string[] = [];

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      // handled by caller as inline `[]`
      return [];
    }
    for (const item of obj) {
      lines.push(`${prefix}- ${String(item)}`);
    }
    return lines;
  }

  if (typeof obj === "object" && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        lines.push(`${prefix}${key}:`);
        lines.push(...toYamlLines(value, indent + 2));
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${prefix}${key}: []`);
        } else {
          lines.push(`${prefix}${key}:`);
          lines.push(...toYamlLines(value, indent + 2));
        }
      } else {
        lines.push(`${prefix}${key}: ${JSON.stringify(value)}`);
      }
    }
    return lines;
  }

  return [`${prefix}${String(obj)}`];
}

/**
 * Transform SKILL.md frontmatter: add metadata.strawpot alongside
 * existing metadata.openclaw / metadata.clawdbot.
 */
export function transformClawHubFrontmatter(skillMd: string): string {
  const fmMatch = skillMd.match(/^---\s*\n([\s\S]*?\n)---\s*\n/);
  if (!fmMatch) return skillMd;

  const fmText = fmMatch[1];
  const afterFm = skillMd.slice(fmMatch[0].length);

  // Already has strawpot metadata — skip
  if (/^\s+strawpot:/m.test(fmText)) return skillMd;

  const openclaw = extractOpenclawMeta(fmText);
  const strawpot = buildStrawpotMetadata(openclaw);

  // Build the strawpot YAML block
  const strawpotLines = toYamlLines({ strawpot }, 4);
  const strawpotBlock = strawpotLines.join("\n");

  let newFm: string;

  // Case 1: inline JSON metadata — replace with multi-line YAML
  const inlineMatch = fmText.match(
    /^(metadata:\s*\{.*\})\s*$/m,
  );
  if (inlineMatch) {
    // Parse the inline JSON to get the original key (openclaw or clawdbot)
    const jsonStr = inlineMatch[1].replace(/^metadata:\s*/, "");
    try {
      const parsed = JSON.parse(jsonStr);
      const origKey = "openclaw" in parsed ? "openclaw" : "clawdbot";
      const origValue = parsed[origKey];

      // Build multi-line YAML for the original metadata
      const origLines = toYamlLines({ [origKey]: origValue }, 4);

      const metaBlock = [
        "metadata:",
        ...origLines,
        ...strawpotLines,
      ].join("\n");

      newFm = fmText.replace(inlineMatch[1], metaBlock);
    } catch {
      // JSON parse failed — just append strawpot under metadata
      newFm = fmText.replace(
        inlineMatch[1],
        `${inlineMatch[1]}\n${strawpotBlock}`,
      );
    }
  } else if (/^metadata:\s*$/m.test(fmText)) {
    // Case 2: multi-line YAML metadata block — append strawpot at end of metadata
    // Find the last line that belongs to the metadata block
    const lines = fmText.split("\n");
    const metaIdx = lines.findIndex((l) => /^metadata:\s*$/.test(l));
    if (metaIdx >= 0) {
      // Find the end of the metadata block (next top-level key or end)
      let endIdx = metaIdx + 1;
      while (endIdx < lines.length) {
        const line = lines[endIdx];
        if (line.trim() === "") {
          endIdx++;
          continue;
        }
        // Top-level key (no leading whitespace)
        if (/^\S/.test(line)) break;
        endIdx++;
      }
      // Insert strawpot lines before endIdx
      lines.splice(endIdx, 0, ...strawpotLines);
      newFm = lines.join("\n");
    } else {
      newFm = fmText;
    }
  } else {
    // Case 3: no metadata key at all — add metadata.strawpot
    const block = ["metadata:", ...strawpotLines].join("\n");
    newFm = fmText.trimEnd() + "\n" + block + "\n";
  }

  return `---\n${newFm}---\n${afterFm}`;
}

/**
 * Fetch all files for a ClawHub skill by downloading its zip archive.
 * Transforms SKILL.md frontmatter to add metadata.strawpot.
 */
export async function fetchFromClawHub(url: string): Promise<GitHubFile[]> {
  const slug = parseClawHubUrl(url);

  const resp = await fetch(
    `${CLAWHUB_DOWNLOAD_BASE}?slug=${encodeURIComponent(slug)}`,
  );
  if (!resp.ok) {
    if (resp.status === 404) throw new Error("Skill not found on ClawHub");
    throw new Error(`ClawHub download error: ${resp.status}`);
  }

  const MAX_ZIP_FILES = 100;
  const MAX_ZIP_TOTAL = 50 * 1024 * 1024; // 50 MB uncompressed

  const buf = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const files: GitHubFile[] = [];
  const entries: Array<{ path: string; file: JSZip.JSZipObject }> = [];
  zip.forEach((path, file) => {
    if (!file.dir) entries.push({ path, file });
  });

  if (entries.length > MAX_ZIP_FILES) {
    throw new Error(`Zip contains too many files (${entries.length}, max ${MAX_ZIP_FILES})`);
  }

  let totalSize = 0;
  for (const { path, file } of entries) {
    // Skip hidden directories and metadata
    if (path.startsWith(".") || path === "_meta.json") continue;

    if (path === "SKILL.md") {
      // Transform SKILL.md frontmatter to add metadata.strawpot
      const text = await file.async("string");
      totalSize += text.length;
      if (totalSize > MAX_ZIP_TOTAL) throw new Error("Zip uncompressed size exceeds 50MB limit");
      const transformed = transformClawHubFrontmatter(text);
      const blob = new Blob([transformed], { type: "text/markdown" });
      files.push({ path, content: blob });
    } else {
      const blob = await file.async("blob");
      totalSize += blob.size;
      if (totalSize > MAX_ZIP_TOTAL) throw new Error("Zip uncompressed size exceeds 50MB limit");
      files.push({ path, content: blob });
    }
  }

  return files;
}
