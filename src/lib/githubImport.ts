export interface GitHubFile {
  path: string;
  content: Blob;
}

interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

/**
 * Parse a GitHub URL into its components.
 */
function parseGitHubUrl(url: string): ParsedGitHubUrl {
  const u = new URL(url);

  // raw.githubusercontent.com/owner/repo/branch/path
  if (u.hostname === "raw.githubusercontent.com") {
    const parts = u.pathname.slice(1).split("/");
    return {
      owner: parts[0],
      repo: parts[1],
      branch: parts[2],
      path: parts.slice(3).join("/"),
    };
  }

  // github.com/owner/repo[/tree/branch/path]
  const parts = u.pathname.slice(1).split("/");
  const owner = parts[0];
  const repo = parts[1];

  if (parts[2] === "tree" && parts.length >= 4) {
    return {
      owner,
      repo,
      branch: parts[3],
      path: parts.slice(4).join("/"),
    };
  }

  return { owner, repo, branch: "", path: "" };
}

/**
 * Fetch files from a GitHub repository URL.
 * Uses the GitHub Contents API (public, no auth needed for public repos).
 */
export async function fetchFromGitHub(url: string): Promise<GitHubFile[]> {
  const { owner, repo, branch, path } = parseGitHubUrl(url);

  // For raw URLs pointing to a single file
  if (new URL(url).hostname === "raw.githubusercontent.com") {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch: ${resp.status}`);
    const blob = await resp.blob();
    const fileName = path.split("/").pop() || "file";
    return [{ path: fileName, content: blob }];
  }

  const refParam = branch ? `?ref=${branch}` : "";
  const apiUrl = path
    ? `https://api.github.com/repos/${owner}/${repo}/contents/${path}${refParam}`
    : `https://api.github.com/repos/${owner}/${repo}/contents${refParam}`;

  const resp = await fetch(apiUrl, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);

  const data = await resp.json();

  // Single file response
  if (!Array.isArray(data)) {
    if (data.type !== "file" || !data.content) {
      throw new Error("Not a file");
    }
    const content = atob(data.content.replace(/\n/g, ""));
    const blob = new Blob([content], { type: "text/plain" });
    return [{ path: data.name, content: blob }];
  }

  // Directory listing — recursively fetch all files
  const headers = { Accept: "application/vnd.github.v3+json" };
  const files: GitHubFile[] = [];

  async function fetchDir(
    entries: Array<{ type: string; size: number; name: string; path: string; download_url: string }>,
    prefix: string,
  ) {
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      if (entry.type === "file" && entry.size < 1_000_000) {
        const fileResp = await fetch(entry.download_url);
        if (!fileResp.ok) continue;
        const blob = await fileResp.blob();
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        files.push({ path: relativePath, content: blob });
      } else if (entry.type === "dir") {
        const dirUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${entry.path}${refParam}`;
        const dirResp = await fetch(dirUrl, { headers });
        if (!dirResp.ok) continue;
        const dirData = await dirResp.json();
        if (Array.isArray(dirData)) {
          await fetchDir(dirData, prefix ? `${prefix}/${entry.name}` : entry.name);
        }
      }
    }
  }

  await fetchDir(data, "");
  return files;
}
