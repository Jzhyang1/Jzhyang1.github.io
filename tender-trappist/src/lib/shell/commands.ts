import {
  directoryAt,
  entryNames,
  isDirectoryEntry,
  resolveEntry,
  resolveEntryLocation,
  resolvePath,
  type Directory,
} from "./filesystem";

/** Page each top-level directory is rendered on, used to fall back to an in-page anchor. */
const SECTION_PAGES: Record<string, string> = {
  bio: "/bio",
  projects: "/projects",
};

export interface ShellContext {
  path: string[];
}

/** A styled run of text within an output line, e.g. a directory name colored in `ls`. */
export interface LineSegment {
  text: string;
  className?: string;
}

export type OutputLine = string | LineSegment[];

export interface CommandOutput {
  lines: OutputLine[];
  clear?: boolean;
}

const out = (...lines: OutputLine[]): CommandOutput => ({ lines });
const clearScreen = (): CommandOutput => ({ lines: [], clear: true });

/** Splits raw input into a command word and its arguments, honoring "quoted strings". */
export const tokenize = (input: string): string[] =>
  input.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((token) => token.replaceAll('"', "")) ?? [];

const stringifyLines = (value: unknown): string[] =>
  typeof value === "object" && value !== null
    ? JSON.stringify(value, null, 2).split("\n")
    : [String(value)];

const help = (): CommandOutput =>
  out("Available commands: help, echo, pwd, ls, cat, open, cd, grep, clear");

const echo = (params: string[]): CommandOutput => out(params.join(" "));

const pwd = (_params: string[], ctx: ShellContext): CommandOutput => out(`/${ctx.path.join("/")}`);

const ls = (params: string[], ctx: ShellContext): CommandOutput => {
  const target = params[0];
  const dirPath = target ? resolvePath(ctx.path, target) : ctx.path;
  if (!dirPath) return out(`ls: ${target}: No such file or directory`);

  const dir = directoryAt(dirPath);
  const segments: LineSegment[] = entryNames(dir).flatMap((name, index) => {
    const display = name.includes(" ") ? `"${name}"` : name;
    const segment: LineSegment = isDirectoryEntry(dir, name)
      ? { text: display, className: "dir" }
      : { text: display };
    return index === 0 ? [segment] : [{ text: "  " }, segment];
  });
  return { lines: [segments] };
};

const cat = (params: string[], ctx: ShellContext): CommandOutput => {
  const target = params[0];
  if (!target) return out("cat: missing file operand");

  const entry = resolveEntry(ctx.path, target);
  if (entry === undefined) return out(`cat: ${target}: No such file or directory`);
  return out(...stringifyLines(entry));
};

/** Falls back to the entry's own page, scrolled to its anchor, when it has no external link. */
const openFallbackPage = (target: string, path: string[]): CommandOutput => {
  const [section, id] = path;
  const pageHref = SECTION_PAGES[section];
  if (!pageHref) return out(`open: ${target}: No link found`);

  const href = id ? `${pageHref}#${id}` : pageHref;
  window.location.href = href;
  return out(`open: ${target}: No link found, opening ${href} instead`);
};

const open = (params: string[], ctx: ShellContext): CommandOutput => {
  const target = params[0];
  if (!target) return out("open: missing file operand");

  const location = resolveEntryLocation(ctx.path, target);
  if (!location) return out(`open: ${target}: No such file or directory`);

  const entry = location.entry as Directory | undefined;
  const url = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>).href : undefined;
  if (typeof url !== "string") return openFallbackPage(target, location.path);

  window.open(url, "_blank");
  return out(`open: ${target}: Link opened successfully`);
};

const cd = (params: string[], ctx: ShellContext): CommandOutput => {
  const target = params[0] ?? "";
  const newPath = resolvePath(ctx.path, target);
  if (!newPath) return out(`cd: ${target}: No such file or directory`);

  ctx.path = newPath;
  return out();
};

/** Recursively walks a node, collecting `path: line` for every line matching `pattern`. */
const searchEntries = (node: unknown, path: string, pattern: RegExp, results: string[] = []): string[] => {
  if (typeof node === "string") {
    for (const line of node.split("\n")) {
      if (pattern.test(line)) results.push(`${path}: ${line.trim()}`);
    }
  } else if (Array.isArray(node)) {
    for (const entry of node) {
      const id = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>).id : undefined;
      searchEntries(entry, typeof id === "string" ? `${path}/${id}` : path, pattern, results);
    }
  } else if (typeof node === "object" && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      searchEntries(value, `${path}/${key}`, pattern, results);
    }
  }
  return results;
};

const grep = (params: string[], ctx: ShellContext): CommandOutput => {
  const [pattern, target] = params;
  if (!pattern) return out("grep: missing pattern");

  const entry = target ? resolveEntry(ctx.path, target) : directoryAt(ctx.path);
  if (entry === undefined) return out(`grep: ${target}: No such file or directory`);

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "i");
  } catch {
    return out(`grep: invalid pattern: ${pattern}`);
  }

  const matches = searchEntries(entry, target ?? ".", regex);
  return matches.length ? out(...matches) : out(`grep: no matches for '${pattern}'`);
};

const clear = (): CommandOutput => clearScreen();

type CommandHandler = (params: string[], ctx: ShellContext) => CommandOutput;

const COMMANDS: Record<string, CommandHandler> = { help, echo, pwd, ls, cat, open, cd, grep, clear };

export const runCommand = (input: string, ctx: ShellContext): CommandOutput => {
  const [cmd, ...params] = tokenize(input);
  if (!cmd) return out();

  const handler = COMMANDS[cmd];
  return handler ? handler(params, ctx) : out(`${cmd}: command not found`);
};
