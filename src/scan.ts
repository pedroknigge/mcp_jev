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
export const DEFAULT_CHECKPOINT_EVERY = 50;
export const DEFAULT_SCAN_TOP = 10;
export const CHECKPOINT_FILENAME = ".mcp_jev-scan-checkpoint.json";

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
  CHECKPOINT_FILENAME,
  `${CHECKPOINT_FILENAME}.tmp`,
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
  top: number;
  maxFiles: number;
  resume: boolean;
  checkpointEvery: number;
  jsonlPath: string;
  summaryOnly: boolean;
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
  top: number;
  flagged: number;
  path_token_only_flags: number;
  resumed: number;
  max_files: number;
  elapsed_ms: number;
  files_per_min: number;
  top_severity: { path: string; problem_severity: number; primary_concern: string }[];
  primary_concern: Record<string, number>;
  hottest_paths: string[];
};

export type ScanProgress = {
  done: number;
  total: number;
  ratePerMin: number;
  etaSeconds: number | null;
  elapsedMs: number;
};

export type ScanCheckpoint = {
  version: 1;
  root: string;
  updated_at: string;
  records: ScanRecord[];
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

export function computeProgress(done: number, total: number, startedAtMs: number, nowMs: number): ScanProgress {
  const safeDone = Math.max(0, done);
  const safeTotal = Math.max(0, total);
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const elapsedMin = elapsedMs / 60_000;
  const ratePerMin = elapsedMin > 0 ? safeDone / elapsedMin : 0;
  const remaining = Math.max(0, safeTotal - safeDone);
  const etaSeconds = ratePerMin > 0 ? (remaining / ratePerMin) * 60 : null;
  return { done: safeDone, total: safeTotal, ratePerMin, etaSeconds, elapsedMs };
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "ETA —";
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 1) return "ETA 0s";
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (hours > 0) return `ETA ${hours}h ${minutes}m`;
  if (minutes > 0) return `ETA ${minutes}m ${secs}s`;
  return `ETA ${secs}s`;
}

export function formatProgressLine(progress: ScanProgress, label = "scan"): string {
  const pct = progress.total > 0 ? ((100 * progress.done) / progress.total).toFixed(1) : "0.0";
  const rate = progress.ratePerMin > 0 ? `${Math.round(progress.ratePerMin)} files/min` : "— files/min";
  return `${label} ${progress.done}/${progress.total} (${pct}%) · ${rate} · ${formatEta(progress.etaSeconds)}`;
}

export function checkpointPath(root: string): string {
  return path.join(path.resolve(root), CHECKPOINT_FILENAME);
}

export function readCheckpoint(root: string): ScanCheckpoint | undefined {
  const file = checkpointPath(root);
  if (!fs.existsSync(file)) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error(`Invalid ${CHECKPOINT_FILENAME} (not JSON). Delete it or omit --resume.`);
  }
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid ${CHECKPOINT_FILENAME} (expected version 1). Delete it or omit --resume.`);
  }
  const rec = raw as { version?: unknown; root?: unknown; updated_at?: unknown; records?: unknown };
  if (rec.version !== 1 || typeof rec.root !== "string" || !Array.isArray(rec.records)) {
    throw new Error(`Invalid ${CHECKPOINT_FILENAME} (expected version 1). Delete it or omit --resume.`);
  }
  return {
    version: 1,
    root: rec.root,
    updated_at: typeof rec.updated_at === "string" ? rec.updated_at : "",
    records: rec.records as ScanRecord[],
  };
}

export function writeCheckpoint(root: string, records: readonly ScanRecord[]): void {
  const file = checkpointPath(root);
  const payload: ScanCheckpoint = {
    version: 1,
    root: path.resolve(root),
    updated_at: new Date().toISOString(),
    records: records.filter((record) => record.pass === 1),
  };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload)}\n`);
  fs.renameSync(tmp, file);
}

export function clearCheckpoint(root: string): void {
  for (const file of [checkpointPath(root), `${checkpointPath(root)}.tmp`]) {
    try {
      fs.unlinkSync(file);
    } catch {
      // absent
    }
  }
}

function parsePositiveInt(raw: string, name: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return Math.floor(n);
}

function parseNonNegativeInt(raw: string, name: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return Math.floor(n);
}

