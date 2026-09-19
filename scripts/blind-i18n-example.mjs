#!/usr/bin/env node
/**
 * Blind i18n via run_questions-shaped systemOne (closed candidates).
 * Default: mocked TypeSafe (CI). --live hits TypeSafeClient.systemOne.
 *
 *   node --import tsx scripts/blind-i18n-example.mjs
 *   node --import tsx scripts/blind-i18n-example.mjs --live
 *
 * --live is skipped in CI unless TYPESAFE_API_KEY is set and SMOKE_LIVE=1.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const ROOT = process.env.MCP_JEV_CHECKOUT && existsSync(join(process.env.MCP_JEV_CHECKOUT, "package.json"))
  ? process.env.MCP_JEV_CHECKOUT
  : join(SCRIPT_DIR, "..");

const MOCK_KEY = "mcp-jev-blind-i18n-mock";

/** Invented first (blind): same closed catalog as i18n_copy, plus extra Noul needs_locale_split. */
export const BLIND_I18N_BODY = {
  state: {
    path: "src/components/LoginForm.tsx",
    language: "tsx",
    framework_i18n: "next-intl",
    uses_i18n_api: false,
    locale_files_present: true,
    candidates: [
      { id: "login_heading", text: "Login", kind: "jsx_text", line: 12 },
      { id: "submit_btn", text: "Submit", kind: "jsx_attr", line: 40 },
      { id: "load_error", text: "Error loading", kind: "toast", line: 55 },
    ],
  },
  questions: [
    {
      id: "has_user_facing_hardcoded_copy",
      type: "noul",
      instructions:
        "Given `path`, `candidates`, and `uses_i18n_api`, does this file contain user-facing hardcoded copy that is not already going through an i18n API?",
      criteria: {
        true: "At least one candidate is user-visible copy that would ship in one language.",
        false: "Candidates are identifiers, logs, tests, or already passed through t() / useTranslations.",
      },
    },
    {
      id: "should_migrate_to_i18n",
      type: "noul",
      instructions:
        "Should the caller extract the user-facing strings in `candidates` into the project's i18n layer before a multi-locale ship?",
      criteria: {
        true: "Hardcoded user-facing copy should move to locale files / t() before shipping more locales.",
        false: "No migration needed: already i18n, copy is dev-only, or a multi-locale ship is not indicated.",
      },
    },
    {
      id: "i18n_debt",
      type: "score",
      instructions:
        "How much i18n debt does this file add to a multi-locale ship, given `candidates` and `uses_i18n_api`?",
      criteria: [
        "Clean: no user-facing hardcoded copy.",
        "Local leftover: a few strings, easy extract.",
        "Cross-cutting: many strings or mixed buckets; needs a focused pass.",
        "Blocking for a multi-locale ship: user-facing copy would ship untranslated.",
      ],
    },
    {
      id: "hottest_candidate",
      type: "choice",
      instructions: "Which `candidates[].id` is the hottest string to extract first? Options are only those ids plus `none`.",
      criteria: {
        login_heading: "kind=jsx_text; text=Login; line=12",
        submit_btn: "kind=jsx_attr; text=Submit; line=40",
        load_error: "kind=toast; text=Error loading; line=55",
        none: "No single candidate stands out to extract first.",
      },
    },
    {
      id: "needs_locale_split",
      type: "noul",
      instructions:
        "Should labels and toasts in `candidates` land in different locale namespaces (UI strings vs errors) rather than one dump?",
      criteria: {
        true: "UI labels and error/toast copy should split across locale files or namespaces.",
        false: "One locale namespace is enough, or there is no user-facing copy.",
      },
    },
  ],
};

function hasFlag(name) {
  return process.argv.includes(name);
}

function isCi() {
  const ci = process.env.CI;
  return ci === "true" || ci === "1" || process.env.GITHUB_ACTIONS === "true";
}

function parseDotEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function userConfigDir() {
  return (
    process.env.MCP_JEV_HOME?.trim() ||
    process.env.MCP_JEV_CONFIG?.trim() ||
    join(process.env.HOME || process.env.USERPROFILE || "", ".mcp_jev")
  );
}

function resolveLiveKey() {
  const fromEnv = process.env.TYPESAFE_API_KEY?.trim();
  if (fromEnv) {
    return { set: true, source: "env" };
  }
  const file = join(userConfigDir(), ".env");
  if (!existsSync(file)) {
    return { set: false, source: "none" };
  }
  const parsed = parseDotEnv(readFileSync(file, "utf8"));
  if (parsed.TYPESAFE_API_KEY?.trim()) {
    return { set: true, source: "user_store" };
  }
  return { set: false, source: "none" };
}

