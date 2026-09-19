import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import type { AppConfig } from "./config.js";
import { missingApiKeyError, toFriendlyError } from "./errors.js";
import { handleRunPack } from "./handlers.js";
import { MAX_EXCERPT_CHARS, MAX_REPO_CONTEXT_CHARS, MAX_TOP_IMPORTS } from "./packs/code-audit.js";
import type { SystemOneCall } from "./typesafe.js";
import { createSystemOne } from "./typesafe.js";

export const DEFAULT_SCAN_CONCURRENCY = 8;
export const SCAN_CONCURRENCY_ENV = "MCP_JEV_SCAN_CONCURRENCY";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "out",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  ".output",
  "generated",
  "gen",
]);

const SKIP_BASENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "Cargo.lock",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
  "go.sum",
]);

const SKIP_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "bmp",
  "tif",
  "tiff",
  "exe",
  "dll",
  "so",
  "dylib",
  "wasm",
  "zip",
  "tar",
  "gz",
  "tgz",
  "7z",
  "rar",
  "bz2",
  "pdf",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "mp3",
  "mp4",
  "mov",
  "wav",
  "webm",
  "avi",
  "class",
  "o",
  "a",
  "jar",
  "war",
  "pyc",
  "pyo",
  "map",
]);

const LANG_BY_EXT: Record<string, string> = {
  ts: "ts",
  tsx: "ts",
  js: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  py: "py",
  go: "go",
  rs: "rs",
  java: "java",
  kt: "kt",
  sql: "sql",
  rb: "rb",
  php: "php",
  cs: "cs",
  swift: "swift",
  md: "md",
  json: "json",
  yml: "yml",
  yaml: "yml",
  toml: "toml",
  sh: "sh",
  bash: "sh",
};

const ROLE_RULES: [RegExp, string][] = [
  [/(^|\/)(__tests__|tests?|spec)(\/|$)|[._-](test|spec)\.[^./]+$/i, "test"],
  [/(^|\/)(ui|components|pages|views|frontend)(\/|$)/i, "ui"],
  [/(^|\/)(api|routes|handlers|controllers|endpoints)(\/|$)/i, "api"],
  [/(^|\/)(auth)(\/|$)/i, "infra"],
  [/(^|\/)(db|database|migrations?|sql|schema)(\/|$)/i, "db"],
  [/(^|\/)(domain|billing|core|models?)(\/|$)/i, "domain"],
  [/(^|\/)(infra|ops|deploy|ci|\.github|scripts|config)(\/|$)/i, "infra"],
];

const MONEY_PATH = /(^|\/|[-_.])(billing|invoice|payroll|payment|stripe|wallet|ledger|payout|finance|pricing|prices?|tax|refund)(\/|[-_.]|$)/i;
const AUTH_PATH = /(^|\/|[-_.])(authn?|authz|oauth|jwt|login|logout|session|password|credentials?|rbac|permissions?|sso)(\/|[-_.]|$)/i;
const MIGRATION_PATH = /(^|\/|[-_.])(migrations?|migrate|alembic|flyway)(\/|[-_.]|$)/i;

const MAX_FILE_BYTES = 1_000_000;

export type FileSignals = {
  loc: number;
  import_count: number;
  top_imports: string[];
  has_tests_nearby: boolean;
  touches_money: boolean;
  touches_auth: boolean;
  touches_migration: boolean;
  is_generated: boolean;
  complexity_heuristic: number;
};

export type ScanFile = {
  path: string;
  language: string;
  role_hint: string;
  signals: FileSignals;
  repo_context: string;
};

export type ScanCliArgs = {
  root: string;
  concurrency: number;
  dryRun: boolean;
  pass2: number;
  help: boolean;
};

export type ScanRecord = {
  pass: 1 | 2;
  path: string;
  language: string;
  role_hint: string;
  signals: FileSignals;
  answers?: unknown;
  usage?: unknown;
  error?: { code: string; message: string };
};

export type ScanSummary = {
  files: number;
  concurrency: number;
  dry_run: boolean;
  pass2: number;
  errors: number;
  top_severity: { path: string; problem_severity: number; primary_concern: string }[];
  primary_concern: Record<string, number>;
  hottest_paths: string[];
};

