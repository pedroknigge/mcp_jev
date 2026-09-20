import fs from "node:fs";
import path from "node:path";

import type { AppConfig } from "./config.js";
import { missingApiKeyError, toFriendlyError } from "./errors.js";
import { handleRunPack } from "./handlers.js";
import {
  LIVE_URL_ERROR_CLASSES,
  LIVE_URL_METHODS,
  MAX_LIVE_URL_NOTES,
  MAX_LIVE_URL_SNIPPET,
  type LiveUrlErrorClass,
  type LiveUrlMethod,
  type LiveUrlRouteKind,
} from "./packs/live-url-check.js";
import { mapLimit } from "./scan.js";
import type { SystemOneCall } from "./typesafe.js";
import { createSystemOne } from "./typesafe.js";

export const DEFAULT_URLCHECK_CONCURRENCY = 8;
export const URLCHECK_CONCURRENCY_ENV = "MCP_JEV_URLCHECK_CONCURRENCY";
export const DEFAULT_URLCHECK_TIMEOUT_MS = 5000;
export const DEFAULT_MAX_REDIRECTS = 5;
export const DEFAULT_JUDGE_LIMIT = 8;
export const MAX_DISCOVERED_ROUTES = 200;
export const BODY_SNIPPET_CHARS = MAX_LIVE_URL_SNIPPET;

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

const DISCOVER_EXTS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs"]);

const SECRET_HEADER = /^(cookie|set-cookie|authorization|proxy-authorization|x-api-key|x-auth-token)$/i;

export type UrlTarget = {
  path: string;
  method: LiveUrlMethod;
  route_kind: LiveUrlRouteKind;
  expected_auth?: boolean;
};

export type StatusExpect = {
  exact: number[];
  ranges: Array<{ lo: number; hi: number }>;
};

export type UrlCheckCliArgs = {
  base: string;
  routesFile: string;
  discover: boolean;
  cwd: string;
  method: LiveUrlMethod;
  concurrency: number;
  timeoutMs: number;
  followRedirects: boolean;
  maxRedirects: number;
  expectStatus: StatusExpect | undefined;
  authCookie: string;
  headers: Array<{ name: string; value: string }>;
  judge: boolean;
  judgeLimit: number;
  json: boolean;
  strict404: boolean;
  notes: string;
  help: boolean;
};

export type UrlCheckResult = {
  url: string;
  path: string;
  method: LiveUrlMethod;
  status: number | null;
  final_url: string;
  redirect_hops: number;
  ms: number;
  ok: boolean;
  hard_failure: boolean;
  error_class: LiveUrlErrorClass;
  route_kind: LiveUrlRouteKind;
  expected_auth?: boolean;
  body_snippet?: string;
  content_type?: string;
};

export type UrlCheckJudgment = {
  url: string;
  path: string;
  pack_id: "live_url_check";
  answers?: unknown;
  usage?: unknown;
  error?: { code: string; message: string };
};

export type UrlCheckSummary = {
  urls: number;
  ok: number;
  hard_failures: number;
  auth_candidates: number;
  fail_candidates: number;
  judged: number;
  elapsed_ms: number;
  error_class: Record<string, number>;
};

function parsePositiveInt(raw: string, name: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return Math.floor(n);
}

function takeValue(argv: string[], arg: string, i: number, name: string): [string, number] {
  if (arg.startsWith(`${name}=`)) return [arg.slice(name.length + 1), i];
  const next = argv[i + 1];
  if (!next || (next.startsWith("-") && !/^-?\d+(\.\d+)?$/.test(next))) {
    throw new Error(`${name} requires a value`);
  }
  return [next, i + 1];
}

export function parseExpectStatus(raw: string): StatusExpect {
  const exact: number[] = [];
  const ranges: Array<{ lo: number; hi: number }> = [];
  for (const part of raw.split(",").map((item) => item.trim()).filter(Boolean)) {
    const range = part.match(/^(\d{3})\s*-\s*(\d{3})$/);
    if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      if (lo > hi) throw new Error(`--expect-status range is inverted: ${part}`);
      ranges.push({ lo, hi });
      continue;
    }
    const cls = part.match(/^([1-5])xx$/i);
    if (cls) {
      const hundred = Number(cls[1]) * 100;
      ranges.push({ lo: hundred, hi: hundred + 99 });
      continue;
    }
    const n = Number(part);
    if (!Number.isInteger(n) || n < 100 || n > 599) {
      throw new Error(`--expect-status item must be a status, range, or Nxx: ${part}`);
    }
    exact.push(n);
  }
  if (exact.length === 0 && ranges.length === 0) {
    throw new Error("--expect-status requires at least one status or range");
  }
  return { exact, ranges };
}

