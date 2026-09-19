---
name: mcp_jev
description: >
  Install, update, and call the local mcp_jev MCP server for TypeSafe Jev
  (System One) packs. Use when MCP tools are missing, or the user mentions
  mcp_jev, Jev, TypeSafe, install/update this MCP, PR audit, intent routing,
  locale/country, Cursor, Claude, Codex, Grok, or Antigravity. If tools are
  absent, run scripts/install.sh from https://github.com/pedroknigge/mcp_jev.
  Always list_packs → describe_pack → run_pack. No ask_jev, no free-form
  questions, no side effects, never paste TYPESAFE_API_KEY into chat.
---

# mcp_jev — run Jev packs, do not chat

**Jev is not an LLM chat model.** TypeSafe System One (flagship: Jev) takes **state + typed questions** and returns **Choice / Noul / Score** answers. This MCP **only runs versioned packs** from the mcp_jev repo. Side effects stay in your code.

**Latest install/config source of truth:** [https://github.com/pedroknigge/mcp_jev](https://github.com/pedroknigge/mcp_jev) (README + `scripts/`). TypeSafe API docs: [https://docs.typesafe.ai/llms.txt](https://docs.typesafe.ai/llms.txt). Host extras: [`references/install.md`](references/install.md).

## If the MCP is missing

Do **not** invent `ask_jev` or pretend Jev ran. Tell the user to install from the GitHub repo:

1. **Skill** (so the next session knows the contract):
   ```bash
   npx skills add pedroknigge/mcp_jev --skill mcp_jev
   # or: cp -R skills/mcp_jev .cursor/skills/mcp_jev   # also .claude/skills
   ```
2. **Server** (happy path):
   ```bash
   git clone https://github.com/pedroknigge/mcp_jev.git ~/mcp_jev
   ~/mcp_jev/scripts/install.sh          # Windows: install.ps1
   ```
   The script builds the server, stores **one** TypeSafe key in `~/.mcp_jev/.env` (chmod 600), and prints a **keyless** MCP JSON snippet.
3. **Host config:** paste that snippet (Cursor `~/.cursor/mcp.json`, Claude Desktop `claude_desktop_config.json`, …). Do not put the key in the JSON.
4. Restart the host. Call **`ping`**, then **`list_packs`**.

Update later: `~/mcp_jev/scripts/update.sh` (preserves the key) → restart host.

### Say this to your agent

> Install and configure mcp_jev from https://github.com/pedroknigge/mcp_jev using the install script and skill.

## When to use mcp_jev

| Need | Use |
| --- | --- |
| MCP tools missing / first-time setup / update | Install script + this skill + GitHub README |
| A judgment that exists as a pack (`pr_audit`, `intent_router`, `locale_country`, or later in-repo ids) | **mcp_jev** tools |
| Designing new TypeSafe questions / SDK code | Official **TypeSafe skill** (`npx skills add typesafe-ai/skills --skill typesafe-ai`) |
| Prose, patches, reasoning | A **plain LLM** (you) |
| Merge, comment, refund, catalogue write | **Your code / other MCPs** after typed answers |

If the user wants a question that is not in a pack, say this server cannot do that. Offer a new in-repo pack (`CONTRIBUTING.md`) or the TypeSafe SDK.

## Key is installed once

Configure the TypeSafe key **once** during MCP install (`install.sh` prompt or `mcp_jev config set-key`). Any agent that attaches this MCP reuses it. Do not embed the key in Cursor/Claude/Codex/Grok entries. `ping.api_key_set` / `api_key_source` (`user_store` \| `env` \| `none`) never include the secret. The store at `~/.mcp_jev/.env` (override: `MCP_JEV_HOME`) wins; process env is fallback only.

## Verify

1. **`ping`** — `ok`, `server: "mcp_jev"`, `packs` ≥ 3. If `api_key_set` is false: tell the user to run `config set-key`. You may still `list_packs` / `describe_pack`. Never invent `run_pack` answers.
2. **`list_packs`** — pick an `id` from the result.
3. Then `describe_pack` / `run_pack`.

## Tool contract

Four tools. No others.

### `ping`

- Args: none
- Returns: `ok`, `server`, `server_version`, `sdk_version`, `packs`, `api_key_set`, `api_key_source`, `user_config_dir`, `model`, `base_url_override`
- Never includes the key. Does not call TypeSafe.

### `list_packs`

- Args: none
- Returns `{ packs: [{ id, version, title, summary, when_to_use }] }`

### `describe_pack`

- Args: `{ pack_id: string }`
- Returns schema, questions, `example_state`, `suggested_workflow`, `notes`
- Unknown id → `unknown_pack`

### `run_pack`

- Args: `{ pack_id: string, state: object }`
- Validates state, calls `TypeSafeClient.systemOne`
- Returns `{ pack_id, pack_version, model, answers, usage }`
- No side effects
- Errors: `missing_api_key`, `invalid_state`, `unknown_pack`, `auth`, `rate_limit`, `timeout`, `connection`, `validation`

Skip `describe_pack` only when you already have that pack's schema in **this** session.

## Pack catalog (in-repo)

Packs live under `src/packs/` in [pedroknigge/mcp_jev](https://github.com/pedroknigge/mcp_jev). New packs are added in-repo. Always `list_packs`.

| id | Jev answers | Caller still does |
| --- | --- | --- |
| `pr_audit` | `merge_risk`; Nouls `money` / `hours` / `hours_money_boundary` / `migration`; Score `blast_radius` | Compute **`code_gate`**. No merge/comment here. |
| `intent_router` | `intent`; Nouls `jailbreak` / `policy_violation`; Score `urgency` | Route / refuse in code. |
| `locale_country` | `country` (AR/US/IN/UY/SA/`unclear`); Noul `explicit_geo_cue`; Score `locale_signal` | Write the catalogue yourself. |

## Required workflow

1. If tools missing → install (above)
2. `list_packs` → `describe_pack` → collect short named state → `run_pack`
3. Compose gates **after** the tool returns

## How to read answers

| Type | Fields | Meaning |
| --- | --- | --- |
| Choice | `choice`, `probabilities`, `confidence` | Selected label; how peaked |
| Score | `score`, `legend`, `probabilities`, `confidence` | Position on your rubric |
| Noul | `noul` | P(yes) in 0–1. **No** separate `confidence` |

Noul ≈ 0.5 is uncertainty. Low Choice/Score `confidence` → escalate.

Real JS: `client.systemOne({ state, questions, model? })` with `choice`, `noul`, `score`. Default model `jev-latest`.

## Anti-patterns (never)

- Assume the MCP is already installed
- Invent `ask_jev` or free-form questions
- Put `TYPESAFE_API_KEY` in chat, commits, or every host `env` block
- Ask Jev for `code_gate` on `pr_audit`
- Retry `invalid_state` by guessing fields
- Call `run_pack` when `api_key_set` is false

## Env

| Variable | Role |
| --- | --- |
| `TYPESAFE_API_KEY` | For `run_pack`. Prefer `~/.mcp_jev/.env` |
| `MCP_JEV_HOME` | User config dir (default `~/.mcp_jev`) — key + wrapper |
| `MCP_JEV_CONFIG` | Alias for `MCP_JEV_HOME` |
| `MCP_JEV_CHECKOUT` | Git checkout (default `~/mcp_jev`) |
| `TYPESAFE_BASE_URL` / `JEV_MODEL` / `TYPESAFE_DEFAULT_MODEL` | Optional |

The user store wins; process env is fallback only. Repo `.env` is not auto-loaded.