function posixRel(rel: string): string {
  return rel.split(path.sep).join("/");
}

export function extnameLower(relPath: string): string {
  const base = path.posix.basename(relPath);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
}

export function shouldIncludePath(relPath: string): boolean {
  const rel = posixRel(relPath);
  if (!rel || rel === ".") return false;
  const parts = rel.split("/");
  if (parts.some((part) => SKIP_DIRS.has(part))) return false;
  const base = parts[parts.length - 1] ?? "";
  if (SKIP_BASENAMES.has(base)) return false;
  if (base.endsWith(".min.js") || base.endsWith(".min.css")) return false;
  if (SKIP_EXTS.has(extnameLower(rel))) return false;
  if (base === ".env" || /^[.]env[.](?!example$).+/.test(base)) return false;
  return true;
}

export function inferLanguage(relPath: string): string {
  const ext = extnameLower(relPath);
  return LANG_BY_EXT[ext] ?? (ext || "other");
}

export function inferRoleHint(relPath: string): string {
  const rel = posixRel(relPath);
  for (const [pattern, role] of ROLE_RULES) {
    if (pattern.test(rel)) return role;
  }
  return "other";
}

export function pathHeuristics(relPath: string): {
  touches_money: boolean;
  touches_auth: boolean;
  touches_migration: boolean;
} {
  const rel = posixRel(relPath);
  return {
    touches_money: MONEY_PATH.test(rel),
    touches_auth: AUTH_PATH.test(rel),
    touches_migration: MIGRATION_PATH.test(rel),
  };
}

export function isGeneratedFile(relPath: string, content: string): boolean {
  const rel = posixRel(relPath);
  if (/(^|\/)(generated|gen)(\/|$)/i.test(rel)) return true;
  if (/\.(gen|generated|pb)\.[^./]+$/.test(rel)) return true;
  const head = content.slice(0, 400);
  return /@generated|Code generated by|AUTO-GENERATED|autogenerated/i.test(head);
}

export function extractImports(content: string): string[] {
  const names: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match =
      line.match(/^\s*import\s+.*?from\s+['"]([^'"]+)['"]/) ??
      line.match(/^\s*import\s+['"]([^'"]+)['"]/) ??
      line.match(/^\s*export\s+.*?from\s+['"]([^'"]+)['"]/) ??
      line.match(/require\(\s*['"]([^'"]+)['"]\s*\)/) ??
      line.match(/^\s*from\s+([A-Za-z0-9_.]+)(?:\s+import\b)/) ??
      line.match(/^\s*import\s+([A-Za-z0-9_.]+)(?:\s|$)/) ??
      line.match(/^\s*#include\s+[<"]([^>"]+)[>"]/);
    if (match?.[1]) names.push(normalizeImport(match[1]));
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    unique.push(name);
  }
  return unique;
}

function normalizeImport(spec: string): string {
  if (spec.startsWith(".")) {
    const segs = spec.split("/").filter((part) => part && part !== "." && part !== "..");
    return segs[segs.length - 1] ?? spec;
  }
  const parts = spec.split("/");
  if (spec.startsWith("@") && parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return parts[0] ?? spec;
}

export function complexityHeuristic(content: string): number {
  return content.match(/\b(if|else if|for|while|case|catch|switch)\b|\?\.|\?\?|&&|\|\||\?/g)?.length ?? 0;
}

export function isTestPath(relPath: string): boolean {
  const rel = posixRel(relPath);
  return /(^|\/)(__tests__|tests?|spec)(\/|$)|[._-](test|spec)\.[^./]+$/i.test(rel);
}

export function hasTestsNearby(relPath: string, allFiles: Iterable<string>): boolean {
  const rel = posixRel(relPath);
  if (isTestPath(rel)) return true;
  const files = new Set([...allFiles].map(posixRel));
  const dir = path.posix.dirname(rel);
  const parsed = path.posix.parse(rel);
  const candidates = [
    path.posix.join(dir, `${parsed.name}.test${parsed.ext}`),
    path.posix.join(dir, `${parsed.name}.spec${parsed.ext}`),
    path.posix.join(dir, `${parsed.name}.test.ts`),
    path.posix.join(dir, `${parsed.name}.spec.ts`),
    path.posix.join(dir, "__tests__", `${parsed.name}${parsed.ext}`),
    path.posix.join("test", rel),
    path.posix.join("tests", rel),
  ];
  return candidates.some((candidate) => files.has(candidate));
}

export function extractSignals(
  relPath: string,
  content: string,
  allFiles: Iterable<string>,
): FileSignals {
  const imports = extractImports(content);
  const loc = content.length === 0 ? 0 : content.split(/\r?\n/).length;
  return {
    loc,
    import_count: imports.length,
    top_imports: imports.slice(0, MAX_TOP_IMPORTS),
    has_tests_nearby: hasTestsNearby(relPath, allFiles),
    ...pathHeuristics(relPath),
    is_generated: isGeneratedFile(relPath, content),
    complexity_heuristic: complexityHeuristic(content),
  };
}

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  return buf.subarray(0, n).includes(0);
}