export function statusMatchesExpect(status: number | null, expect: StatusExpect | undefined): boolean {
  if (status === null || !expect) return false;
  if (expect.exact.includes(status)) return true;
  return expect.ranges.some((range) => status >= range.lo && status <= range.hi);
}

export function parseHeaderFlag(raw: string): { name: string; value: string } {
  const sep = raw.indexOf(":");
  if (sep <= 0) throw new Error('--header must look like "Name: value"');
  const name = raw.slice(0, sep).trim();
  const value = raw.slice(sep + 1).trim();
  if (!name) throw new Error('--header must look like "Name: value"');
  return { name, value };
}

export function parseUrlCheckArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): UrlCheckCliArgs {
  const envConcurrency = Number(env[URLCHECK_CONCURRENCY_ENV]);
  let base = "";
  let routesFile = "";
  let discover = false;
  let cwd = "";
  let method: LiveUrlMethod = "GET";
  let concurrency =
    Number.isFinite(envConcurrency) && envConcurrency > 0
      ? Math.floor(envConcurrency)
      : DEFAULT_URLCHECK_CONCURRENCY;
  let timeoutMs = DEFAULT_URLCHECK_TIMEOUT_MS;
  let followRedirects = true;
  let maxRedirects = DEFAULT_MAX_REDIRECTS;
  let expectStatus: StatusExpect | undefined;
  let authCookie = "";
  const headers: Array<{ name: string; value: string }> = [];
  let judge = false;
  let judgeLimit = DEFAULT_JUDGE_LIMIT;
  let json = false;
  let strict404 = false;
  let notes = "";
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--discover") {
      discover = true;
      continue;
    }
    if (arg === "--judge") {
      judge = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--strict-404") {
      strict404 = true;
      continue;
    }
    if (arg === "--follow-redirects") {
      followRedirects = true;
      continue;
    }
    if (arg === "--no-follow-redirects") {
      followRedirects = false;
      continue;
    }
    if (arg === "--follow-redirects=false" || arg === "--follow-redirects=0") {
      followRedirects = false;
      continue;
    }
    if (arg === "--base" || arg.startsWith("--base=")) {
      const [raw, next] = takeValue(argv, arg, i, "--base");
      base = raw;
      i = next;
      continue;
    }
    if (arg === "--routes-file" || arg.startsWith("--routes-file=")) {
      const [raw, next] = takeValue(argv, arg, i, "--routes-file");
      routesFile = raw;
      i = next;
      continue;
    }
    if (arg === "--cwd" || arg.startsWith("--cwd=")) {
      const [raw, next] = takeValue(argv, arg, i, "--cwd");
      cwd = raw;
      i = next;
      continue;
    }
    if (arg === "--method" || arg.startsWith("--method=")) {
      const [raw, next] = takeValue(argv, arg, i, "--method");
      const upper = raw.trim().toUpperCase();
      if (!LIVE_URL_METHODS.includes(upper as LiveUrlMethod)) {
        throw new Error(`--method must be GET or HEAD (got ${raw})`);
      }
      method = upper as LiveUrlMethod;
      i = next;
      continue;
    }
    if (arg === "--concurrency" || arg.startsWith("--concurrency=")) {
      const [raw, next] = takeValue(argv, arg, i, "--concurrency");
      concurrency = parsePositiveInt(raw, "--concurrency");
      i = next;
      continue;
    }
    if (arg === "--timeout-ms" || arg.startsWith("--timeout-ms=")) {
      const [raw, next] = takeValue(argv, arg, i, "--timeout-ms");
      timeoutMs = parsePositiveInt(raw, "--timeout-ms");
      i = next;
      continue;
    }
    if (arg === "--max-redirects" || arg.startsWith("--max-redirects=")) {
      const [raw, next] = takeValue(argv, arg, i, "--max-redirects");
      maxRedirects = parsePositiveInt(raw, "--max-redirects");
      i = next;
      continue;
    }
    if (arg === "--expect-status" || arg.startsWith("--expect-status=")) {
      const [raw, next] = takeValue(argv, arg, i, "--expect-status");
      expectStatus = parseExpectStatus(raw);
      i = next;
      continue;
    }
    if (arg === "--auth-cookie" || arg.startsWith("--auth-cookie=")) {
      const [raw, next] = takeValue(argv, arg, i, "--auth-cookie");
      authCookie = raw;
      i = next;
      continue;
    }
    if (arg === "--header" || arg.startsWith("--header=")) {
      const [raw, next] = takeValue(argv, arg, i, "--header");
      headers.push(parseHeaderFlag(raw));
      i = next;
      continue;
    }
    if (arg === "--judge-limit" || arg.startsWith("--judge-limit=")) {
      const [raw, next] = takeValue(argv, arg, i, "--judge-limit");
      judgeLimit = parsePositiveInt(raw, "--judge-limit");
      i = next;
      continue;
    }
    if (arg === "--notes" || arg.startsWith("--notes=")) {
      const [raw, next] = takeValue(argv, arg, i, "--notes");
      notes = raw;
      i = next;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown urlcheck flag "${arg}". Try: mcp_jev urlcheck --help`);
    }
    throw new Error(`Unexpected extra argument "${arg}". Usage: mcp_jev urlcheck --base URL`);
  }

  return {
    base,
    routesFile,
    discover,
    cwd,
    method,
    concurrency,
    timeoutMs,
    followRedirects,
    maxRedirects,
    expectStatus,
    authCookie,
    headers,
    judge,
    judgeLimit,
    json,
    strict404,
    notes,
    help,
  };
}

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("--base URL is required, e.g. http://localhost:3000");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`--base is not a valid URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("--base must be http:// or https://");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function joinBasePath(base: string, rawPath: string): { url: string; path: string } {
  const trimmed = rawPath.trim();
  if (!trimmed) throw new Error("route path is empty");
  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    return { url: parsed.toString(), path: parsed.pathname || "/" };
  }
  const pathPart = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return { url: new URL(pathPart, `${base}/`).toString(), path: pathPart };
}

