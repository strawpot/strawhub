/**
 * File extensions known to be text-based. Used for:
 * - VirusTotal scan gating (skip scan if all files are text)
 * - Frontend binary detection heuristic
 */
export const TEXT_EXTENSIONS = new Set([
  // Markdown / plain text
  ".md", ".mdx", ".txt",
  // Data / config
  ".json", ".json5", ".yaml", ".yml", ".toml", ".xml", ".ini", ".cfg",
  ".env", ".csv", ".conf",
  // JavaScript / TypeScript
  ".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx",
  // Python / Ruby / Shell
  ".py", ".rb", ".sh", ".bash", ".zsh",
  // Compiled languages
  ".go", ".rs", ".swift", ".kt", ".java", ".cs",
  ".cpp", ".c", ".h", ".hpp",
  // SQL
  ".sql",
  // Web
  ".html", ".css", ".scss", ".sass",
  // SVG
  ".svg",
  // Dotfiles / tooling
  ".gitignore", ".editorconfig", ".prettierrc", ".eslintrc",
  // Misc
  ".lock", ".log",
]);

export function isTextFile(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf(".");
  if (dotIndex === -1) return false;
  return TEXT_EXTENSIONS.has(filePath.slice(dotIndex).toLowerCase());
}

export function allFilesAreText(files: Array<{ path: string }>): boolean {
  return files.length > 0 && files.every((f) => isTextFile(f.path));
}