function repoContext(root: string, relPath: string): string {
  const repo = path.basename(path.resolve(root));
  const dir = path.posix.dirname(posixRel(relPath));
  const line = dir === "." ? `scan ${repo}` : `scan ${repo}: ${dir}`;
  return line.slice(0, MAX_REPO_CONTEXT_CHARS);
}

function gitGlobToRegExp(glob: string, anchored: boolean): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i]!;
    if (ch === "*" && glob[i + 1] === "*") {
      re += ".*";
      i += 1;
      if (glob[i + 1] === "/") {
        re += "/?";
        i += 1;
      }
    } else if (ch === "*") {
      re += "[^/]*";
    } else if (ch === "?") {
      re += "[^/]";
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(anchored ? `^${re}(?:/.*)?$` : `(^|/)${re}(?:/.*)?$`);
}

export function matchGitignorePattern(pattern: string, relPath: string): boolean {
  const rel = posixRel(relPath);
  let pat = pattern;
  const dirOnly = pat.endsWith("/");
  if (dirOnly) pat = pat.slice(0, -1);
  const anchored = pat.startsWith("/");
  if (anchored) pat = pat.slice(1);
  if (dirOnly && !(rel === pat || rel.startsWith(`${pat}/`) || rel.includes(`/${pat}/`))) {
    if (anchored) return rel === pat || rel.startsWith(`${pat}/`);
  }
  return gitGlobToRegExp(pat, anchored).test(rel);
}

export function ignoredByGitignore(relPath: string, patterns: readonly string[]): boolean {
  let ignored = false;
  for (const raw of patterns) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const neg = line.startsWith("!");
    const pat = neg ? line.slice(1) : line;
    if (matchGitignorePattern(pat, relPath)) ignored = !neg;
  }
  return ignored;
}

function readGitignorePatterns(root: string): string[] {
  const file = path.join(root, ".gitignore");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/);
}

function listViaGit(root: string): string[] | undefined {
  try {
    const inside = spawnSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
    });
    if (inside.status !== 0 || inside.stdout.trim() !== "true") return undefined;
    const listed = spawnSync(
      "git",
      ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."],
      { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
    );
    if (listed.status !== 0) return undefined;
    return listed.stdout
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map(posixRel);
  } catch {
    return undefined;
  }
}

function walkFiles(root: string, rel = "", ignored: (relPath: string) => boolean): string[] {
  const dir = rel ? path.join(root, rel) : root;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (ignored(child + "/")) continue;
      out.push(...walkFiles(root, child, ignored));
      continue;
    }
    if (!entry.isFile()) continue;
    if (ignored(child)) continue;
    out.push(child);
  }
  return out;
}

export function listScanPaths(root: string): string[] {
  const abs = path.resolve(root);
  const fromGit = listViaGit(abs);
  const ignorePatterns = readGitignorePatterns(abs);
  const ignored = (relPath: string) => ignoredByGitignore(relPath.replace(/\/$/, ""), ignorePatterns);
  const raw = fromGit ?? walkFiles(abs, "", ignored);
  const filtered = raw.filter((rel) => shouldIncludePath(rel) && !ignored(rel));
  return [...new Set(filtered)].sort();
}

