import fs from "node:fs";
import path from "node:path";

import { loadConfig, type AppConfig } from "./config.js";
import { parseCustomRunInput } from "./custom-questions.js";
import { runDoctor, type DoctorReport } from "./doctor.js";
import { toFriendlyError } from "./errors.js";
import { handleRunPack, handleRunQuestions } from "./handlers.js";
import { allPacks, listPacks } from "./packs/registry.js";
import { SMOKE_PACK_IDS } from "./smoke.js";
import { createSystemOne, type SystemOneCall } from "./typesafe.js";
import {
  checkOneUrl,
  discoverRoutes,
  normalizeBaseUrl,
  runUrlCheck,
  uniqueTargets,
  type UrlTarget,
} from "./urlcheck.js";
import { defaultUserConfigDir } from "./user-config.js";
import { SERVER_NAME, SERVER_VERSION } from "./version.js";

export const DOGFOOD_HISTORY_KEEP = 10;
export const DOGFOOD_STOCK_PACK_IDS = ["computer_use_step", "model_router"] as const;

export const DOGFOOD_HELP = `mcp_jev dogfood [options]

Canonical local self-test. Writes a report the user or cron can run, and agents
Read — do not treat a remote Shell failure (e.g. spawn /bin/zsh ENOENT) as
"mcp_jev broken". Prefer this command + Read ~/.mcp_jev/dogfood/latest.md, or
call MCP tools (run_questions / run_pack) when the server is attached.

  --json                Print the machine report (never includes the key)
  --skip-live           Skip TypeSafe calls even if a key is set
  --urlcheck-base URL   If that origin is up, run urlcheck --discover (or /)
  --out DIR             Report directory (default ~/.mcp_jev/dogfood)

Always writes:
  DIR/latest.json
  DIR/latest.md
  DIR/history/  (last ${DOGFOOD_HISTORY_KEEP} runs)

Exit 0 when install checks pass and either live TypeSafe was skipped (no key
or --skip-live) or live calls succeeded without invent-fail. Non-zero on
install fail, invent-fail, live TypeSafe fail, or hard urlcheck fail.
`;

export type DogfoodStepStatus = "ok" | "skipped" | "fail";

export type DogfoodCliArgs = {
  json: boolean;
  skipLive: boolean;
  urlcheckBase: string;
  outDir: string;
  help: boolean;
};

export type DogfoodReport = {
  ok: boolean;
  server: string;
  server_version: string;
  started_at: string;
  elapsed_ms: number;
  out_dir: string;
  skip_live: boolean;
  doctor: {
    ready: boolean;
    install_ok: boolean;
    api_key_set: boolean;
    api_key_source: string;
    checks: Array<{ id: string; ok: boolean; message: string }>;
  };
  packs: {
    status: DogfoodStepStatus;
    ids: string[];
    ms: number;
    error?: string;
  };
  wind_tunnel: {
    invented_before_list: boolean;
    invent_fail: boolean;
    status: DogfoodStepStatus;
    ms: number;
    gate?: string;
    question_ids?: string[];
    skip_reason?: string;
    error?: string;
  };
  stock_pack: {
    pack_id?: string;
    status: DogfoodStepStatus;
    ms: number;
    skip_reason?: string;
    error?: string;
  };
  urlcheck: {
    status: DogfoodStepStatus;
    ms: number;
    base?: string;
    urls?: number;
    hard_failures?: number;
    skip_reason?: string;
    error?: string;
  };
  files: {
    json: string;
    md: string;
  };
};

export type BlindWindTunnelBody = {
  state: Record<string, unknown>;
  questions: unknown[];
};

export type DogfoodDeps = {
  env?: NodeJS.ProcessEnv;
  userConfigDir?: string;
  repoHome?: string;
  homeDir?: string;
  now?: () => Date;
  systemOne?: SystemOneCall;
  inventFixture?: () => BlindWindTunnelBody;
  fetchImpl?: typeof fetch;
  discoverCwd?: string;
};

