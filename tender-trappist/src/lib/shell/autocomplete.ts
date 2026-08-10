import { directoryAt, entryNames, resolvePath } from "./filesystem";

const commonPrefix = (strings: string[]): string =>
  strings.reduce((a, b) => {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return a.slice(0, i);
  });

/**
 * Tab-completes the last `/`-separated segment of `token` against the ids
 * living in that segment's parent directory. Returns the full replacement
 * token (unchanged prefix + completed segment), or `null` if there's nothing
 * new to add (no matches, or already at the longest common prefix).
 */
export const completeToken = (currentPath: string[], token: string): string | null => {
  const slash = token.lastIndexOf("/");
  const dirPart = slash >= 0 ? token.substring(0, slash) : "";
  const prefix = slash >= 0 ? token.substring(slash + 1) : token;

  const basePath = dirPart ? resolvePath(currentPath, dirPart) : currentPath;
  if (!basePath) return null;

  const candidates = entryNames(directoryAt(basePath)).filter((name) => name.startsWith(prefix));
  if (candidates.length === 0) return null;

  const completed = candidates.length === 1 ? candidates[0] : commonPrefix(candidates);
  const suffix = completed.slice(prefix.length);
  return suffix ? token + suffix : null;
};