export function collectScanFiles(root: string): ScanFile[] {
  const abs = path.resolve(root);
  const paths = listScanPaths(abs);
  const files: ScanFile[] = [];
  for (const rel of paths) {
    const full = path.join(abs, rel);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
    let buf: Buffer;
    try {
      buf = fs.readFileSync(full);
    } catch {
      continue;
    }
    if (looksBinary(buf)) continue;
    const content = buf.toString("utf8");
    if (isGeneratedFile(rel, content)) continue;
    const signals = extractSignals(rel, content, paths);
    files.push({
      path: posixRel(rel),
      language: inferLanguage(rel),
      role_hint: inferRoleHint(rel),
      signals,
      repo_context: repoContext(abs, rel),
    });
  }
  return files;
}

export function packSignals(signals: FileSignals): Omit<FileSignals, "touches_migration"> {
  const { touches_migration: _migration, ...rest } = signals;
  return rest;
}

export function toPackState(file: ScanFile, excerpt?: string): Record<string, unknown> {
  const state: Record<string, unknown> = {
    path: file.path,
    language: file.language,
    role_hint: file.role_hint,
    signals: packSignals(file.signals),
    repo_context: file.repo_context,
  };
  if (excerpt !== undefined) {
    state.excerpt = excerpt.length > MAX_EXCERPT_CHARS ? excerpt.slice(0, MAX_EXCERPT_CHARS) : excerpt;
  }
  return state;
}

export function readExcerpt(root: string, relPath: string): string {
  const full = path.join(path.resolve(root), relPath);
  try {
    const buf = fs.readFileSync(full);
    if (looksBinary(buf)) return "";
    return buf.toString("utf8").slice(0, MAX_EXCERPT_CHARS);
  } catch {
    return "";
  }
}

