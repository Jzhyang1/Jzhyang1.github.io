import pages, { type Directory } from "../../data/importer";

export { pages };
export type { Directory };

type Entry = Directory | Directory[] | string | string[] | undefined;

const isPlainDirectory = (value: unknown): value is Directory =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Looks up the node living at `path` inside the virtual filesystem. */
export const directoryAt = (path: string[]): Directory | Directory[] =>
  path.reduce<any>(
    (cur, segment) =>
      Array.isArray(cur)
        ? cur.find((entry) => entry.id === segment)
        : isPlainDirectory(cur)
          ? cur[segment]
          : undefined,
    pages,
  );

/** Names that can be `cd`/`ls`/tab-completed into from a directory node. */
export const entryNames = (dir: Directory | Directory[]): string[] =>
  Array.isArray(dir) ? dir.map((entry) => entry.id as string) : Object.keys(dir);

/** Fetches a single named child (object key, or array item by `id`). */
export const getEntry = (dir: Directory | Directory[], name: string): Entry => {
  if (Array.isArray(dir)) return dir.find((entry) => entry.id === name);
  return dir[name];
};

/**
 * Resolves a `cd`-style path (relative or absolute, `.`/`..` aware) to a new
 * path array. Only plain-object directories can be descended into - array
 * entries (e.g. an individual project) are leaves, not directories.
 */
export const resolvePath = (currentPath: string[], path: string): string[] | null => {
  const result = path.startsWith("/") ? [] : [...currentPath];

  for (const segment of path.split("/").filter(Boolean)) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (result.length > 0) result.pop();
      continue;
    }
    const dir = directoryAt(result);
    if (!isPlainDirectory(dir) || !(segment in dir)) return null;
    result.push(segment);
  }
  return result;
};

const splitPath = (path: string) => {
  const slash = path.lastIndexOf("/");
  return { dirPart: path.substring(0, slash), name: path.substring(slash + 1) };
};

export interface EntryLocation {
  /** Absolute path segments leading to the entry, e.g. ["bio", "oci"]. */
  path: string[];
  entry: Entry;
}

/**
 * Resolves any path (relative or absolute) to whatever lives there - and
 * where it lives - whether that's a directory, an array of entries, or a
 * single leaf entry.
 */
export const resolveEntryLocation = (currentPath: string[], path: string): EntryLocation | undefined => {
  if (path === "" || path === ".") return { path: currentPath, entry: directoryAt(currentPath) };

  const { dirPart, name } = splitPath(path);
  const basePath = dirPart ? resolvePath(currentPath, dirPart) : currentPath;
  if (!basePath) return undefined;

  const entry = getEntry(directoryAt(basePath), name);
  return entry === undefined ? undefined : { path: [...basePath, name], entry };
};

/**
 * Resolves any path (relative or absolute) to whatever lives there, whether
 * that's a directory, an array of entries, or a single leaf entry.
 */
export const resolveEntry = (currentPath: string[], path: string): Entry =>
  resolveEntryLocation(currentPath, path)?.entry;
