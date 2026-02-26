import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState, useRef, useCallback, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import { useSEO } from "../lib/useSEO";
import { parseFrontmatter } from "../lib/parseFrontmatter";
import { sha256Hex } from "../lib/hash";
import { fetchFromGitHub } from "../lib/githubImport";
import { fetchFromClawHub } from "../lib/clawhubImport";
import JSZip from "jszip";

type UploadSearch = { mode?: "import"; updateSlug?: string; kind?: "skill" | "role" };

/** Recursively read all files from a dropped directory entry. */
async function readDirectoryRecursively(
  dirEntry: FileSystemDirectoryEntry,
  basePath: string = "",
): Promise<Array<{ file: File; path: string }>> {
  const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const reader = dirEntry.createReader();
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          readBatch();
        }
      }, reject);
    };
    readBatch();
  });

  const results: Array<{ file: File; path: string }> = [];
  for (const entry of entries) {
    // Skip hidden files/directories
    if (entry.name.startsWith(".")) continue;
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      results.push({ file, path: entryPath });
    } else if (entry.isDirectory) {
      const sub = await readDirectoryRecursively(
        entry as FileSystemDirectoryEntry,
        entryPath,
      );
      results.push(...sub);
    }
  }
  return results;
}

export const Route = createFileRoute("/upload")({
  validateSearch: (search: Record<string, unknown>): UploadSearch => ({
    mode: search.mode === "import" ? "import" : undefined,
    updateSlug: typeof search.updateSlug === "string" ? search.updateSlug : undefined,
    kind: search.kind === "role" ? "role" : search.kind === "skill" ? "skill" : undefined,
  }),
  component: UploadPage,
});

interface UploadFile {
  file: File;
  path: string;
  status: "pending" | "uploading" | "done" | "error";
  storageId?: string;
  sha256?: string;
}

