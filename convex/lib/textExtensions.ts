/**
 * File extensions known to be text-based. Used for:
 * - VirusTotal scan gating (skip scan if all files are text)
 * - Frontend binary detection heuristic
 */
export const TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".xml", ".html", ".css",
  ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".sh", ".bash", ".zsh",
  ".env", ".gitignore", ".editorconfig", ".prettierrc", ".eslintrc",
  ".cfg", ".ini", ".conf", ".csv", ".svg", ".lock", ".log",
]);

export function isTextFile(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf(".");
  if (dotIndex === -1) return false;
  return TEXT_EXTENSIONS.has(filePath.slice(dotIndex).toLowerCase());
}

export function allFilesAreText(files: Array<{ path: string }>): boolean {
  return files.length > 0 && files.every((f) => isTextFile(f.path));
}