function takeValue(argv: string[], arg: string, i: number, name: string): [string, number] {
  if (arg.startsWith(`${name}=`)) return [arg.slice(name.length + 1), i];
  const next = argv[i + 1];
  if (!next || next.startsWith("-")) {
    throw new Error(`${name} requires a value`);
  }
  return [next, i + 1];
}

export function parseDogfoodArgs(argv: string[]): DogfoodCliArgs {
  let json = false;
  let skipLive = false;
  let urlcheckBase = "";
  let outDir = "";
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--skip-live") {
      skipLive = true;
      continue;
    }
    if (arg === "--urlcheck-base" || arg.startsWith("--urlcheck-base=")) {
      const [raw, next] = takeValue(argv, arg, i, "--urlcheck-base");
      urlcheckBase = raw;
      i = next;
      continue;
    }
    if (arg === "--out" || arg.startsWith("--out=")) {
      const [raw, next] = takeValue(argv, arg, i, "--out");
      outDir = raw;
      i = next;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown dogfood flag "${arg}". Try: mcp_jev dogfood --help`);
    }
    throw new Error(`Unexpected extra argument "${arg}". Usage: mcp_jev dogfood`);
  }

  return { json, skipLive, urlcheckBase, outDir, help };
}

export function defaultDogfoodDir(userConfigDir: string = defaultUserConfigDir()): string {
  return path.join(userConfigDir, "dogfood");
}

/** Invented first (blind). Do not call listPacks / allPacks before this. */
export function inventBlindWindTunnel(): BlindWindTunnelBody {
  return {
    state: {
      path: "src/api/client.ts",
      change_summary: "Renamed public export fetchUser to getUser and dropped locale.",
      has_changelog_note: false,
    },
    questions: [
      {
        id: "is_breaking",
        type: "noul",
        instructions:
          "Given `change_summary` at `path`, is this a caller-visible breaking change?",
        criteria: {
          true: "Callers must update imports or arity.",
          false: "Compatible rename or internal-only.",
        },
      },
      {
        id: "next_action",
        type: "choice",
        instructions: "What should the harness do before shipping, given `has_changelog_note`?",
        criteria: {
          ship: "Safe to ship as-is.",
          add_note: "Add a changelog / migration note, then ship.",
          block: "Block the ship until callers are covered.",
        },
      },
    ],
  };
}

export function gateBlindWindTunnel(answers: Record<string, unknown>): "ship" | "add_note" | "block" {
  const breaking = readNoul(answers.is_breaking);
  const action = readChoice(answers.next_action);
  if (action === "block" || breaking >= 0.8) return "block";
  if (action === "add_note" || breaking >= 0.55) return "add_note";
  return "ship";
}

function readNoul(value: unknown): number {
  if (value && typeof value === "object" && typeof (value as { noul?: unknown }).noul === "number") {
    return (value as { noul: number }).noul;
  }
  return 0.5;
}

function readChoice(value: unknown): string {
  if (value && typeof value === "object" && typeof (value as { choice?: unknown }).choice === "string") {
    return (value as { choice: string }).choice;
  }
  return "";
}

const KEY_SHAPED = /sk-[A-Za-z0-9_-]{8,}/g;

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(KEY_SHAPED, "sk-[redacted]").replace(
      /(TYPESAFE_API_KEY\s*[=:]\s*)\S+/gi,
      "$1[redacted]",
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = redactSecrets(child);
    }
    return out;
  }
  return value;
}

export function redactText(text: string): string {
  return redactSecrets(text) as string;
}

const INSTALL_CHECK_IDS = new Set(["checkout", "dist", "wrapper", "not_ready_marker"]);

export function doctorInstallOk(report: Pick<DoctorReport, "checks">): boolean {
  const needed = report.checks.filter((check) => INSTALL_CHECK_IDS.has(check.id));
  return needed.length === INSTALL_CHECK_IDS.size && needed.every((check) => check.ok);
}

export function formatDogfoodMarkdown(report: DogfoodReport): string {
  const lines = [
    `# mcp_jev dogfood ${report.server_version}`,
    "",
    `**${report.ok ? "PASS" : "FAIL"}** · ${report.started_at} · ${report.elapsed_ms}ms`,
    "",
    "Canonical local self-test. A remote Shell failure (`spawn /bin/zsh ENOENT`, Always Allow, missing zsh) is **not** “mcp_jev broken”. Run `mcp_jev dogfood` (or cron), then **Read** this file. If the MCP server is attached, call `run_questions` / `run_pack` instead of Shell.",
    "",
    "## Doctor",
    `install_ok ${report.doctor.install_ok ? "yes" : "no"} · ready ${report.doctor.ready ? "yes" : "no"} · api_key_set ${report.doctor.api_key_set} (source=${report.doctor.api_key_source})`,
  ];
  for (const check of report.doctor.checks) {
    lines.push(`- ${check.ok ? "ok" : "FAIL"} ${check.id}: ${check.message}`);
  }
  lines.push("");
  lines.push("## Packs (offline)");
  lines.push(
    `${report.packs.status} · ${report.packs.ids.length} packs · ${report.packs.ms}ms` +
      (report.packs.error ? ` · ${report.packs.error}` : ""),
  );
  if (report.packs.ids.length > 0) {
    lines.push(report.packs.ids.join(", "));
  }
  lines.push("");
  lines.push("## Blind Wind-Tunnel");
  const wind = [
    `invented_before_list ${report.wind_tunnel.invented_before_list ? "yes" : "no"}`,
    `invent_fail ${report.wind_tunnel.invent_fail ? "yes" : "no"}`,
    `status ${report.wind_tunnel.status}`,
    `${report.wind_tunnel.ms}ms`,
  ];
  if (report.wind_tunnel.gate) wind.push(`gate ${report.wind_tunnel.gate}`);
  if (report.wind_tunnel.question_ids?.length) {
    wind.push(`questions ${report.wind_tunnel.question_ids.join(", ")}`);
  }
  if (report.wind_tunnel.skip_reason) wind.push(`skip: ${report.wind_tunnel.skip_reason}`);
  if (report.wind_tunnel.error) wind.push(report.wind_tunnel.error);
  lines.push(wind.join(" · "));
  lines.push("");
  lines.push("## Stock pack");
  const stock = [
    report.stock_pack.pack_id ?? "(none)",
    report.stock_pack.status,
    `${report.stock_pack.ms}ms`,
  ];
  if (report.stock_pack.skip_reason) stock.push(`skip: ${report.stock_pack.skip_reason}`);
  if (report.stock_pack.error) stock.push(report.stock_pack.error);
  lines.push(stock.join(" · "));
  lines.push("");
  lines.push("## urlcheck");
  const url = [report.urlcheck.status, `${report.urlcheck.ms}ms`];
  if (report.urlcheck.base) url.push(report.urlcheck.base);
  if (typeof report.urlcheck.urls === "number") url.push(`${report.urlcheck.urls} urls`);
  if (typeof report.urlcheck.hard_failures === "number") {
    url.push(`hard_failures ${report.urlcheck.hard_failures}`);
  }
  if (report.urlcheck.skip_reason) url.push(`skip: ${report.urlcheck.skip_reason}`);
  if (report.urlcheck.error) url.push(report.urlcheck.error);
  lines.push(url.join(" · "));
  lines.push("");
  lines.push(`Wrote \`${report.files.json}\` and \`${report.files.md}\`.`);
  lines.push("Never prints the TypeSafe key.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function historyStamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function writeDogfoodReports(
  outDir: string,
  report: DogfoodReport,
  stamp: string,
  keep = DOGFOOD_HISTORY_KEEP,
): { json: string; md: string } {
  fs.mkdirSync(path.join(outDir, "history"), { recursive: true, mode: 0o700 });
  const jsonPath = path.join(outDir, "latest.json");
  const mdPath = path.join(outDir, "latest.md");
  const redacted = redactSecrets(report) as DogfoodReport;
  const jsonBody = `${JSON.stringify(redacted, null, 2)}\n`;
  const mdBody = formatDogfoodMarkdown(redacted);
  fs.writeFileSync(jsonPath, jsonBody, { encoding: "utf8" });
  fs.writeFileSync(mdPath, mdBody, { encoding: "utf8" });
  fs.writeFileSync(path.join(outDir, "history", `${stamp}.json`), jsonBody, { encoding: "utf8" });
  fs.writeFileSync(path.join(outDir, "history", `${stamp}.md`), mdBody, { encoding: "utf8" });
  rotateHistory(path.join(outDir, "history"), keep);
  return { json: jsonPath, md: mdPath };
}