function UploadPage() {
  useSEO({
    title: "Publish - StrawHub",
    description: "Publish or update a skill or role on StrawHub.",
    url: "/upload",
  });

  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const { mode, updateSlug, kind: initialKind } = Route.useSearch();

  const [kind, setKind] = useState<"skill" | "role">(initialKind ?? "skill");
  const [slug, setSlug] = useState(updateSlug ?? "");
  const [displayName, setDisplayName] = useState(
    updateSlug
      ? updateSlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
      : "",
  );
  const [version, setVersion] = useState("");
  const [changelog, setChangelog] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");

  // GitHub import state
  const [githubUrl, setGithubUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [showImport, setShowImport] = useState(mode === "import");
  const [importError, setImportError] = useState<string | null>(null);

  // ClawHub import state
  const [clawhubUrl, setClawhubUrl] = useState("");
  const [isFetchingClawHub, setIsFetchingClawHub] = useState(false);
  const [showClawHubImport, setShowClawHubImport] = useState(false);
  const [clawhubImportError, setClawhubImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const publishSkill = useMutation(api.skills.publish);
  const publishRole = useMutation(api.roles.publish);

  const currentUser = useQuery(api.users.me);
  const existingSkill = useQuery(api.skills.getBySlug, slug.trim() ? { slug: slug.trim() } : "skip");
  const existingRole = useQuery(api.roles.getBySlug, slug.trim() ? { slug: slug.trim() } : "skip");
  const existing = kind === "skill" ? existingSkill : existingRole;
  const isCrossKindConflict = !!(kind === "skill" ? existingRole : existingSkill);
  const isOwnedByOther = !!(existing && currentUser && existing.ownerUserId !== currentUser._id);
  const isUpdate = !!existing && !isOwnedByOther;

  const slugError = (() => {
    const s = slug.trim();
    if (!s) return null;
    if (s.length > 64) return "Slug must be at most 64 characters.";
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s))
      return "Slug must be lowercase alphanumeric with hyphens, starting with a letter or digit.";
    return null;
  })();

  const versionError = (() => {
    const v = version.trim();
    if (!v) return null;
    if (!/^\d+\.\d+\.\d+$/.test(v)) return "Version must be in X.Y.Z format.";
    const latestVer = existing?.latestVersion?.version;
    if (!latestVer) return null;
    const [aMaj, aMin, aPat] = v.split(".").map(Number);
    const [bMaj, bMin, bPat] = latestVer.split(".").map(Number);
    const cmp = aMaj !== bMaj ? aMaj - bMaj : aMin !== bMin ? aMin - bMin : aPat - bPat;
    if (cmp <= 0) return `Version must be greater than the latest version ${latestVer}.`;
    return null;
  })();

  const primaryFile = kind === "skill" ? "SKILL.md" : "ROLE.md";
  const hasPrimaryFile = files.some((f) => f.path === primaryFile);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!slug.trim()) errors.push("Slug is required.");
    else if (slugError) errors.push(slugError);
    if (isCrossKindConflict)
      errors.push(`Slug is already used by a ${kind === "skill" ? "role" : "skill"}.`);
    if (isOwnedByOther) errors.push("Slug is owned by another user.");
    if (!isUpdate && !displayName.trim()) errors.push("Display name is required.");
    if (files.length === 0) errors.push(`At least one file is required.`);
    else if (!hasPrimaryFile) errors.push(`${primaryFile} file is required.`);
    if (kind === "role" && files.length > 0 && (files.length !== 1 || files[0].path !== "ROLE.md"))
      errors.push("Role uploads must contain exactly one file: ROLE.md.");
    if (versionError) errors.push(versionError);
    return errors;
  }, [slug, slugError, isCrossKindConflict, isOwnedByOther, kind, displayName, isUpdate, files, hasPrimaryFile, primaryFile, versionError]);

  const processFiles = useCallback(
    (newFiles: Array<{ file: File; path: string }>) => {
      // Roles only accept a single ROLE.md file
      if (kind === "role") {
        const roleMd = newFiles.find((f) => f.path === "ROLE.md");
        if (!roleMd) {
          setError("Role uploads must contain exactly one file: ROLE.md");
          return;
        }
        newFiles = [roleMd];
      }

      setError(null);

      const incoming: UploadFile[] = newFiles.map((f) => ({
        file: f.file,
        path: f.path,
        status: "pending" as const,
      }));

      // Merge into existing files: new files override same-path entries
      setFiles((prev) => {
        if (kind === "role") return incoming;
        const merged = new Map(prev.map((f) => [f.path, f]));
        for (const f of incoming) merged.set(f.path, f);
        return Array.from(merged.values());
      });

      // Parse frontmatter from the primary file matching the current kind
      const mdFile = kind === "role"
        ? newFiles.find((f) => f.path === "ROLE.md")
        : newFiles.find((f) => f.path === "SKILL.md");

      if (mdFile) {
        mdFile.file.text().then((text) => {
          const { frontmatter } = parseFrontmatter(text);
          if (frontmatter.name && typeof frontmatter.name === "string") {
            setSlug(frontmatter.name);
            setDisplayName(
              frontmatter.name
                .split("-")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" "),
            );
          }
          const meta = frontmatter.metadata as Record<string, unknown> | undefined;
          if (meta?.version) {
            setVersion(String(meta.version));
          }
        });
      }
    },
    [kind],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();

      // Collect all entries synchronously — DataTransfer is cleared after the first await
      const entries: FileSystemEntry[] = [];
      for (const item of Array.from(e.dataTransfer.items)) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }

      const filesWithPaths: Array<{ file: File; path: string }> = [];

      for (const entry of entries) {
        if (entry.isDirectory) {
          const dirFiles = await readDirectoryRecursively(
            entry as FileSystemDirectoryEntry,
          );
          filesWithPaths.push(...dirFiles);
        } else if (entry.isFile) {
          const file = await new Promise<File>((resolve, reject) => {
            (entry as FileSystemFileEntry).file(resolve, reject);
          });
          filesWithPaths.push({ file, path: file.name });
        }
      }

      // Fallback if webkitGetAsEntry is not supported
      if (entries.length === 0) {
        const droppedFiles = Array.from(e.dataTransfer.files);
        filesWithPaths.push(
          ...droppedFiles.map((f) => ({ file: f, path: f.name })),
        );
      }

      if (filesWithPaths.length > 0) processFiles(filesWithPaths);
    },
    [processFiles],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files || []);
      if (selected.length > 0) {
        processFiles(selected.map((f) => ({ file: f, path: f.name })));
      }
    },
    [processFiles],
  );

  const handleFolderSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files || []);
      if (selected.length === 0) return;
      // webkitRelativePath is "folder/subdir/file.txt" — strip the top-level folder name
      const filesWithPaths = selected
        .map((f) => {
          const parts = f.webkitRelativePath.split("/");
          const relativePath = parts.slice(1).join("/");
          return { file: f, path: relativePath || f.name };
        })
        .filter((f) => !f.path.split("/").some((seg) => seg.startsWith(".")));
      if (filesWithPaths.length > 0) processFiles(filesWithPaths);
    },
    [processFiles],
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGitHubImport = async () => {
    if (!githubUrl.trim()) return;
    setIsFetching(true);
    setImportError(null);
    try {
      const ghFiles = await fetchFromGitHub(githubUrl.trim());
      if (ghFiles.length === 0) {
        setImportError("No files found at that URL.");
        return;
      }
      const fileObjects = ghFiles.map((f) => ({
        file: new File([f.content], f.path, { type: "text/plain" }),
        path: f.path,
      }));
      processFiles(fileObjects);
      setShowImport(false);
      setGithubUrl("");
    } catch (e: any) {
      setImportError(e.message || "Failed to fetch from GitHub");
    } finally {
      setIsFetching(false);
    }
  };

  const handleClawHubImport = async () => {
    if (!clawhubUrl.trim()) return;
    setIsFetchingClawHub(true);
    setClawhubImportError(null);
    try {
      const chFiles = await fetchFromClawHub(clawhubUrl.trim());
      if (chFiles.length === 0) {
        setClawhubImportError("No files found at that URL.");
        return;
      }
      const fileObjects = chFiles.map((f) => ({
        file: new File([f.content], f.path, { type: "text/plain" }),
        path: f.path,
      }));
      processFiles(fileObjects);
      setShowClawHubImport(false);
      setClawhubUrl("");
    } catch (e: any) {
      setClawhubImportError(e.message || "Failed to fetch from ClawHub");
    } finally {
      setIsFetchingClawHub(false);
    }
  };

  const handlePublish = async () => {
    if (!slug.trim() || !displayName.trim() || files.length === 0) {
      setError("Slug, display name, and at least one file are required.");
      return;
    }

    const primaryFile = kind === "skill" ? "SKILL.md" : "ROLE.md";
    if (!files.some((f) => f.path === primaryFile)) {
      setError(`A ${primaryFile} file is required.`);
      return;
    }

    if (kind === "role" && (files.length !== 1 || files[0].path !== "ROLE.md")) {
      setError("Role uploads must contain exactly one file: ROLE.md");
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      // Upload each file to Convex storage
      const uploadedFiles: Array<{
        path: string;
        size: number;
        storageId: string;
        sha256: string;
        contentType?: string;
      }> = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadProgress(`Uploading file ${i + 1} of ${files.length}...`);

        setFiles((prev) =>
          prev.map((pf, j) => (j === i ? { ...pf, status: "uploading" } : pf)),
        );

        const uploadUrl = await generateUploadUrl();

        const resp = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": f.file.type || "application/octet-stream" },
          body: f.file,
        });
        if (!resp.ok) throw new Error(`Failed to upload ${f.path}`);

        const { storageId } = await resp.json();
        const hash = await sha256Hex(f.file);

        uploadedFiles.push({
          path: f.path,
          size: f.file.size,
          storageId,
          sha256: hash,
          contentType: f.file.type || undefined,
        });

        setFiles((prev) =>
          prev.map((pf, j) =>
            j === i ? { ...pf, status: "done", storageId, sha256: hash } : pf,
          ),
        );
      }

      // Resolve version for zip folder name
      const resolvedVersion = version.trim() || (() => {
        const latestVer = existing?.latestVersion?.version;
        if (!latestVer) return "1.0.0";
        const parts = latestVer.split(".");
        return `${parts[0]}.${parts[1]}.${parseInt(parts[2] || "0") + 1}`;
      })();
      const zipPrefix = `${slug.trim()}-${resolvedVersion}`;

      // Create and upload zip archive
      setUploadProgress("Creating archive...");
      const zip = new JSZip();
      for (const f of files) {
        zip.file(`${zipPrefix}/${f.path}`, f.file);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });

      setUploadProgress("Uploading archive...");
      const zipUploadUrl = await generateUploadUrl();
      const zipResp = await fetch(zipUploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: zipBlob,
      });
      if (!zipResp.ok) throw new Error("Failed to upload zip archive");
      const { storageId: zipStorageId } = await zipResp.json();

      setUploadProgress("Publishing...");

      const resolvedDisplayName = isUpdate
        ? (existing?.displayName ?? displayName.trim())
        : displayName.trim();

      if (kind === "skill") {
        const skillMdFile = files.find((f) => f.path === "SKILL.md");
        const skillMdText = skillMdFile ? await skillMdFile.file.text() : undefined;
        await publishSkill({
          slug: slug.trim(),
          displayName: resolvedDisplayName,
          version: version.trim() || undefined,
          changelog: changelog.trim(),
          files: uploadedFiles as any,
          skillMdText,
          zipStorageId,
        });
      } else {
        const roleMdFile = files.find((f) => f.path === "ROLE.md");
        const roleMdText = roleMdFile ? await roleMdFile.file.text() : undefined;
        await publishRole({
          slug: slug.trim(),
          displayName: resolvedDisplayName,
          version: version.trim() || undefined,
          changelog: changelog.trim(),
          files: uploadedFiles as any,
          roleMdText,
          zipStorageId,
        });
      }

      navigate({ to: kind === "skill" ? "/skills" : "/roles" });
    } catch (e: any) {
      const raw = e.message || "Publish failed";
      // Strip Convex internal prefix and stack trace to show only the meaningful error
      const cleaned = raw
        .replace(/^\[CONVEX [^\]]*\]\s*(\[Request ID: [^\]]*\]\s*)?Server Error\s*Uncaught Error:\s*/i, "")
        .replace(/[\s\n]+at\s+\S+\s*\(.*$/s, "")
        .trim();
      setError(cleaned);
      setFiles((prev) =>
        prev.map((f) => (f.status === "uploading" ? { ...f, status: "error" } : f)),
      );
    } finally {
      setIsPublishing(false);
      setUploadProgress("");
    }
  };

  if (isLoading) {
    return <p className="text-gray-400">Loading...</p>;
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-3xl font-bold text-white">Publish</h1>
        <div className="rounded-lg border border-gray-800 p-8 text-center">
          <p className="text-gray-400 mb-4">
            Sign in with GitHub to publish roles and skills.
          </p>
          <button
            onClick={() => void signIn("github")}
            className="rounded bg-gray-800 px-6 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Sign in with GitHub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold text-white">Publish</h1>

      {/* GitHub Import */}
      <div className="rounded-lg border border-gray-800">
        <button
          onClick={() => setShowImport(!showImport)}
          className="w-full px-4 py-3 text-left text-sm font-medium text-gray-300 hover:text-white flex items-center justify-between"
        >
          <span>Import from GitHub</span>
          <span className="text-gray-500">{showImport ? "−" : "+"}</span>
        </button>
        {showImport && (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs text-gray-500">
              Paste a GitHub URL to import files. Supports repo URLs, directory
              paths, and raw file links.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/user/repo/tree/main/skills/my-skill"
                className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
              />
              <button
                onClick={handleGitHubImport}
                disabled={isFetching || !githubUrl.trim()}
                className="rounded bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {isFetching ? "Fetching..." : "Fetch"}
              </button>
            </div>
            {importError && (
              <p className="text-sm text-red-400">{importError}</p>
            )}
          </div>
        )}
      </div>

      {/* ClawHub Import — skills only */}
      {kind === "skill" && (
        <div className="rounded-lg border border-gray-800">
          <button
            onClick={() => setShowClawHubImport(!showClawHubImport)}
            className="w-full px-4 py-3 text-left text-sm font-medium text-gray-300 hover:text-white flex items-center justify-between"
          >
            <span>Import from ClawHub</span>
            <span className="text-gray-500">{showClawHubImport ? "−" : "+"}</span>
          </button>
          {showClawHubImport && (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-gray-500">
                Paste a ClawHub skill URL to import all files.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={clawhubUrl}
                  onChange={(e) => setClawhubUrl(e.target.value)}
                  placeholder="https://clawhub.ai/owner/my-skill"
                  className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                />
                <button
                  onClick={handleClawHubImport}
                  disabled={isFetchingClawHub || !clawhubUrl.trim()}
                  className="rounded bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {isFetchingClawHub ? "Fetching..." : "Fetch"}
                </button>
              </div>
              {clawhubImportError && (
                <p className="text-sm text-red-400">{clawhubImportError}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {/* Kind Toggle */}
        <div className="flex gap-4">
          <button
            onClick={() => { setKind("skill"); setFiles([]); setError(null); }}
            className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
              kind === "skill"
                ? "bg-orange-500 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Skill
          </button>
          <button
            onClick={() => { setKind("role"); setFiles([]); setError(null); }}
            className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
              kind === "role"
                ? "bg-orange-500 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Role
          </button>
        </div>

        {/* File Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={kind === "role" ? () => fileInputRef.current?.click() : undefined}
          className={`rounded border border-dashed border-gray-700 p-8 text-center hover:border-gray-500 transition-colors ${kind === "role" ? "cursor-pointer" : ""}`}
        >
          {files.length === 0 ? (
            <p className="text-gray-400 text-sm">
              {kind === "role"
                ? "Drop your ROLE.md file here, or click to browse."
                : <>
                    Drop your SKILL.md and supporting files or folder here, or browse{" "}
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="text-orange-400 hover:text-orange-300 underline cursor-pointer"
                    >
                      files
                    </span>
                    {" or "}
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        folderInputRef.current?.click();
                      }}
                      className="text-orange-400 hover:text-orange-300 underline cursor-pointer"
                    >
                      folder
                    </span>.
                  </>
              }
            </p>
          ) : (
            <div className="space-y-2">
              {kind === "skill" && !isPublishing && files.length > 1 && (
                <div className="flex justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiles([]);
                    }}
                    className="text-red-400 hover:text-red-300 text-xs underline"
                  >
                    Clear all
                  </button>
                </div>
              )}
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-300">{f.path}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs">
                      {(f.file.size / 1024).toFixed(1)} KB
                    </span>
                    {f.status === "done" && (
                      <span className="text-green-400 text-xs">uploaded</span>
                    )}
                    {f.status === "uploading" && (
                      <span className="text-orange-400 text-xs">
                        uploading...
                      </span>
                    )}
                    {f.status === "error" && (
                      <span className="text-red-400 text-xs">error</span>
                    )}
                    {!isPublishing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        className="text-gray-500 hover:text-red-400 text-xs"
                      >
                        remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <p className="text-gray-500 text-xs mt-2">
                {kind === "role"
                  ? "Click or drop to replace."
                  : <>
                      Drop to replace, or browse{" "}
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="text-orange-400 hover:text-orange-300 underline cursor-pointer"
                      >
                        files
                      </span>
                      {" or "}
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          folderInputRef.current?.click();
                        }}
                        className="text-orange-400 hover:text-orange-300 underline cursor-pointer"
                      >
                        folder
                      </span>.
                    </>
                }
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple={kind !== "role"}
            accept={kind === "role" ? ".md" : undefined}
            onChange={handleFileSelect}
            className="hidden"
          />
          {kind !== "role" && (
            <input
              ref={folderInputRef}
              type="file"
              onChange={handleFolderSelect}
              className="hidden"
              {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
            />
          )}
        </div>

        {/* Form Fields */}
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-gray-400">Slug</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={kind === "role" ? "my-role" : "my-skill"}
              className={`mt-1 block w-full rounded border bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:outline-none ${
                slugError || (slug.trim() && isCrossKindConflict) || (slug.trim() && existing !== undefined && isOwnedByOther)
                  ? "border-red-600 focus:border-red-500"
                  : slug.trim() && existing !== undefined && isUpdate
                    ? "border-yellow-600 focus:border-yellow-500"
                    : "border-gray-700 focus:border-orange-400"
              }`}
            />
            {slugError && (
              <p className="mt-1 text-xs text-red-400">{slugError}</p>
            )}
            {!slugError && slug.trim() && isCrossKindConflict && (
              <p className="mt-1 text-xs text-red-400">
                This slug is already used by a {kind === "skill" ? "role" : "skill"}.
              </p>
            )}
            {!slugError && slug.trim() && !isCrossKindConflict && existing !== undefined && isOwnedByOther && (
              <p className="mt-1 text-xs text-red-400">
                This slug is owned by another user.
              </p>
            )}
            {!slugError && slug.trim() && !isCrossKindConflict && existing !== undefined && isUpdate && (
              <p className="mt-1 text-xs text-yellow-500">
                This {kind} already exists — publishing will create a new version.
              </p>
            )}
          </label>

          <label className="block">
            <span className="text-sm text-gray-400">Display Name</span>
            <input
              type="text"
              value={isUpdate ? (existing?.displayName ?? displayName) : displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={kind === "role" ? "My Role" : "My Skill"}
              disabled={isUpdate}
              className={`mt-1 block w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:outline-none ${
                isUpdate
                  ? "opacity-60 cursor-not-allowed"
                  : "focus:border-orange-400"
              }`}
            />
            {isUpdate && (
              <p className="mt-1 text-xs text-gray-500">
                Display name cannot be changed for existing {kind}s.
              </p>
            )}
          </label>

          <label className="block">
            <span className="text-sm text-gray-400">Version (optional)</span>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="Auto-incremented if empty"
              className={`mt-1 block w-full rounded border bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:outline-none ${
                versionError
                  ? "border-red-600 focus:border-red-500"
                  : "border-gray-700 focus:border-orange-400"
              }`}
            />
            {versionError && (
              <p className="mt-1 text-xs text-red-400">{versionError}</p>
            )}
          </label>

          <label className="block">
            <span className="text-sm text-gray-400">Changelog</span>
            <textarea
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              placeholder="What's new in this version..."
              rows={3}
              className="mt-1 block w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
            />
          </label>

        </div>

        {/* Error */}
        {error && (
          <div className="rounded border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Progress */}
        {uploadProgress && (
          <p className="text-sm text-orange-400">{uploadProgress}</p>
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="rounded border border-yellow-800 bg-yellow-950 px-4 py-3 text-sm text-yellow-300">
            <p className="font-medium mb-1">Requirements not met:</p>
            <ul className="list-disc list-inside space-y-0.5 text-yellow-400">
              {validationErrors.map((msg: string, i: number) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Publish Button */}
        <button
          onClick={handlePublish}
          disabled={isPublishing || validationErrors.length > 0}
          className="w-full rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPublishing
            ? "Publishing..."
            : isUpdate
              ? `Update ${kind === "skill" ? "Skill" : "Role"}`
              : `Publish ${kind === "skill" ? "Skill" : "Role"}`}
        </button>
      </div>
    </div>
  );
}