export function inferRouteKind(routePath: string): LiveUrlRouteKind {
  const p = routePath.split("?")[0] ?? routePath;
  if (/\.(ico|png|jpe?g|gif|webp|svg|css|js|map|woff2?|ttf|txt|xml)$/i.test(p)) return "asset";
  if (/(^|\/)api(\/|$)/i.test(p)) return "api";
  if (p === "/" || !p.includes(".")) return "page";
  return "unknown";
}

function isLiveMethod(value: string): value is LiveUrlMethod {
  return LIVE_URL_METHODS.includes(value as LiveUrlMethod);
}

export function parseRoutesFile(filePath: string, defaultMethod: LiveUrlMethod): UrlTarget[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`Invalid JSON in --routes-file: ${filePath}`);
    }
    const items = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && "routes" in parsed
      ? (parsed as { routes: unknown }).routes
      : null;
    if (!Array.isArray(items)) {
      throw new Error("--routes-file JSON must be an array of paths or {path, method?} objects");
    }
    return items.flatMap((item, index) => {
      if (typeof item === "string") {
        const pathPart = item.trim();
        if (!pathPart) return [];
        return [{ path: pathPart.startsWith("/") ? pathPart : `/${pathPart}`, method: defaultMethod, route_kind: inferRouteKind(pathPart) }];
      }
      if (!item || typeof item !== "object") {
        throw new Error(`--routes-file item ${index} must be a string or object`);
      }
      const rec = item as { path?: unknown; method?: unknown; expected_auth?: unknown; route_kind?: unknown };
      if (typeof rec.path !== "string" || !rec.path.trim()) {
        throw new Error(`--routes-file item ${index} is missing path`);
      }
      const methodRaw = typeof rec.method === "string" ? rec.method.trim().toUpperCase() : defaultMethod;
      if (!isLiveMethod(methodRaw)) {
        throw new Error(`--routes-file item ${index} method must be GET or HEAD`);
      }
      const expected =
        typeof rec.expected_auth === "boolean" ? rec.expected_auth : undefined;
      const kind =
        rec.route_kind === "page" || rec.route_kind === "api" || rec.route_kind === "asset" || rec.route_kind === "unknown"
          ? rec.route_kind
          : inferRouteKind(rec.path);
      const pathPart = rec.path.trim().startsWith("/") ? rec.path.trim() : `/${rec.path.trim()}`;
      return [{ path: pathPart, method: methodRaw, route_kind: kind, expected_auth: expected }];
    });
  }

  const out: UrlTarget[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const tagged = text.match(/^(GET|HEAD)\s+(\S+)$/i);
    if (tagged) {
      const pathPart = tagged[2]!.startsWith("/") ? tagged[2]! : `/${tagged[2]}`;
      out.push({
        path: pathPart,
        method: tagged[1]!.toUpperCase() as LiveUrlMethod,
        route_kind: inferRouteKind(pathPart),
      });
      continue;
    }
    const pathPart = text.startsWith("/") ? text : `/${text}`;
    out.push({ path: pathPart, method: defaultMethod, route_kind: inferRouteKind(pathPart) });
  }
  return out;
}

