import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { getPack } from "../src/packs/index.js";
import {
  checkOneUrl,
  classifyNetworkError,
  collectUrlCheckTargets,
  discoverRoutes,
  extractExpressRoutes,
  formatUrlCheckTable,
  inferRouteKind,
  isHardFailure,
  joinBasePath,
  nextAppFileToPath,
  nextPagesFileToPath,
  normalizeBaseUrl,
  parseExpectStatus,
  parseHeaderFlag,
  parseRoutesFile,
  parseUrlCheckArgs,
  rankForJudge,
  requestHeadersForLogs,
  runUrlCheck,
  statusMatchesExpect,
  stripBodySnippet,
  summarizeUrlCheck,
  toLiveUrlState,
  URLCHECK_HELP,
} from "../src/urlcheck.js";
import { validatePackState } from "../src/validate.js";

const root = fileURLToPath(new URL("..", import.meta.url));

function runCli(args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, TYPESAFE_API_KEY: "", ...extraEnv },
  });
}

function runCliAsync(args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts", ...args], {
      cwd: root,
      env: { ...process.env, TYPESAFE_API_KEY: "", ...extraEnv },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  try {
    await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test("parseUrlCheckArgs defaults and flags", () => {
  const args = parseUrlCheckArgs(["--base", "http://localhost:3000", "--discover"], {});
  assert.equal(args.base, "http://localhost:3000");
  assert.equal(args.discover, true);
  assert.equal(args.method, "GET");
  assert.equal(args.concurrency, 8);
  assert.equal(args.timeoutMs, 5000);
  assert.equal(args.followRedirects, true);
  assert.equal(args.judge, false);
  assert.equal(args.strict404, false);

  const full = parseUrlCheckArgs(
    [
      "--base=http://127.0.0.1:3000",
      "--method",
      "HEAD",
      "--concurrency",
      "4",
      "--timeout-ms",
      "1500",
      "--no-follow-redirects",
      "--max-redirects",
      "2",
      "--expect-status",
      "200,204,2xx",
      "--auth-cookie",
      "sid=secret",
      "--header",
      "X-Test: 1",
      "--judge",
      "--judge-limit",
      "3",
      "--strict-404",
      "--json",
      "--notes",
      "Recent change to checkout.",
    ],
    {},
  );
  assert.equal(full.method, "HEAD");
  assert.equal(full.followRedirects, false);
  assert.equal(full.judge, true);
  assert.equal(full.strict404, true);
  assert.equal(full.authCookie, "sid=secret");
  assert.deepEqual(full.headers, [{ name: "X-Test", value: "1" }]);
  assert.ok(statusMatchesExpect(204, full.expectStatus));

  const fromEnv = parseUrlCheckArgs(["--base", "http://localhost:1"], { MCP_JEV_URLCHECK_CONCURRENCY: "16" });
  assert.equal(fromEnv.concurrency, 16);
  assert.throws(() => parseUrlCheckArgs(["--nope"], {}), /Unknown urlcheck flag/);
});

test("expect-status and header parsers", () => {
  const expect = parseExpectStatus("401,403,200-204");
  assert.equal(statusMatchesExpect(401, expect), true);
  assert.equal(statusMatchesExpect(202, expect), true);
  assert.equal(statusMatchesExpect(500, expect), false);
  assert.deepEqual(parseHeaderFlag("Authorization: Bearer x"), { name: "Authorization", value: "Bearer x" });
  assert.throws(() => parseHeaderFlag("nocolon"), /Name: value/);
});

test("normalizeBaseUrl and joinBasePath", () => {
  assert.equal(normalizeBaseUrl("http://localhost:3000/"), "http://localhost:3000");
  assert.throws(() => normalizeBaseUrl("ftp://x"), /http/);
  assert.deepEqual(joinBasePath("http://localhost:3000", "/about"), {
    url: "http://localhost:3000/about",
    path: "/about",
  });
});

test("route discovery: Next.js files and Express-ish strings", () => {
  assert.equal(nextAppFileToPath("app/page.tsx"), "/");
  assert.equal(nextAppFileToPath("src/app/about/page.tsx"), "/about");
  assert.equal(nextAppFileToPath("app/(marketing)/pricing/page.tsx"), "/pricing");
  assert.equal(nextAppFileToPath("app/blog/[slug]/page.tsx"), undefined);
  assert.equal(nextAppFileToPath("app/api/health/route.ts"), "/api/health");
  assert.equal(nextPagesFileToPath("pages/index.tsx"), "/");
  assert.equal(nextPagesFileToPath("pages/about.tsx"), "/about");
  assert.equal(nextPagesFileToPath("pages/_app.tsx"), undefined);
  assert.equal(nextPagesFileToPath("pages/blog/[slug].tsx"), undefined);
  assert.equal(nextPagesFileToPath("pages/api/hello.ts"), "/api/hello");
  assert.equal(inferRouteKind("/api/health"), "api");
  assert.equal(inferRouteKind("/favicon.ico"), "asset");
  assert.equal(inferRouteKind("/about"), "page");

  const express = extractExpressRoutes(`
    app.get("/health", handler);
    router.head('/ready', handler);
    app.get("/users/:id", handler);
    // app.get("/commented", handler)
  `);
  assert.deepEqual(
    express.map((item) => `${item.method} ${item.path}`).sort(),
    ["GET /health", "HEAD /ready"],
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-jev-discover-"));
  fs.mkdirSync(path.join(dir, "app", "about"), { recursive: true });
  fs.mkdirSync(path.join(dir, "app", "api", "health"), { recursive: true });
  fs.mkdirSync(path.join(dir, "app", "blog", "[slug]"), { recursive: true });
  fs.writeFileSync(path.join(dir, "app", "page.tsx"), "export default function Home() { return null }");
  fs.writeFileSync(path.join(dir, "app", "about", "page.tsx"), "export default function About() { return null }");
  fs.writeFileSync(path.join(dir, "app", "api", "health", "route.ts"), "export function GET() {}");
  fs.writeFileSync(path.join(dir, "app", "blog", "[slug]", "page.tsx"), "export default function Post() { return null }");
  fs.writeFileSync(path.join(dir, "server.ts"), 'import express from "express";\nconst app = express();\napp.get("/ping", () => {});\n');
  const found = discoverRoutes(dir, "GET");
  assert.deepEqual(
    found.map((item) => item.path).sort(),
    ["/", "/about", "/api/health", "/ping"],
  );
});

test("parseRoutesFile accepts JSON and text", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-jev-routes-"));
  const jsonFile = path.join(dir, "routes.json");
  fs.writeFileSync(
    jsonFile,
    JSON.stringify([
      "/",
      { path: "/admin", method: "GET", expected_auth: true, route_kind: "page" },
    ]),
  );
  const fromJson = parseRoutesFile(jsonFile, "GET");
  assert.equal(fromJson.length, 2);
  assert.equal(fromJson[1]?.expected_auth, true);

  const textFile = path.join(dir, "routes.txt");
  fs.writeFileSync(textFile, "# comment\n/\nGET /api/health\nHEAD /favicon.ico\n");
  const fromText = parseRoutesFile(textFile, "GET");
  assert.deepEqual(
    fromText.map((item) => `${item.method} ${item.path}`),
    ["GET /", "GET /api/health", "HEAD /favicon.ico"],
  );
});

test("collectUrlCheckTargets errors when discovery is empty", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-jev-empty-"));
  assert.throws(
    () => collectUrlCheckTargets({ ...parseUrlCheckArgs(["--base", "http://localhost:1", "--discover"], {}), cwd: dir }),
    /No routes found/,
  );
});

test("HTTP harness classifies status, auth, redirects, and hard failures", async () => {
  await withServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    if (url === "/hidden") {
      res.writeHead(401, { "content-type": "text/plain" });
      res.end("login required");
      return;
    }
    if (url === "/missing") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("nope");
      return;
    }
    if (url === "/boom") {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("Internal Server Error");
      return;
    }
    if (url === "/go") {
      res.writeHead(302, { location: "/" });
      res.end();
      return;
    }
    if (url === "/loop") {
      res.writeHead(302, { location: "/loop" });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  }, async (base) => {
    const common = {
      base,
      timeoutMs: 1000,
      followRedirects: true,
      maxRedirects: 5,
      headers: {},
      strict404: false,
    };
    const home = await checkOneUrl({ path: "/", method: "GET", route_kind: "page" }, common);
    assert.equal(home.ok, true);
    assert.equal(home.hard_failure, false);
    assert.equal(home.error_class, "ok");
    assert.equal(home.status, 200);
    assert.equal(home.body_snippet, undefined);

    const hidden = await checkOneUrl({ path: "/hidden", method: "GET", route_kind: "page" }, common);
    assert.equal(hidden.status, 401);
    assert.equal(hidden.ok, false);
    assert.equal(hidden.hard_failure, false);
    assert.equal(hidden.error_class, "http_4xx");
    assert.ok(hidden.body_snippet?.includes("login"));

    const missing = await checkOneUrl({ path: "/missing", method: "GET", route_kind: "page" }, { ...common, strict404: true });
    assert.equal(missing.status, 404);
    assert.equal(missing.hard_failure, true);

    const boom = await checkOneUrl({ path: "/boom", method: "GET", route_kind: "api" }, common);
    assert.equal(boom.error_class, "http_5xx");
    assert.equal(boom.hard_failure, true);
    assert.ok(boom.body_snippet);

    const redirected = await checkOneUrl({ path: "/go", method: "GET", route_kind: "page" }, common);
    assert.equal(redirected.ok, true);
    assert.equal(redirected.redirect_hops, 1);
    assert.equal(redirected.error_class, "ok");

    const loop = await checkOneUrl({ path: "/loop", method: "GET", route_kind: "page" }, common);
    assert.equal(loop.error_class, "redirect_loop");
    assert.equal(loop.hard_failure, true);
  });
});

