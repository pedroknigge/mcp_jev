---
name: mcp_jev
description: >
  Install and call the local mcp_jev MCP server to run TypeSafe Jev (System One)
  judgment packs. Use when the user mentions mcp_jev, Jev, TypeSafe System One,
  typed Choice / Noul / Score packs, PR audit, intent routing, locale/country
  classification, or installing this MCP in Cursor, Claude Code, Claude Desktop,
  Codex, Grok, Antigravity, Windsurf, Cline, Continue, or Zed. Always
  list_packs → describe_pack → run_pack. Do not use for free-form questions,
  ask_jev, generated reviews, or side effects (merge, comment, refund).
---

# mcp_jev — run Jev packs, do not chat

**Jev is not an LLM chat model.** TypeSafe System One (flagship model: Jev) takes **state + typed questions** and returns **Choice / Noul / Score** answers with probabilities (and confidence on Choice/Score). There is nothing to parse. This MCP **only runs versioned packs that live in the mcp_jev repo**. Side effects — merge gates, comments, refunds, DB writes — stay in your code or other tools.

Live TypeSafe docs (API source of truth): [https://docs.typesafe.ai/llms.txt](https://docs.typesafe.ai/llms.txt)

Repo + this skill are the source of truth for **install and tool use**. Human README: repository `README.md` → section **Install for agents & IDEs**. Host-by-host deep dive: `docs/INSTALL_AGENTS.md`. Copy-paste host stanzas: [`references/install.md`](references/install.md).

## When to use mcp_jev

| Need | Use |
| --- | --- |
| A judgment that already exists as a pack (`pr_audit`, `intent_router`, `locale_country`, or any later in-repo id) | **mcp_jev** tools |
| Installing / wiring the server in an IDE or CLI agent | This skill + README install section |
| Designing new TypeSafe questions, writing `@typesafe-ai/sdk` / `typesafe-sdk` code | Official **TypeSafe skill** (`npx skills add typesafe-ai/skills --skill typesafe-ai`) |
| Prose, explanations, patches, multi-step reasoning | A **plain LLM** (you) |
| Merge block, GitHub comment, catalogue write, refund | **Your code / other MCPs** after reading typed answers |

If the user wants a question that is not in a pack, do **not** invent an `ask_jev` call. Say this server cannot do that. Offer to add a pack (`CONTRIBUTING.md`) or use the TypeSafe skill + SDK directly.

## Install (any host)

You need **Node 20+**, a clone or npx launch of **this repo**, and a TypeSafe key from [https://console.typesafe.ai](https://console.typesafe.ai) for `run_pack` only.

```bash
export REPO_PATH="$HOME/src/mcp_jev"
# Example only: /Users/pedroknigge/Desktop/mcp_jev
git clone https://github.com/pedroknigge/mcp_jev.git "$REPO_PATH"
cd "$REPO_PATH"
npm install && npm run build && npm test
```

`npm test` must pass **without** a live key. The server **does not load `.env`**. Put `TYPESAFE_API_KEY` in the MCP host **`env` block**.

Register a **stdio** server named `mcp_jev`:

- Preferred: `command: node`, `args: ["$REPO_PATH/dist/index.js"]` (absolute path)
- No clone: `npx -y github:pedroknigge/mcp_jev` (first start is slow)
- After npm publish: `npx -y mcp_jev` — **not published yet**; do not expect the registry name to resolve today

Package / bin name is `mcp_jev` → `dist/index.js`. This is **not** an HTTP server.

Host files (details in `references/install.md`):

| Host | Config |
| --- | --- |
| Cursor | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (user) |
| Claude Desktop | `claude_desktop_config.json` (macOS `~/Library/Application Support/Claude/`, Linux `~/.config/Claude/`, Windows `%APPDATA%\Claude\`) |
| Claude Code | `claude mcp add --scope user --env TYPESAFE_API_KEY=… --transport stdio mcp_jev -- node $REPO_PATH/dist/index.js` |
| Codex | `~/.codex/config.toml` table `[mcp_servers.mcp_jev]` or `codex mcp add` |
| Grok / xAI | `~/.grok/config.toml` `[mcp_servers.mcp_jev]` or `grok mcp add` |
| Antigravity | `~/.gemini/config/mcp_config.json` or `.agents/mcp_config.json` |
| Windsurf / Cline / Continue / Zed | See `references/install.md` (Zed uses `context_servers`) |

Restart the host after editing. Copy this folder into the host skills dir (`.cursor/skills/mcp_jev`, `.claude/skills/mcp_jev`, …) or `npx skills add pedroknigge/mcp_jev --skill mcp_jev`.

## Verify before judging

1. Call **`ping`**. Expect `ok`, `server: "mcp_jev"`, a `packs` count ≥ 3. If `api_key_set` is `false`, you may list/describe but **must not** call `run_pack` or invent answers. Tell the human to set `TYPESAFE_API_KEY` on the MCP process.
2. Call **`list_packs`**. Pick an `id` from the returned catalog — never from memory if the list differs.
3. Only then `describe_pack` / `run_pack`.

## Tool contract

Four tools. No others. Names are exact.

### `ping`

- Args: none
- Returns JSON: `ok`, `server`, `server_version`, `sdk_version`, `packs`, `api_key_set` (boolean), `model`, `base_url_override`
- Never includes the key. Does not call TypeSafe.

### `list_packs`

- Args: none
- Returns `{ packs: [{ id, version, title, summary, when_to_use }] }`
- Closed catalog. Does not call TypeSafe.

### `describe_pack`

- Args: `{ pack_id: string }` (from `list_packs`)
- Returns `id`, `version`, `title`, `summary`, `when_to_use`, `state_schema` (JSON Schema), `questions` (Choice / Noul / Score defs), `example_state`, `suggested_workflow`, `notes`
- Unknown id → error `unknown_pack`. Does not call TypeSafe.

### `run_pack`

- Args: `{ pack_id: string, state: object }`
- Validates `state` against that pack's schema (`additionalProperties: false` on starter packs)
- Calls `TypeSafeClient.systemOne({ state, questions, model })` via `@typesafe-ai/sdk`
- Returns `{ pack_id, pack_version, model, answers, usage }`
- Does **not** merge PRs, post comments, write DBs, or route messages
- Errors (do not retry-guess): `missing_api_key`, `invalid_state`, `unknown_pack`, `auth`, `rate_limit`, `timeout`, `connection`, `validation`

Skip `describe_pack` only when you already have that pack's schema from earlier in the **same** session.

## Pack catalog (in-repo)

Packs are TypeScript under `src/packs/`, registered in `src/packs/registry.ts`. **New packs land in this repo** — they are not downloaded from TypeSafe. Always `list_packs` for the live set.

| id | Jev answers | Caller still does |
| --- | --- | --- |
| `pr_audit` | Choice `merge_risk` (`safe_ui` \| `needs_review` \| `block`); Nouls `money`, `hours`, `hours_money_boundary`, `migration`; Score `blast_radius` | Compute **`code_gate`**. Do not merge or comment via this MCP. |
| `intent_router` | Choice `intent` (`faq` \| `action` \| `handoff` \| `smalltalk` \| `other`); Nouls `jailbreak`, `policy_violation`; Score `urgency` | Route / refuse / hand off in code. Do not generate the user reply here. |
| `locale_country` | Choice `country` (Argentina / USA / India / Uruguay / Saudi Arabia / `unclear`); Noul `explicit_geo_cue`; Score `locale_signal` | Write the country to the catalogue yourself. Not a geocoder. |

## Required workflow

1. `list_packs` — pick an `id`
2. `describe_pack` — read schema, questions, `example_state`, `suggested_workflow`, `notes`
3. Collect state **in code** (short named fields). Do not dump huge diffs or secrets
4. `run_pack` `{ pack_id, state }`
5. Compose gates and side effects **after** the tool returns

## How to read answers

From TypeSafe docs (verify on docs.typesafe.ai if anything looks stale):

| Type | Fields | Meaning |
| --- | --- | --- |
| Choice | `choice`, `probabilities`, `confidence` | Selected label; distribution; how peaked |
| Score | `score`, `legend`, `probabilities`, `confidence` | Position on your rubric (may be between levels) |
| Noul | `noul` | Probability of yes (0–1). **No** separate `confidence` |

A Noul near `0.5` is uncertainty, not “medium intensity”. Low Choice/Score `confidence` means a spread distribution — escalate instead of acting.

Real JS call (do not invent endpoints): `client.systemOne({ state, questions, model? })` with helpers `choice`, `noul`, `score`. Env: `TYPESAFE_API_KEY`. Default model: `jev-latest`.

## Anti-patterns (never)

- Invent a tool named `ask_jev` or send free-form questions
- Invent TypeSafe URLs or answer fields
- Treat Jev output as chat / a review comment
- Ask Jev for `code_gate` on `pr_audit` — the caller computes the gate
- Put `TYPESAFE_API_KEY` in a prompt, log, commit, or tool argument
- Retry `invalid_state` by guessing extra fields — re-read `describe_pack`
- Wrap the server so it prints to **stdout** (breaks stdio MCP)
- Call `run_pack` when `ping.api_key_set` is `false`

## Env / security

| Variable | Required | Default |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | For `run_pack` | — |
| `TYPESAFE_BASE_URL` | No | SDK `https://api.typesafe.ai` |
| `JEV_MODEL` | No | `jev-latest` |
| `TYPESAFE_DEFAULT_MODEL` | No | Used if `JEV_MODEL` unset |

Key stays in the host process env. `ping` never echoes it. Run locally; do not proxy this binary on the public internet.