export function parseScanArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ScanCliArgs {
  const envConcurrency = Number(env[SCAN_CONCURRENCY_ENV]);
  let root: string | undefined;
  let concurrency = Number.isFinite(envConcurrency) && envConcurrency > 0 ? Math.floor(envConcurrency) : DEFAULT_SCAN_CONCURRENCY;
  let dryRun = false;
  let pass2 = 0;
  let help = false;

  const takeValue = (arg: string, i: number, name: string): [string, number] => {
    if (arg.startsWith(`${name}=`)) return [arg.slice(name.length + 1), i];
    const next = argv[i + 1];
    if (!next || next.startsWith("-")) {
      throw new Error(`${name} requires a number`);
    }
    return [next, i + 1];
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--concurrency" || arg.startsWith("--concurrency=")) {
      const [raw, next] = takeValue(arg, i, "--concurrency");
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1) throw new Error("--concurrency must be a positive integer");
      concurrency = Math.floor(n);
      i = next;
      continue;
    }
    if (arg === "--pass2" || arg.startsWith("--pass2=")) {
      const [raw, next] = takeValue(arg, i, "--pass2");
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1) throw new Error("--pass2 must be a positive integer");
      pass2 = Math.floor(n);
      i = next;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown scan flag "${arg}". Try: mcp_jev scan --help`);
    }
    if (root) {
      throw new Error(`Unexpected extra argument "${arg}". Usage: mcp_jev scan <path>`);
    }
    root = arg;
  }

  return {
    root: root ?? "",
    concurrency,
    dryRun,
    pass2,
    help,
  };
}

export async function mapLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function noulMax(answers: unknown): number {
  if (!answers || typeof answers !== "object") return 0;
  const rec = answers as Record<string, { noul?: number }>;
  const ids = [
    "wrong_layer",
    "blast_radius",
    "missing_verification",
    "secret_or_credential_risk",
    "inefficiency",
    "dead_or_premature_abstraction",
  ];
  return Math.max(0, ...ids.map((id) => (typeof rec[id]?.noul === "number" ? rec[id]!.noul! : 0)));
}

export function problemSeverity(answers: unknown): number {
  if (!answers || typeof answers !== "object") return -1;
  const score = (answers as { problem_severity?: { score?: number } }).problem_severity?.score;
  return typeof score === "number" && Number.isFinite(score) ? score : -1;
}

export function primaryConcern(answers: unknown): string {
  if (!answers || typeof answers !== "object") return "unknown";
  const choice = (answers as { primary_concern?: { choice?: string } }).primary_concern?.choice;
  return typeof choice === "string" && choice.length > 0 ? choice : "unknown";
}

export function rankForPass2(records: readonly ScanRecord[], n: number): ScanRecord[] {
  return records
    .filter((record) => record.pass === 1 && !record.error && record.answers)
    .slice()
    .sort((a, b) => {
      const sev = problemSeverity(b.answers) - problemSeverity(a.answers);
      if (sev !== 0) return sev;
      const noul = noulMax(b.answers) - noulMax(a.answers);
      if (noul !== 0) return noul;
      return a.path.localeCompare(b.path);
    })
    .slice(0, Math.max(0, n));
}

export function summarizeScan(records: readonly ScanRecord[], opts: { concurrency: number; dryRun: boolean; pass2: number }): ScanSummary {
  const pass1 = records.filter((record) => record.pass === 1);
  const histogram: Record<string, number> = {};
  const ranked = rankForPass2(pass1, pass1.length);
  for (const record of pass1) {
    if (record.error || !record.answers) continue;
    const concern = primaryConcern(record.answers);
    histogram[concern] = (histogram[concern] ?? 0) + 1;
  }
  return {
    files: pass1.length,
    concurrency: opts.concurrency,
    dry_run: opts.dryRun,
    pass2: opts.pass2,
    errors: pass1.filter((record) => record.error).length,
    top_severity: ranked.slice(0, 8).map((record) => ({
      path: record.path,
      problem_severity: problemSeverity(record.answers),
      primary_concern: primaryConcern(record.answers),
    })),
    primary_concern: histogram,
    hottest_paths: ranked.slice(0, 8).map((record) => record.path),
  };
}

export function formatSummaryTable(summary: ScanSummary): string {
  const lines = [
    `Scan summary: ${summary.files} files · concurrency ${summary.concurrency}` +
      (summary.dry_run ? " · dry-run" : "") +
      (summary.pass2 ? ` · pass2 ${summary.pass2}` : "") +
      (summary.errors ? ` · errors ${summary.errors}` : ""),
  ];
  if (summary.dry_run) {
    lines.push("Pass 1 would call code_audit (signals-only). Tree scans use code_audit, not pr_audit.");
    return `${lines.join("\n")}\n`;
  }
  lines.push("Top severity:");
  if (summary.top_severity.length === 0) {
    lines.push("  (none)");
  } else {
    for (const row of summary.top_severity) {
      lines.push(`  ${row.problem_severity.toFixed(2).padStart(5)}  ${row.primary_concern.padEnd(14)}  ${row.path}`);
    }
  }
  lines.push("primary_concern:");
  const keys = Object.keys(summary.primary_concern).sort(
    (a, b) => (summary.primary_concern[b] ?? 0) - (summary.primary_concern[a] ?? 0) || a.localeCompare(b),
  );
  if (keys.length === 0) {
    lines.push("  (none)");
  } else {
    for (const key of keys) {
      lines.push(`  ${String(summary.primary_concern[key]).padStart(3)}  ${key}`);
    }
  }
  lines.push("Hottest paths:");
  if (summary.hottest_paths.length === 0) {
    lines.push("  (none)");
  } else {
    for (const hot of summary.hottest_paths) {
      lines.push(`  ${hot}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export type ScanRunOptions = {
  root: string;
  concurrency?: number;
  dryRun?: boolean;
  pass2?: number;
  config: AppConfig;
  systemOne?: SystemOneCall;
  writeLine?: (line: string) => void;
  writeSummary?: (text: string) => void;
};