function shouldSkipLive() {
  if (!isCi()) {
    return false;
  }
  const hasKey = Boolean(process.env.TYPESAFE_API_KEY?.trim());
  return !(hasKey && process.env.SMOKE_LIVE === "1");
}

function printHelp() {
  console.log(`blind-i18n-example — run_questions-shaped i18n via systemOne

Usage:
  node --import tsx scripts/blind-i18n-example.mjs           mocked TypeSafe (default)
  node --import tsx scripts/blind-i18n-example.mjs --live    TypeSafeClient.systemOne

--live is skipped in CI unless TYPESAFE_API_KEY is set and SMOKE_LIVE=1.
`);
}

function firstChoice(criteria) {
  if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
    const keys = Object.keys(criteria);
    if (keys.length > 0) {
      return keys[0];
    }
  }
  return "unknown";
}

function mockSystemOne(input) {
  const answers = {};
  for (const [id, question] of Object.entries(input.questions ?? {})) {
    if (!question || typeof question !== "object") {
      continue;
    }
    if (question.type === "choice") {
      const choice = firstChoice(question.criteria);
      answers[id] = {
        type: "choice",
        choice,
        confidence: 0.7,
        probabilities: { [choice]: 0.7 },
      };
    } else if (question.type === "noul") {
      answers[id] = { type: "noul", noul: 0.81 };
    } else if (question.type === "score") {
      answers[id] = {
        type: "score",
        score: 2,
        confidence: 0.6,
        legend: { 0: "clean", 1: "leftover", 2: "cross", 3: "blocking" },
        probabilities: { 2: 0.6 },
      };
    }
  }
  return {
    model: input.model ?? "jev-latest",
    answers,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

function redact(text) {
  return String(text)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[redacted]")
    .replace(MOCK_KEY, "mock-key");
}

async function loadAppModules() {
  const useSrc =
    process.execArgv.some((arg) => String(arg).includes("tsx")) && existsSync(join(ROOT, "src", "handlers.ts"));
  const base = pathToFileURL(useSrc ? join(ROOT, "src") : join(ROOT, "dist")).href;
  const [handlersMod, configMod, typesafeMod] = await Promise.all([
    import(`${base}/handlers.js`),
    import(`${base}/config.js`),
    import(`${base}/typesafe.js`),
  ]);
  return {
    handleRunQuestions: handlersMod.handleRunQuestions,
    loadConfig: configMod.loadConfig,
    createSystemOne: typesafeMod.createSystemOne,
  };
}

async function runExample() {
  const live = hasFlag("--live");
  if (live && shouldSkipLive()) {
    console.log("blind-i18n-example: skip --live in CI (set TYPESAFE_API_KEY and SMOKE_LIVE=1)");
    return 0;
  }

  const { handleRunQuestions, loadConfig, createSystemOne } = await loadAppModules();

  let config;
  let systemOne;
  if (live) {
    const key = resolveLiveKey();
    if (!key.set) {
      console.error(
        "blind-i18n-example --live: no TypeSafe key (set TYPESAFE_API_KEY or run mcp_jev config set-key)",
      );
      return 1;
    }
    config = loadConfig(process.env);
    systemOne = createSystemOne(config);
  } else {
    config = loadConfig({ TYPESAFE_API_KEY: MOCK_KEY, JEV_MODEL: "jev-latest" }, { readUserStore: false });
    systemOne = async (input) => mockSystemOne(input);
  }

  const started = Date.now();
  const result = await handleRunQuestions(BLIND_I18N_BODY, { config, systemOne });
  const ms = Date.now() - started;

  if (result.pack_id) {
    throw new Error("expected run_questions (no pack_id)");
  }
  const answers = result.answers ?? {};
  for (const id of BLIND_I18N_BODY.questions.map((question) => question.id)) {
    if (!answers[id]) {
      throw new Error(`missing answer ${id}`);
    }
  }

  console.log(`blind-i18n-example: ${live ? "live" : "mocked"}  ms=${ms}  model=${result.model}`);
  console.log(`tool=run_questions  pack_id=${result.pack_id ?? "none"}  extra_head=needs_locale_split`);
  console.log(JSON.stringify({ answers: result.answers, usage: result.usage }, null, 2));
  return 0;
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printHelp();
    return;
  }
  process.exitCode = await runExample();
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  try {
    await main();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`blind-i18n-example: ${redact(message)}`);
    process.exitCode = 1;
  }
}