test("connection refused is a hard failure and not a secret leak", async () => {
  const result = await checkOneUrl(
    { path: "/", method: "GET", route_kind: "page" },
    {
      base: "http://127.0.0.1:1",
      timeoutMs: 500,
      followRedirects: true,
      maxRedirects: 2,
      headers: { Cookie: "sid=super-secret", Authorization: "Bearer hidden" },
      strict404: false,
    },
  );
  assert.equal(isHardFailure(result, { strict404: false }), true);
  assert.ok(result.error_class === "connection" || result.error_class === "other");
  assert.deepEqual(requestHeadersForLogs({ Cookie: "sid=super-secret", Authorization: "Bearer hidden", Accept: "text/plain" }), [
    "Accept",
  ]);
});

test("runUrlCheck gates without TypeSafe and judges failures with a mock", async () => {
  await withServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error");
  }, async (base) => {
    const lines: string[] = [];
    const { summary, results } = await runUrlCheck({
      base,
      targets: [
        { path: "/", method: "GET", route_kind: "page" },
        { path: "/boom", method: "GET", route_kind: "api" },
      ],
      json: false,
      writeLine: (line) => lines.push(line),
      writeError: () => {},
    });
    assert.equal(summary.urls, 2);
    assert.equal(summary.ok, 1);
    assert.equal(summary.hard_failures, 1);
    assert.match(lines.join("\n"), /FAIL/);
    assert.doesNotMatch(lines.join("\n"), /sid=|Bearer /);

    const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
    const pack = getPack("live_url_check");
    const judged = await runUrlCheck({
      base,
      targets: [
        { path: "/", method: "GET", route_kind: "page" },
        { path: "/boom", method: "GET", route_kind: "api" },
      ],
      judge: true,
      json: true,
      notes: "Recent change to /boom.",
      config,
      writeLine: (line) => lines.push(line),
      writeError: () => {},
      systemOne: async (input) => {
        assert.equal((input.state as { path?: string }).path, "/boom");
        validatePackState(pack, input.state);
        return {
          model: "jev-latest",
          answers: {
            is_real_break: { type: "noul", noul: 0.9 },
            is_expected_auth_or_redirect: { type: "noul", noul: 0.05 },
            likely_regression_from_recent_change: { type: "noul", noul: 0.8 },
            severity: { type: "score", score: 3, confidence: 0.7, legend: { 0: "n", 1: "l", 2: "m", 3: "b" }, probabilities: { 3: 1 } },
            primary_failure_kind: { type: "choice", choice: "server_error", confidence: 0.9, probabilities: { server_error: 0.9 } },
            next_action: { type: "choice", choice: "fix_server", confidence: 0.8, probabilities: { fix_server: 0.8 } },
          },
          usage: { input_tokens: 1, output_tokens: 1 },
        } as SystemOneResult<Questions>;
      },
    });
    assert.equal(judged.judgments.length, 1);
    assert.equal((judged.judgments[0]?.answers as { next_action: { choice: string } }).next_action.choice, "fix_server");
    assert.ok(toLiveUrlState(results[1]!, { base, notes: "Recent change" }).notes);

    const ranked = rankForJudge(results, 1);
    assert.equal(ranked[0]?.path, "/boom");
    const table = formatUrlCheckTable(results, summarizeUrlCheck(results));
    assert.match(table, /urlcheck:/);
  });
});