function posixRel(rel: string): string {
  return rel.split(path.sep).join("/");
}

function walkSourceFiles(root: string, rel = ""): string[] {
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
      out.push(...walkSourceFiles(root, child));
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (DISCOVER_EXTS.has(ext)) out.push(child);
  }
  return out;
}

function isDynamicSegment(seg: string): boolean {
  return seg.startsWith("[") || seg.includes("...") || seg.startsWith("@");
}

export function nextAppFileToPath(relPath: string): string | undefined {
  const rel = posixRel(relPath);
  const match = rel.match(/^(?:src\/)?app\/(.+)\/(page|route)\.[a-z]+$/i) ?? rel.match(/^(?:src\/)?app\/(page|route)\.[a-z]+$/i);
  if (!match) return undefined;
  if (match.length === 2) return "/";
  const segs = (match[1] ?? "")
    .split("/")
    .filter((seg) => seg && !/^\(.*\)$/.test(seg));
  if (segs.some(isDynamicSegment)) return undefined;
  return segs.length === 0 ? "/" : `/${segs.join("/")}`;
}

export function nextPagesFileToPath(relPath: string): string | undefined {
  const rel = posixRel(relPath);
  const match = rel.match(/^(?:src\/)?pages\/(.+)\.[a-z]+$/i);
  if (!match) return undefined;
  const rest = match[1] ?? "";
  const base = rest.replace(/\/index$/i, "").replace(/^index$/i, "");
  if (base.startsWith("_") || /(^|\/)_/.test(base)) return undefined;
  const segs = base.split("/").filter(Boolean);
  if (segs.some(isDynamicSegment)) return undefined;
  return segs.length === 0 ? "/" : `/${segs.join("/")}`;
}

