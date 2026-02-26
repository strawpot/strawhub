import type { GitHubFile } from "./githubImport";
import JSZip from "jszip";

const CLAWHUB_DOWNLOAD_BASE =
  "https://wry-manatee-359.convex.site/api/v1/download";

/**
 * Parse a ClawHub skill URL into its slug.
 * Accepts:
 *   https://clawhub.ai/<owner>/<slug>
 *   https://clawhub.ai/skills/<slug>
 */
function parseClawHubUrl(url: string): string {
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
 * Fetch all files for a ClawHub skill by downloading its zip archive.
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

  const buf = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const files: GitHubFile[] = [];
  const entries: Array<{ path: string; file: JSZip.JSZipObject }> = [];
  zip.forEach((path, file) => {
    if (!file.dir) entries.push({ path, file });
  });

  for (const { path, file } of entries) {
    // Skip hidden directories and metadata
    if (path.startsWith(".") || path === "_meta.json") continue;
    const blob = await file.async("blob");
    files.push({ path, content: blob });
  }

  return files;
}