function rotateHistory(historyDir: string, keep: number): void {
  const stamps = fs
    .readdirSync(historyDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
  while (stamps.length > keep) {
    const old = stamps.shift();
    if (!old) break;
    for (const ext of [".json", ".md"]) {
      const file = path.join(historyDir, `${old}${ext}`);
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  }
}

function offlinePackCheck(): { ids: string[] } {
  const summaries = listPacks();
  const ids = summaries.map((pack) => pack.id);
  for (const id of SMOKE_PACK_IDS) {
    if (!ids.includes(id)) {
      throw new Error(`list_packs missing ${id}`);
    }
  }
  for (const pack of allPacks()) {
    if (!pack.example_state || typeof pack.example_state !== "object") {
      throw new Error(`${pack.id} missing example_state`);
    }
  }
  return { ids };
}

function skipLiveReason(args: DogfoodCliArgs, apiKeySet: boolean): string | undefined {
  if (args.skipLive) return "--skip-live";
  if (!apiKeySet) return "no TypeSafe key";
  return undefined;
}

function pickStockPackId(ids: string[]): string | undefined {
  return DOGFOOD_STOCK_PACK_IDS.find((id) => ids.includes(id));
}

async function probeUrlcheckBase(
  base: string,
  deps: DogfoodDeps,
): Promise<{ up: boolean; reason?: string }> {
  const probe = await checkOneUrl(
    { path: "/", method: "GET", route_kind: "unknown" },
    {
      base,
      timeoutMs: 2000,
      followRedirects: true,
      maxRedirects: 3,
      headers: {},
      strict404: false,
      fetchImpl: deps.fetchImpl,
    },
  );
  if (probe.error_class === "connection" || probe.error_class === "dns" || probe.error_class === "timeout") {
    return { up: false, reason: `server not up (${probe.error_class})` };
  }
  return { up: true };
}

function urlcheckTargets(cwd: string): { targets: UrlTarget[]; source: string } {
  const discovered = uniqueTargets(discoverRoutes(cwd, "GET"));
  if (discovered.length > 0) {
    return { targets: discovered, source: "discover" };
  }
  return { targets: [{ path: "/", method: "GET", route_kind: "unknown" }], source: "/" };
}

export async function runDogfood(
  argv: string[],
  deps: DogfoodDeps = {},
): Promise<{ report: DogfoodReport; exitCode: number; markdown: string }> {
  const args = parseDogfoodArgs(argv);
  const env = deps.env ?? process.env;
  const userConfigDir = deps.userConfigDir ?? defaultUserConfigDir(env);
  const outDir = path.resolve(args.outDir || defaultDogfoodDir(userConfigDir));
  const started = deps.now?.() ?? new Date();
  const clockStart = Date.now();

  const doctor = runDoctor({
    env,
    userConfigDir,
    repoHome: deps.repoHome,
    homeDir: deps.homeDir,
    detectHosts: false,
  });
  const installOk = doctorInstallOk(doctor);
  const config = loadConfig(env, { userConfigDir });
  const liveSkip = skipLiveReason(args, config.apiKeySet);

  // Blind first — invent before any pack list.
  const inventedBeforeList = true;
  let inventFail = false;
  let invented: ReturnType<typeof parseCustomRunInput> | undefined;
  let inventError: string | undefined;
  const inventStarted = Date.now();
  try {
    const fixture = (deps.inventFixture ?? inventBlindWindTunnel)();
    invented = parseCustomRunInput(fixture);
  } catch (err) {
    inventFail = true;
    inventError = redactText(toFriendlyError(err).message);
  }
  const inventMs = Date.now() - inventStarted;

  let packsStatus: DogfoodReport["packs"] = { status: "ok", ids: [], ms: 0 };
  const packsStarted = Date.now();
  try {
    const { ids } = offlinePackCheck();
    packsStatus = { status: "ok", ids, ms: Date.now() - packsStarted };
  } catch (err) {
    packsStatus = {
      status: "fail",
      ids: [],
      ms: Date.now() - packsStarted,
      error: redactText(err instanceof Error ? err.message : String(err)),
    };
  }

  const systemOne = deps.systemOne ?? (config.apiKeySet ? createSystemOne(config) : undefined);
  const wind = await runWindTunnelStep({
    invented,
    inventFail,
    inventError,
    inventMs,
    inventedBeforeList,
    liveSkip,
    config,
    systemOne,
  });
  const stock = await runStockPackStep({
    packIds: packsStatus.ids,
    liveSkip,
    config,
    systemOne,
  });
  const urlcheck = await runUrlcheckStep(args, deps);

  const jsonPath = path.join(outDir, "latest.json");
  const mdPath = path.join(outDir, "latest.md");
  const liveFailed =
    wind.status === "fail" || stock.status === "fail" || urlcheck.status === "fail" || packsStatus.status === "fail";
  const ok = installOk && !inventFail && !liveFailed;
  const report: DogfoodReport = {
    ok,
    server: SERVER_NAME,
    server_version: SERVER_VERSION,
    started_at: started.toISOString(),
    elapsed_ms: Date.now() - clockStart,
    out_dir: outDir,
    skip_live: args.skipLive,
    doctor: {
      ready: doctor.ready,
      install_ok: installOk,
      api_key_set: doctor.api_key_set,
      api_key_source: doctor.api_key_source,
      checks: doctor.checks.map((check) => ({
        id: check.id,
        ok: check.ok,
        message: redactText(check.message),
      })),
    },
    packs: packsStatus,
    wind_tunnel: wind,
    stock_pack: stock,
    urlcheck,
    files: { json: jsonPath, md: mdPath },
  };

  const written = writeDogfoodReports(outDir, report, historyStamp(started));
  report.files = written;
  const markdown = formatDogfoodMarkdown(redactSecrets(report) as DogfoodReport);
  return { report: redactSecrets(report) as DogfoodReport, exitCode: ok ? 0 : 1, markdown };
}

async function runWindTunnelStep(input: {
  invented: ReturnType<typeof parseCustomRunInput> | undefined;
  inventFail: boolean;
  inventError?: string;
  inventMs: number;
  inventedBeforeList: boolean;
  liveSkip?: string;
  config: AppConfig;
  systemOne?: SystemOneCall;
}): Promise<DogfoodReport["wind_tunnel"]> {
  const base: DogfoodReport["wind_tunnel"] = {
    invented_before_list: input.inventedBeforeList,
    invent_fail: input.inventFail,
    status: "fail",
    ms: input.inventMs,
    question_ids: input.invented?.questions.map((question) => question.id),
  };
  if (input.inventFail) {
    return { ...base, status: "fail", error: input.inventError ?? "invent-fail" };
  }
  if (input.liveSkip) {
    return { ...base, status: "skipped", skip_reason: input.liveSkip };
  }
  if (!input.systemOne || !input.invented) {
    return { ...base, status: "skipped", skip_reason: "no TypeSafe key" };
  }
  const started = Date.now();
  try {
    const result = await handleRunQuestions(input.invented, {
      config: input.config,
      systemOne: input.systemOne,
    });
    const answers = (result.answers ?? {}) as Record<string, unknown>;
    return {
      ...base,
      status: "ok",
      ms: Date.now() - started,
      gate: gateBlindWindTunnel(answers),
    };
  } catch (err) {
    const friendly = toFriendlyError(err);
    return {
      ...base,
      status: "fail",
      ms: Date.now() - started,
      error: redactText(`${friendly.code}: ${friendly.message}`),
    };
  }
}

async function runStockPackStep(input: {
  packIds: string[];
  liveSkip?: string;
  config: AppConfig;
  systemOne?: SystemOneCall;
}): Promise<DogfoodReport["stock_pack"]> {
  const packId = pickStockPackId(input.packIds);
  if (input.liveSkip) {
    return { pack_id: packId, status: "skipped", ms: 0, skip_reason: input.liveSkip };
  }
  if (!input.systemOne) {
    return { pack_id: packId, status: "skipped", ms: 0, skip_reason: "no TypeSafe key" };
  }
  if (!packId) {
    return { status: "skipped", ms: 0, skip_reason: "no stock pack (computer_use_step / model_router)" };
  }
  const pack = allPacks().find((item) => item.id === packId);
  if (!pack) {
    return { pack_id: packId, status: "fail", ms: 0, error: "pack missing from registry" };
  }
  const started = Date.now();
  try {
    await handleRunPack(
      { pack_id: pack.id, state: pack.example_state },
      { config: input.config, systemOne: input.systemOne },
    );
    return { pack_id: pack.id, status: "ok", ms: Date.now() - started };
  } catch (err) {
    const friendly = toFriendlyError(err);
    return {
      pack_id: pack.id,
      status: "fail",
      ms: Date.now() - started,
      error: redactText(`${friendly.code}: ${friendly.message}`),
    };
  }
}

async function runUrlcheckStep(
  args: DogfoodCliArgs,
  deps: DogfoodDeps,
): Promise<DogfoodReport["urlcheck"]> {
  if (!args.urlcheckBase.trim()) {
    return { status: "skipped", ms: 0, skip_reason: "no --urlcheck-base" };
  }
  const started = Date.now();
  let base: string;
  try {
    base = normalizeBaseUrl(args.urlcheckBase);
  } catch (err) {
    return {
      status: "fail",
      ms: Date.now() - started,
      error: redactText(err instanceof Error ? err.message : String(err)),
    };
  }
  const probe = await probeUrlcheckBase(base, deps);
  if (!probe.up) {
    return {
      status: "skipped",
      ms: Date.now() - started,
      base,
      skip_reason: probe.reason ?? "server not up",
    };
  }
  const cwd = deps.discoverCwd ?? process.cwd();
  const { targets } = urlcheckTargets(cwd);
  try {
    const { summary } = await runUrlCheck({
      base,
      targets,
      concurrency: 4,
      timeoutMs: 2000,
      followRedirects: true,
      maxRedirects: 3,
      judge: false,
      json: false,
      fetchImpl: deps.fetchImpl,
      writeLine: () => undefined,
      writeError: () => undefined,
    });
    if (summary.hard_failures > 0) {
      return {
        status: "fail",
        ms: Date.now() - started,
        base,
        urls: summary.urls,
        hard_failures: summary.hard_failures,
        error: `hard urlcheck fail (${summary.hard_failures})`,
      };
    }
    return {
      status: "ok",
      ms: Date.now() - started,
      base,
      urls: summary.urls,
      hard_failures: summary.hard_failures,
    };
  } catch (err) {
    return {
      status: "fail",
      ms: Date.now() - started,
      base,
      error: redactText(err instanceof Error ? err.message : String(err)),
    };
  }
}