const EXPRESS_ROUTE = /\b(?:app|router|server|r)\.(get|head)\(\s*(['"`])(\/[^'"`]*?)\2/gi;

export function extractExpressRoutes(content: string): UrlTarget[] {
  const out: UrlTarget[] = [];
  for (const line of content.split(/\r?\n/)) {
    const code = line.replace(/\/\/.*$/, "");
    if (!code.trim()) continue;
    EXPRESS_ROUTE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = EXPRESS_ROUTE.exec(code))) {
      const routePath = match[3] ?? "";
      if (!routePath || routePath.includes(":") || routePath.includes("*") || routePath.includes("{")) continue;
      const method = (match[1] ?? "get").toUpperCase();
      if (!isLiveMethod(method)) continue;
      out.push({ path: routePath, method, route_kind: inferRouteKind(routePath) });
    }
  }
  return out;
}

export function discoverRoutes(root: string, defaultMethod: LiveUrlMethod): UrlTarget[] {
  const abs = path.resolve(root);
  const files = walkSourceFiles(abs);
  const seen = new Set<string>();
  const out: UrlTarget[] = [];
  const add = (target: UrlTarget): void => {
    const key = `${target.method} ${target.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(target);
  };

  for (const rel of files) {
    const appPath = nextAppFileToPath(rel);
    if (appPath) {
      const kind: LiveUrlRouteKind = /\/route\.[a-z]+$/i.test(rel) || appPath.startsWith("/api") ? "api" : "page";
      add({ path: appPath, method: defaultMethod, route_kind: kind });
      continue;
    }
    const pagesPath = nextPagesFileToPath(rel);
    if (pagesPath) {
      const kind: LiveUrlRouteKind = pagesPath.startsWith("/api") ? "api" : "page";
      add({ path: pagesPath, method: defaultMethod, route_kind: kind });
      continue;
    }
    if (out.length >= MAX_DISCOVERED_ROUTES) break;
    let content = "";
    try {
      content = fs.readFileSync(path.join(abs, rel), "utf8");
    } catch {
      continue;
    }
    if (content.length > 400_000) continue;
    for (const target of extractExpressRoutes(content)) add(target);
    if (out.length >= MAX_DISCOVERED_ROUTES) break;
  }
  return out.slice(0, MAX_DISCOVERED_ROUTES).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

export function uniqueTargets(targets: readonly UrlTarget[]): UrlTarget[] {
  const seen = new Set<string>();
  const out: UrlTarget[] = [];
  for (const target of targets) {
    const key = `${target.method} ${target.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }
  return out;
}

export function stripBodySnippet(raw: string, max = BODY_SNIPPET_CHARS): string {
  const noTags = raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const collapsed = noTags.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? collapsed.slice(0, max) : collapsed;
}

function looksLikeErrorBody(snippet: string): boolean {
  return /internal server error|application error|unhandled|exception|stack trace|error:\s/i.test(snippet);
}

function errorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const rec = err as { code?: unknown; cause?: unknown; name?: unknown };
  if (typeof rec.code === "string") return rec.code;
  if (rec.cause && typeof rec.cause === "object" && typeof (rec.cause as { code?: unknown }).code === "string") {
    return (rec.cause as { code: string }).code;
  }
  return typeof rec.name === "string" ? rec.name : "";
}

export function classifyNetworkError(err: unknown): LiveUrlErrorClass {
  const code = errorCode(err);
  const message = err instanceof Error ? err.message : String(err);
  if (
    code === "TimeoutError" ||
    code === "AbortError" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    /aborted|timeout/i.test(message)
  ) {
    return "timeout";
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || /getaddrinfo|ENOTFOUND/i.test(message)) {
    return "dns";
  }
  if (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "UND_ERR_SOCKET" ||
    /ECONNREFUSED|fetch failed/i.test(message)
  ) {
    return "connection";
  }
  return "other";
}

export function classifyHttpStatus(status: number, snippet?: string): LiveUrlErrorClass {
  if (status >= 200 && status < 300) {
    if (snippet && looksLikeErrorBody(snippet)) return "body_error_hint";
    return "ok";
  }
  if (status >= 500) return "http_5xx";
  if (status >= 400) return "http_4xx";
  if (status >= 300) return "other";
  return "other";
}

export function isAuthCandidate(result: Pick<UrlCheckResult, "status" | "error_class">): boolean {
  return result.status === 401 || result.status === 403;
}

export function isHardFailure(
  result: Pick<UrlCheckResult, "error_class" | "status">,
  opts: { strict404: boolean },
): boolean {
  if (
    result.error_class === "timeout" ||
    result.error_class === "dns" ||
    result.error_class === "connection" ||
    result.error_class === "redirect_loop" ||
    result.error_class === "http_5xx"
  ) {
    return true;
  }
  return Boolean(opts.strict404 && result.status === 404);
}

export function isCodeOk(
  result: Pick<UrlCheckResult, "error_class" | "status">,
  opts: { expectStatus?: StatusExpect },
): boolean {
  if (opts.expectStatus) return statusMatchesExpect(result.status, opts.expectStatus);
  return result.error_class === "ok";
}

function headerRecord(headers: Array<{ name: string; value: string }>, authCookie: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers) {
    out[header.name] = header.value;
  }
  if (authCookie.trim()) {
    const existing = out.Cookie ?? out.cookie;
    out.Cookie = existing ? `${existing}; ${authCookie.trim()}` : authCookie.trim();
  }
  return out;
}

export function requestHeadersForLogs(headers: Record<string, string>): string[] {
  return Object.keys(headers)
    .filter((name) => !SECRET_HEADER.test(name))
    .sort();
}

async function readSnippet(response: Response): Promise<{ snippet?: string; contentType?: string }> {
  const contentType = response.headers.get("content-type") ?? undefined;
  if (response.status < 400) return { contentType };
  try {
    const buf = await response.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 4_000));
    const snippet = stripBodySnippet(text);
    return { snippet: snippet || undefined, contentType };
  } catch {
    return { contentType };
  }
}