test("stripBodySnippet and classifyNetworkError helpers", () => {
  assert.equal(stripBodySnippet("<html><script>x</script><p>Hi   there</p></html>"), "Hi there");
  assert.equal(classifyNetworkError(Object.assign(new Error("timeout"), { name: "TimeoutError", code: "TimeoutError" })), "timeout");
  assert.equal(classifyNetworkError(Object.assign(new Error("getaddrinfo"), { code: "ENOTFOUND" })), "dns");
});

test("urlcheck CLI help, missing routes, and secret redaction", async () => {
  const help = runCli(["urlcheck", "--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Code gate/);
  assert.match(help.stdout, /live_url_check/);
  assert.match(URLCHECK_HELP, /hard fail/);

  const rootHelp = runCli(["help"]);
  assert.match(rootHelp.stdout, /mcp_jev urlcheck/);

  const empty = runCli(["urlcheck", "--base", "http://127.0.0.1:1"]);
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /No routes to check/);

  await withServer((req, res) => {
    res.writeHead(req.headers.cookie?.includes("sid=super-secret") ? 200 : 401, { "content-type": "text/plain" });
    res.end(req.headers.cookie?.includes("sid=super-secret") ? "ok" : "no");
  }, async (base) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-jev-urlcli-"));
    const routes = path.join(dir, "routes.txt");
    fs.writeFileSync(routes, "/\n");
    const result = await runCliAsync([
      "urlcheck",
      "--base",
      base,
      "--routes-file",
      routes,
      "--auth-cookie",
      "sid=super-secret",
      "--header",
      "Authorization: Bearer hidden-token",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(!result.stdout.includes("super-secret"));
    assert.ok(!result.stderr.includes("super-secret"));
    assert.ok(!result.stdout.includes("hidden-token"));
    assert.ok(!result.stderr.includes("hidden-token"));
    const body = JSON.parse(result.stdout) as { results: Array<{ ok: boolean }>; header_names: string[] };
    assert.equal(body.results[0]?.ok, true);
    assert.ok(!body.header_names.includes("Authorization"));
    assert.ok(!body.header_names.includes("Cookie"));
  });
});