export function parseScanArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ScanCliArgs {
  const envConcurrency = Number(env[SCAN_CONCURRENCY_ENV]);
  let root: string | undefined;
  let concurrency = Number.isFinite(envConcurrency) && envConcurrency > 0 ? Math.floor(envConcurrency) : DEFAULT_SCAN_CONCURRENCY;
  let dryRun = false;
  let pass2 = 0;
  let top = DEFAULT_SCAN_TOP;
  let maxFiles = 0;
  let resume = false;
  let checkpointEvery = DEFAULT_CHECKPOINT_EVERY;
  let jsonlPath = "";
  let summaryOnly = false;
  let help = false;

  const takeValue = (arg: string, i: number, name: string): [string, number] => {
    if (arg.startsWith(`${name}=`)) return [arg.slice(name.length + 1), i];
    const next = argv[i + 1];
    if (!next || (next.startsWith("-") && !/^-?\d+(\.\d+)?$/.test(next))) {
      throw new Error(`${name} requires a value`);
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
    if (arg === "--resume") {
      resume = true;
      continue;
    }
    if (arg === "--summary-only") {
      summaryOnly = true;
      continue;
    }
    if (arg === "--concurrency" || arg.startsWith("--concurrency=")) {
      const [raw, next] = takeValue(arg, i, "--concurrency");
      concurrency = parsePositiveInt(raw, "--concurrency");
      i = next;
      continue;
    }
    if (arg === "--pass2" || arg.startsWith("--pass2=")) {
      const [raw, next] = takeValue(arg, i, "--pass2");
      pass2 = parsePositiveInt(raw, "--pass2");
      i = next;
      continue;
    }
    if (arg === "--top" || arg.startsWith("--top=")) {
      const [raw, next] = takeValue(arg, i, "--top");
      top = parsePositiveInt(raw, "--top");
      i = next;
      continue;
    }
    if (arg === "--max-files" || arg.startsWith("--max-files=")) {
      const [raw, next] = takeValue(arg, i, "--max-files");
      maxFiles = parsePositiveInt(raw, "--max-files");
      i = next;
      continue;
    }
    if (arg === "--checkpoint-every" || arg.startsWith("--checkpoint-every=")) {
      const [raw, next] = takeValue(arg, i, "--checkpoint-every");
      checkpointEvery = parseNonNegativeInt(raw, "--checkpoint-every");
      i = next;
      continue;
    }
    if (arg === "--jsonl" || arg.startsWith("--jsonl=")) {
      const [raw, next] = takeValue(arg, i, "--jsonl");
      if (!raw.trim()) throw new Error("--jsonl requires a path");
      jsonlPath = raw;
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
    top,
    maxFiles,
    resume,
    checkpointEvery,
    jsonlPath,
    summaryOnly,
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

export function isFlaggedConcern(answers: unknown): boolean {
  const concern = primaryConcern(answers);
  return concern !== "none" && concern !== "unknown";
}

export function hasPathHeuristicSignal(signals: FileSignals): boolean {
  return Boolean(signals.touches_money || signals.touches_auth || signals.touches_migration);
}

export function isPathTokenOnlyFlag(record: ScanRecord): boolean {
  if (record.pass !== 1 || record.error || !record.answers) return false;
  return isFlaggedConcern(record.answers) && hasPathHeuristicSignal(record.signals);
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

export function summarizeScan(
  records: readonly ScanRecord[],
  opts: {
    concurrency: number;
    dryRun: boolean;
    pass2: number;
    top?: number;
    resumed?: number;
    maxFiles?: number;
    elapsedMs?: number;
  },
): ScanSummary {
  const pass1 = records.filter((record) => record.pass === 1);
  const histogram: Record<string, number> = {};
  const ranked = rankForPass2(pass1, pass1.length);
  let flagged = 0;
  let pathTokenOnly = 0;
  for (const record of pass1) {
    if (record.error || !record.answers) continue;
    const concern = primaryConcern(record.answers);
    histogram[concern] = (histogram[concern] ?? 0) + 1;
    if (isFlaggedConcern(record.answers)) flagged += 1;
    if (isPathTokenOnlyFlag(record)) pathTokenOnly += 1;
  }
  const top = Math.max(1, opts.top ?? DEFAULT_SCAN_TOP);
  const elapsedMs = Math.max(0, opts.elapsedMs ?? 0);
  const filesPerMin = elapsedMs > 0 ? pass1.length / (elapsedMs / 60_000) : 0;
  return {
    files: pass1.length,
    concurrency: opts.concurrency,
    dry_run: opts.dryRun,
    pass2: opts.pass2,
    errors: pass1.filter((record) => record.error).length,
    top,
    flagged,
    path_token_only_flags: pathTokenOnly,
    resumed: opts.resumed ?? 0,
    max_files: opts.maxFiles ?? 0,
    elapsed_ms: elapsedMs,
    files_per_min: filesPerMin,
    top_severity: ranked.slice(0, top).map((record) => ({
      path: record.path,
      problem_severity: problemSeverity(record.answers),
      primary_concern: primaryConcern(record.answers),
    })),
    primary_concern: histogram,
    hottest_paths: ranked.slice(0, top).map((record) => record.path),
  };
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatSummaryTable(summary: ScanSummary): string {
  const extras = [
    summary.dry_run ? "dry-run" : "",
    summary.pass2 ? `pass2 ${summary.pass2}` : "",
    summary.errors ? `errors ${summary.errors}` : "",
    summary.resumed ? `resumed ${summary.resumed}` : "",
    summary.max_files ? `max-files ${summary.max_files}` : "",
    summary.elapsed_ms ? formatElapsed(summary.elapsed_ms) : "",
    summary.files_per_min > 0 ? `${Math.round(summary.files_per_min)} files/min` : "",
  ].filter(Boolean);
  const lines = [
    `Scan summary: ${summary.files} files · concurrency ${summary.concurrency}` +
      (extras.length ? ` · ${extras.join(" · ")}` : ""),
  ];
  if (summary.dry_run) {
    lines.push("Pass 1 would call code_audit (signals-only). Tree scans use code_audit, not pr_audit.");
    return `${lines.join("\n")}\n`;
  }
  lines.push(`Top severity (K=${summary.top}):`);
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
  lines.push(
    `Path-token-only flags: ${summary.path_token_only_flags} of ${summary.flagged} flagged (Pass 1, no excerpt)`,
  );
  lines.push(
    "  Path tokens (billing, auth, migration, …) can move Nouls without reading bodies. Confirm with --pass2.",
  );
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
  top?: number;
  maxFiles?: number;
  resume?: boolean;
  checkpointEvery?: number;
  jsonlPath?: string;
  summaryOnly?: boolean;
  config: AppConfig;
  systemOne?: SystemOneCall;
  writeLine?: (line: string) => void;
  writeSummary?: (text: string) => void;
  writeProgress?: (line: string) => void;
  now?: () => number;
};

function appendJsonl(file: string, line: string): void {
  fs.appendFileSync(file, `${line}\n`);
}

export async function runScan(options: ScanRunOptions): Promise<{ records: ScanRecord[]; summary: ScanSummary }> {
  const concurrency = options.concurrency ?? DEFAULT_SCAN_CONCURRENCY;
  const dryRun = Boolean(options.dryRun);
  const pass2 = options.pass2 ?? 0;
  const top = options.top ?? DEFAULT_SCAN_TOP;
  const maxFiles = options.maxFiles ?? 0;
  const resume = Boolean(options.resume);
  const checkpointEvery = options.checkpointEvery ?? DEFAULT_CHECKPOINT_EVERY;
  const jsonlPath = options.jsonlPath?.trim() ?? "";
  const summaryOnly = Boolean(options.summaryOnly);
  const now = options.now ?? Date.now;
  const writeStdout = options.writeLine ?? ((line: string) => process.stdout.write(`${line}\n`));
  const writeSummary = options.writeSummary ?? ((text: string) => process.stderr.write(text));
  const writeProgress =
    options.writeProgress ??
    ((line: string) => {
      if (process.stderr.isTTY) process.stderr.write(`\r${line}`);
      else process.stderr.write(`${line}\n`);
    });

  const emitLine = (line: string): void => {
    if (jsonlPath) appendJsonl(jsonlPath, line);
    if (!summaryOnly) writeStdout(line);
  };

  if (!dryRun && !options.config.apiKeySet) {
    throw missingApiKeyError();
  }

  const collected = collectScanFiles(options.root);
  const files = maxFiles > 0 ? collected.slice(0, maxFiles) : collected;
  const startedAt = now();
  const records: ScanRecord[] = [];
  let resumed = 0;

  if (jsonlPath) {
    fs.writeFileSync(jsonlPath, "");
  }

  const report = (done: number, total: number, label: string): void => {
    writeProgress(formatProgressLine(computeProgress(done, total, startedAt, now()), label));
  };

  if (dryRun) {
    for (const [index, file] of files.entries()) {
      const record: ScanRecord = {
        pass: 1,
        path: file.path,
        language: file.language,
        role_hint: file.role_hint,
        signals: file.signals,
      };
      records.push(record);
      emitLine(JSON.stringify(record));
      if (index === 0 || index + 1 === files.length || (index + 1) % 25 === 0) {
        report(index + 1, files.length, "scan");
      }
    }
    if (process.stderr.isTTY && !options.writeProgress) process.stderr.write("\n");
    const summary = summarizeScan(records, {
      concurrency,
      dryRun: true,
      pass2,
      top,
      maxFiles,
      elapsedMs: now() - startedAt,
    });
    writeSummary(formatSummaryTable(summary));
    return { records, summary };
  }

  if (resume) {
    const checkpoint = readCheckpoint(options.root);
    if (checkpoint) {
      const wanted = new Set(files.map((file) => file.path));
      const prior = checkpoint.records.filter(
        (record) => record.pass === 1 && wanted.has(record.path) && !record.error,
      );
      records.push(...prior);
      resumed = prior.length;
      for (const record of prior) {
        emitLine(JSON.stringify(record));
      }
    }
  }

  const donePaths = new Set(records.map((record) => record.path));
  const remaining = files.filter((file) => !donePaths.has(file.path));
  const systemOne = options.systemOne ?? createSystemOne(options.config);
  const persistCheckpoint = !dryRun && checkpointEvery > 0;

  const auditFile = async (file: ScanFile, excerpt?: string): Promise<ScanRecord> => {
    const pass: 1 | 2 = excerpt === undefined ? 1 : 2;
    try {
      const result = await handleRunPack(
        { pack_id: "code_audit", state: toPackState(file, excerpt) },
        { config: options.config, systemOne },
      );
      return {
        pass,
        path: file.path,
        language: file.language,
        role_hint: file.role_hint,
        signals: file.signals,
        answers: result.answers,
        usage: result.usage,
      };
    } catch (err) {
      const friendly = toFriendlyError(err);
      return {
        pass,
        path: file.path,
        language: file.language,
        role_hint: file.role_hint,
        signals: file.signals,
        error: { code: friendly.code, message: friendly.message },
      };
    }
  };

  let completed = resumed;
  await mapLimit(remaining, concurrency, async (file) => {
    const record = await auditFile(file);
    records.push(record);
    completed += 1;
    emitLine(JSON.stringify(record));
    report(completed, files.length, "scan");
    if (persistCheckpoint && (completed % checkpointEvery === 0 || completed === files.length)) {
      writeCheckpoint(
        options.root,
        records.filter((item) => item.pass === 1),
      );
    }
    return record;
  });
  if (remaining.length === 0 && persistCheckpoint && records.length > 0) {
    writeCheckpoint(
      options.root,
      records.filter((item) => item.pass === 1),
    );
  }
  if (process.stderr.isTTY && !options.writeProgress) process.stderr.write("\n");

  const pass1 = records.filter((record) => record.pass === 1);

  if (pass2 > 0) {
    const byPath = new Map(files.map((file) => [file.path, file]));
    const hottest = rankForPass2(pass1, pass2);
    const pass2Started = now();
    let pass2Done = 0;
    const pass2Records = await mapLimit(hottest, concurrency, async (prior) => {
      const file = byPath.get(prior.path);
      const record = file
        ? await auditFile(file, readExcerpt(options.root, file.path))
        : {
            pass: 2 as const,
            path: prior.path,
            language: prior.language,
            role_hint: prior.role_hint,
            signals: prior.signals,
            error: { code: "error", message: "File disappeared before Pass 2." },
          };
      emitLine(JSON.stringify(record));
      pass2Done += 1;
      writeProgress(formatProgressLine(computeProgress(pass2Done, hottest.length, pass2Started, now()), "scan pass2"));
      return record;
    });
    records.push(...pass2Records);
    if (process.stderr.isTTY && !options.writeProgress) process.stderr.write("\n");
  }

  if (persistCheckpoint) {
    clearCheckpoint(options.root);
  }

  const summary = summarizeScan(records, {
    concurrency,
    dryRun: false,
    pass2,
    top,
    resumed,
    maxFiles,
    elapsedMs: now() - startedAt,
  });
  writeSummary(formatSummaryTable(summary));
  return { records, summary };
}

export const SCAN_HELP = `mcp_jev scan <path> [options]

Walk a repo, build per-file code_audit signals, and run Pass 1 in parallel
through the same run_pack / systemOne path. Tree scans use code_audit, not pr_audit.

  --concurrency N       Parallel workers (default ${DEFAULT_SCAN_CONCURRENCY}, or $${SCAN_CONCURRENCY_ENV})
                        Large repos (multi-k / ~6000 files · ~2 min): 8 default; 16–32 is typical
  --pass2 N             Re-run top N files with excerpt ≤${MAX_EXCERPT_CHARS} chars
  --top K               Severity table size (default ${DEFAULT_SCAN_TOP})
  --max-files N         Sample the first N collected files (dogfood / smoke)
  --jsonl PATH          Write JSONL records to PATH (stdout unless --summary-only)
  --summary-only        Do not print JSONL to stdout (summary stays on stderr)
  --resume              Continue from ${CHECKPOINT_FILENAME} in the scan root
  --checkpoint-every N  Write checkpoint every N completed files (default ${DEFAULT_CHECKPOINT_EVERY}; 0 disables)
  --dry-run             Print files + signals as JSONL; no TypeSafe calls

Progress (done/total, files/min, ETA) is written to stderr.

6000-files / ~2 min class:
  mcp_jev scan . --concurrency 16 --summary-only --jsonl scan.jsonl
  # read top severity + path-token FP note on stderr
  mcp_jev scan . --concurrency 16 --pass2 20 --summary-only
`;