export async function checkOneUrl(
  target: UrlTarget,
  opts: {
    base: string;
    timeoutMs: number;
    followRedirects: boolean;
    maxRedirects: number;
    headers: Record<string, string>;
    expectStatus?: StatusExpect;
    strict404: boolean;
    fetchImpl?: typeof fetch;
    now?: () => number;
  },
): Promise<UrlCheckResult> {
  const { url, path: routePath } = joinBasePath(opts.base, target.path);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const started = now();
  const finish = (partial: Omit<UrlCheckResult, "ok" | "hard_failure" | "url" | "path" | "method" | "route_kind" | "expected_auth" | "ms"> & { ms?: number }): UrlCheckResult => {
    const draft: UrlCheckResult = {
      url,
      path: routePath,
      method: target.method,
      status: partial.status,
      final_url: partial.final_url,
      redirect_hops: partial.redirect_hops,
      ms: partial.ms ?? Math.max(0, now() - started),
      error_class: partial.error_class,
      route_kind: target.route_kind,
      expected_auth: target.expected_auth,
      body_snippet: partial.body_snippet,
      content_type: partial.content_type,
      ok: false,
      hard_failure: false,
    };
    draft.ok = isCodeOk(draft, { expectStatus: opts.expectStatus });
    draft.hard_failure = isHardFailure(draft, { strict404: opts.strict404 });
    return draft;
  };

  let current = url;
  let hops = 0;
  const seen = new Set<string>();

  try {
    while (true) {
      if (seen.has(current)) {
        return finish({
          status: null,
          final_url: current,
          redirect_hops: hops,
          error_class: "redirect_loop",
        });
      }
      seen.add(current);
      const response = await fetchImpl(current, {
        method: target.method,
        headers: opts.headers,
        redirect: "manual",
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
      const location = response.headers.get("location");
      const isRedirect = response.status >= 300 && response.status < 400 && Boolean(location);
      if (isRedirect && opts.followRedirects) {
        hops += 1;
        if (hops > opts.maxRedirects) {
          return finish({
            status: response.status,
            final_url: current,
            redirect_hops: hops,
            error_class: "redirect_loop",
            content_type: response.headers.get("content-type") ?? undefined,
          });
        }
        current = new URL(location!, current).toString();
        continue;
      }
      const { snippet, contentType } = await readSnippet(response);
      return finish({
        status: response.status,
        final_url: current,
        redirect_hops: hops,
        error_class: classifyHttpStatus(response.status, snippet),
        body_snippet: snippet,
        content_type: contentType,
      });
    }
  } catch (err) {
    return finish({
      status: null,
      final_url: current,
      redirect_hops: hops,
      error_class: classifyNetworkError(err),
    });
  }
}

export function toLiveUrlState(
  result: UrlCheckResult,
  opts: { base: string; notes?: string },
): Record<string, unknown> {
  const state: Record<string, unknown> = {
    base_url: opts.base,
    path: result.path,
    url: result.url,
    method: result.method,
    final_url: result.final_url,
    redirect_hops: result.redirect_hops,
    ms: result.ms,
    error_class: result.error_class,
    route_kind: result.route_kind,
  };
  if (result.status !== null) state.status = result.status;
  if (result.expected_auth !== undefined) state.expected_auth = result.expected_auth;
  if (result.body_snippet) state.body_snippet = result.body_snippet.slice(0, MAX_LIVE_URL_SNIPPET);
  if (result.content_type) state.content_type = result.content_type;
  if (opts.notes?.trim()) state.notes = opts.notes.trim().slice(0, MAX_LIVE_URL_NOTES);
  return state;
}

export function rankForJudge(results: readonly UrlCheckResult[], n: number): UrlCheckResult[] {
  const weight = (item: UrlCheckResult): number => {
    if (item.error_class === "http_5xx" || item.error_class === "redirect_loop") return 5;
    if (item.error_class === "timeout" || item.error_class === "connection" || item.error_class === "dns") return 4;
    if (item.error_class === "body_error_hint") return 3;
    if (item.status === 404) return 2;
    if (isAuthCandidate(item)) return 1;
    return 0;
  };
  return results
    .filter((item) => !item.ok)
    .slice()
    .sort((a, b) => weight(b) - weight(a) || a.path.localeCompare(b.path))
    .slice(0, Math.max(0, n));
}

export function summarizeUrlCheck(
  results: readonly UrlCheckResult[],
  opts: { judged?: number; elapsedMs?: number } = {},
): UrlCheckSummary {
  const histogram: Record<string, number> = {};
  for (const cls of LIVE_URL_ERROR_CLASSES) histogram[cls] = 0;
  let ok = 0;
  let hard = 0;
  let auth = 0;
  let fail = 0;
  for (const result of results) {
    histogram[result.error_class] = (histogram[result.error_class] ?? 0) + 1;
    if (result.ok) ok += 1;
    if (result.hard_failure) hard += 1;
    if (isAuthCandidate(result)) auth += 1;
    if (!result.ok && !result.hard_failure) fail += 1;
  }
  return {
    urls: results.length,
    ok,
    hard_failures: hard,
    auth_candidates: auth,
    fail_candidates: fail,
    judged: opts.judged ?? 0,
    elapsed_ms: opts.elapsedMs ?? 0,
    error_class: histogram,
  };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}

export function formatUrlCheckTable(results: readonly UrlCheckResult[], summary: UrlCheckSummary): string {
  const lines = [
    "METHOD  STATUS  MS     CLASS            GATE  URL",
  ];
  for (const row of results) {
    const status = row.status === null ? "—" : String(row.status);
    const gate = row.hard_failure ? "FAIL" : row.ok ? "ok" : "warn";
    lines.push(
      `${pad(row.method, 7)} ${pad(status, 7)} ${pad(String(row.ms), 6)} ${pad(row.error_class, 16)} ${pad(gate, 5)} ${row.url}`,
    );
  }
  lines.push(
    `urlcheck: ${summary.urls} urls · ok ${summary.ok} · hard-fail ${summary.hard_failures} · auth ${summary.auth_candidates} · fail-candidates ${summary.fail_candidates}` +
      (summary.judged ? ` · judged ${summary.judged}` : ""),
  );
  return `${lines.join("\n")}\n`;
}

export function formatJudgments(judgments: readonly UrlCheckJudgment[]): string {
  if (judgments.length === 0) return "";
  const lines = ["judgments (live_url_check):"];
  for (const item of judgments) {
    if (item.error) {
      lines.push(`  ${item.path}  error ${item.error.code}: ${item.error.message}`);
      continue;
    }
    const answers = item.answers as
      | {
          is_real_break?: { noul?: number };
          is_expected_auth_or_redirect?: { noul?: number };
          severity?: { score?: number };
          primary_failure_kind?: { choice?: string };
          next_action?: { choice?: string };
        }
      | undefined;
    const kind = answers?.primary_failure_kind?.choice ?? "?";
    const action = answers?.next_action?.choice ?? "?";
    const sev = typeof answers?.severity?.score === "number" ? answers.severity.score.toFixed(2) : "?";
    const real = typeof answers?.is_real_break?.noul === "number" ? answers.is_real_break.noul.toFixed(2) : "?";
    lines.push(`  ${item.path}  kind=${kind}  next=${action}  severity=${sev}  real_break=${real}`);
  }
  return `${lines.join("\n")}\n`;
}

export type UrlCheckRunOptions = {
  base: string;
  targets: UrlTarget[];
  concurrency?: number;
  timeoutMs?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  expectStatus?: StatusExpect;
  headers?: Record<string, string>;
  authCookie?: string;
  strict404?: boolean;
  judge?: boolean;
  judgeLimit?: number;
  notes?: string;
  json?: boolean;
  config?: AppConfig;
  systemOne?: SystemOneCall;
  fetchImpl?: typeof fetch;
  now?: () => number;
  writeLine?: (line: string) => void;
  writeError?: (line: string) => void;
};

export async function runUrlCheck(options: UrlCheckRunOptions): Promise<{
  results: UrlCheckResult[];
  judgments: UrlCheckJudgment[];
  summary: UrlCheckSummary;
}> {
  const concurrency = options.concurrency ?? DEFAULT_URLCHECK_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_URLCHECK_TIMEOUT_MS;
  const followRedirects = options.followRedirects !== false;
  const maxRedirects = typeof options.maxRedirects === "number" ? options.maxRedirects : DEFAULT_MAX_REDIRECTS;
  const strict404 = Boolean(options.strict404);
  const judge = Boolean(options.judge);
  const judgeLimit = options.judgeLimit ?? DEFAULT_JUDGE_LIMIT;
  const now = options.now ?? Date.now;
  const writeLine = options.writeLine ?? ((line: string) => process.stdout.write(`${line}\n`));
  const writeError = options.writeError ?? ((line: string) => process.stderr.write(`${line}\n`));
  const headers = headerRecord(Object.entries(options.headers ?? {}).map(([name, value]) => ({ name, value })), options.authCookie ?? "");
  const started = now();

  if (judge && !options.config?.apiKeySet) {
    throw missingApiKeyError();
  }

  const results = await mapLimit(options.targets, concurrency, (target) =>
    checkOneUrl(target, {
      base: options.base,
      timeoutMs,
      followRedirects,
      maxRedirects,
      headers,
      expectStatus: options.expectStatus,
      strict404,
      fetchImpl: options.fetchImpl,
      now,
    }),
  );

  const toJudge = judge ? rankForJudge(results, judgeLimit) : [];
  const judgments: UrlCheckJudgment[] = [];
  if (toJudge.length > 0 && options.config) {
    const systemOne = options.systemOne ?? createSystemOne(options.config);
    for (const result of toJudge) {
      try {
        const packed = await handleRunPack(
          { pack_id: "live_url_check", state: toLiveUrlState(result, { base: options.base, notes: options.notes }) },
          { config: options.config, systemOne },
        );
        judgments.push({
          url: result.url,
          path: result.path,
          pack_id: "live_url_check",
          answers: packed.answers,
          usage: packed.usage,
        });
      } catch (err) {
        const friendly = toFriendlyError(err);
        judgments.push({
          url: result.url,
          path: result.path,
          pack_id: "live_url_check",
          error: { code: friendly.code, message: friendly.message },
        });
      }
    }
  }

  const summary = summarizeUrlCheck(results, { judged: judgments.length, elapsedMs: now() - started });
  const report = {
    base: options.base,
    header_names: requestHeadersForLogs(headers),
    results,
    judgments,
    summary,
  };

  if (options.json) {
    writeLine(JSON.stringify(report, null, 2));
  } else {
    writeLine(formatUrlCheckTable(results, summary).trimEnd());
    const judged = formatJudgments(judgments).trimEnd();
    if (judged) writeLine(judged);
  }

  void writeError;
  return { results, judgments, summary };
}

export function collectUrlCheckTargets(args: UrlCheckCliArgs): UrlTarget[] {
  const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
  const fromFile = args.routesFile ? parseRoutesFile(path.resolve(args.routesFile), args.method) : [];
  const discovered = args.discover ? discoverRoutes(cwd, args.method) : [];
  const targets = uniqueTargets([...fromFile, ...discovered]);
  if (targets.length === 0) {
    throw new Error(
      args.discover || args.routesFile
        ? "No routes found. Discovery is conservative (Next.js app/pages router files without dynamic [segments], plus Express-ish app.get('/path') / router.head('/path') in common source files). Pass --routes-file with paths, or add page.tsx / route.ts files."
        : "No routes to check. Pass --routes-file PATH and/or --discover.",
    );
  }
  return targets;
}

export const URLCHECK_HELP = `mcp_jev urlcheck --base URL [options]

Hit localhost (or any --base) from this process, collect per-URL signals, and
optionally judge failures with pack live_url_check. Jev never makes HTTP requests.

  --base URL            Required origin, e.g. http://localhost:3000
  --routes-file PATH    JSON array of paths / {path, method?} or text (one path per line;
                        optional "GET /path" lines). Comments start with #
  --discover            Best-effort routes from cwd (Next.js app/ or pages/ page+route
                        files; Express-ish app.get('/path') / router.head('/path')).
                        Skips dynamic [segments], route params, and node_modules.
                        Cap ${MAX_DISCOVERED_ROUTES}. If nothing is found and there is no
                        routes-file, exit with an error.
  --cwd PATH            Discovery root (default: process cwd)
  --method GET|HEAD     Default method when a route omits one (default GET)
  --concurrency N       Parallel workers (default ${DEFAULT_URLCHECK_CONCURRENCY}, or $${URLCHECK_CONCURRENCY_ENV})
  --timeout-ms N        Per-request timeout (default ${DEFAULT_URLCHECK_TIMEOUT_MS})
  --follow-redirects    Follow redirects (default true, max ${DEFAULT_MAX_REDIRECTS} hops)
  --no-follow-redirects Do not follow redirects
  --max-redirects N     Redirect hop cap (default ${DEFAULT_MAX_REDIRECTS})
  --expect-status LIST  Treat these as ok, e.g. 200,204 or 200-299 or 2xx
  --auth-cookie VAL     Cookie header (never printed)
  --header "Name: val"  Extra request header (repeatable; secrets never printed)
  --strict-404          Unexpected 404 is a hard failure (exit non-zero)
  --judge               After the crawl, run_pack live_url_check on top failures
  --judge-limit N       Max URLs to judge (default ${DEFAULT_JUDGE_LIMIT})
  --notes TEXT          Optional pack notes (mention a recent change only if true)
  --json                Machine-readable report on stdout
  --help                This text

Code gate (exit 0 only when hard_failures = 0):
  hard fail  — timeout, dns, connection, redirect_loop, http 5xx;
               404 only with --strict-404
  ok         — 2xx (or --expect-status match); 3xx that land on 2xx count as ok
  warn       — 401/403 (auth candidate), 404 without --strict-404, other 4xx

Without --judge the table/JSON is enough; Jev is not called.
With --judge, each judged URL uses pack live_url_check (same run_pack / systemOne
path as scan). Missing API key → clear error.

Discovery limits: no sitemap, no running the app, no expansion of [id] / :param
routes, no public/ asset crawl. Prefer --routes-file for a known list.

Never prints cookies, Authorization, or other secret header values.

Examples:
  mcp_jev urlcheck --base http://localhost:3000 --discover
  mcp_jev urlcheck --base http://localhost:3000 --routes-file routes.txt
  mcp_jev urlcheck --base http://127.0.0.1:3000 --routes-file routes.json --judge --json
`;