export async function runScan(options: ScanRunOptions): Promise<{ records: ScanRecord[]; summary: ScanSummary }> {
  const concurrency = options.concurrency ?? DEFAULT_SCAN_CONCURRENCY;
  const dryRun = Boolean(options.dryRun);
  const pass2 = options.pass2 ?? 0;
  const writeLine = options.writeLine ?? ((line: string) => process.stdout.write(`${line}\n`));
  const writeSummary = options.writeSummary ?? ((text: string) => process.stderr.write(text));

  if (!dryRun && !options.config.apiKeySet) {
    throw missingApiKeyError();
  }

  const files = collectScanFiles(options.root);
  const records: ScanRecord[] = [];

  if (dryRun) {
    for (const file of files) {
      const record: ScanRecord = {
        pass: 1,
        path: file.path,
        language: file.language,
        role_hint: file.role_hint,
        signals: file.signals,
      };
      records.push(record);
      writeLine(JSON.stringify(record));
    }
    const summary = summarizeScan(records, { concurrency, dryRun: true, pass2 });
    writeSummary(formatSummaryTable(summary));
    return { records, summary };
  }

  const systemOne = options.systemOne ?? createSystemOne(options.config);

  const pass1 = await mapLimit(files, concurrency, async (file) => {
    try {
      const result = await handleRunPack(
        { pack_id: "code_audit", state: toPackState(file) },
        { config: options.config, systemOne },
      );
      const record: ScanRecord = {
        pass: 1,
        path: file.path,
        language: file.language,
        role_hint: file.role_hint,
        signals: file.signals,
        answers: result.answers,
        usage: result.usage,
      };
      writeLine(JSON.stringify(record));
      return record;
    } catch (err) {
      const friendly = toFriendlyError(err);
      const record: ScanRecord = {
        pass: 1,
        path: file.path,
        language: file.language,
        role_hint: file.role_hint,
        signals: file.signals,
        error: { code: friendly.code, message: friendly.message },
      };
      writeLine(JSON.stringify(record));
      return record;
    }
  });
  records.push(...pass1);

  if (pass2 > 0) {
    const byPath = new Map(files.map((file) => [file.path, file]));
    const hottest = rankForPass2(pass1, pass2);
    const pass2Records = await mapLimit(hottest, concurrency, async (prior) => {
      const file = byPath.get(prior.path);
      if (!file) {
        return {
          pass: 2 as const,
          path: prior.path,
          language: prior.language,
          role_hint: prior.role_hint,
          signals: prior.signals,
          error: { code: "error", message: "File disappeared before Pass 2." },
        };
      }
      const excerpt = readExcerpt(options.root, file.path);
      try {
        const result = await handleRunPack(
          { pack_id: "code_audit", state: toPackState(file, excerpt) },
          { config: options.config, systemOne },
        );
        const record: ScanRecord = {
          pass: 2,
          path: file.path,
          language: file.language,
          role_hint: file.role_hint,
          signals: file.signals,
          answers: result.answers,
          usage: result.usage,
        };
        writeLine(JSON.stringify(record));
        return record;
      } catch (err) {
        const friendly = toFriendlyError(err);
        const record: ScanRecord = {
          pass: 2,
          path: file.path,
          language: file.language,
          role_hint: file.role_hint,
          signals: file.signals,
          error: { code: friendly.code, message: friendly.message },
        };
        writeLine(JSON.stringify(record));
        return record;
      }
    });
    records.push(...pass2Records);
  }

  const summary = summarizeScan(records, { concurrency, dryRun: false, pass2 });
  writeSummary(formatSummaryTable(summary));
  return { records, summary };
}

export const SCAN_HELP = `mcp_jev scan <path> [--concurrency N] [--pass2 N] [--dry-run]

Walk a repo, build per-file code_audit signals, and run Pass 1 in parallel
through the same run_pack / systemOne path. Tree scans use code_audit, not pr_audit.

  --concurrency N   Parallel workers (default ${DEFAULT_SCAN_CONCURRENCY}, or $${SCAN_CONCURRENCY_ENV})
  --pass2 N         Re-run top N files with excerpt ≤${MAX_EXCERPT_CHARS} chars
  --dry-run         Print files + signals as JSONL; no TypeSafe calls
`;
