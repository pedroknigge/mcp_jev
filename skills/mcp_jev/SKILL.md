---
name: mcp_jev
description: >
  Install, update, and call the local mcp_jev MCP server for TypeSafe Jev
  (System One) packs. Use when MCP tools are missing, or the user mentions
  mcp_jev, Jev, TypeSafe, install/update this MCP, doctor, PR audit, review
  diff, code audit, file audit, intent routing, locale/country, computer-use /
  GUI / browser / mobile harness, model router, Cursor, Claude, Codex, Grok, or
  Antigravity. If tools
  are absent, run scripts/install.sh from https://github.com/pedroknigge/mcp_jev.
  Always list_packs → describe_pack → run_pack. No ask_jev, no free-form
  questions, no side effects, never paste TYPESAFE_API_KEY into chat.
---

# mcp_jev — run Jev packs, do not chat

**Jev is not an LLM chat model.** TypeSafe System One (flagship: Jev) takes **state + typed questions** and returns **Choice / Noul / Score** answers. This MCP **only runs versioned packs** from the mcp_jev repo. Side effects stay in your code. mcp_jev is the judgment layer: fast typed decisions for agents and harnesses.

**Latest install/config source of truth:** [https://github.com/pedroknigge/mcp_jev](https://github.com/pedroknigge/mcp_jev) (README + `scripts/`). TypeSafe API docs: [https://docs.typesafe.ai/llms.txt](https://docs.typesafe.ai/llms.txt). Host extras: [`references/install.md`](references/install.md).

## First-run script

Do this in order. Do not skip `doctor`.

```bash
# 1) Install (key once in ~/.mcp_jev/.env; host command stays keyless)
git clone https://github.com/pedroknigge/mcp_jev.git ~/mcp_jev
~/mcp_jev/scripts/install.sh          # Windows: install.ps1
# Non-interactive without a key exits non-zero and writes ~/.mcp_jev/NOT_READY.

# 2) Doctor — checkout, dist, wrapper, api_key_set (boolean only), host files
mcp_jev doctor
# or: node ~/mcp_jev/dist/index.js doctor --json

# 3) Optional stdio smoke (no TypeSafe call)
~/mcp_jev/scripts/verify-mcp.sh

# 4) On the MCP host after restart:
#    ping → list_packs → describe_pack → run_pack
```

If `doctor` is not ready: `mcp_jev config set-key`, then doctor again. Never paste the key into chat or host JSON.

## If the MCP is missing

Do **not** invent `ask_jev` or pretend Jev ran. Tell the user to install from the GitHub repo (first-run script above).

1. **Skill** (so the next session knows the contract):
   ```bash
   npx skills add pedroknigge/mcp_jev --skill mcp_jev
   # or: cp -R skills/mcp_jev .cursor/skills/mcp_jev   # also .claude/skills
   ```
2. **Server:** `scripts/install.sh` stores **one** TypeSafe key in `~/.mcp_jev/.env` (chmod 600) and prints **keyless** snippets.
3. **Host config:** paste or `mcp_jev hosts write all`. Command = `~/.mcp_jev/bin/mcp_jev`.
4. Restart the host. Call **`ping`**, then **`list_packs`**.

Update later: `~/mcp_jev/scripts/update.sh` (preserves the key) → restart host.

### Say this to your agent

> Install and configure mcp_jev from https://github.com/pedroknigge/mcp_jev using the install script and skill. Then run doctor, ping, and list_packs.

## When to use mcp_jev

| Need | Use |
| --- | --- |
| MCP tools missing / first-time setup / update | Install script + `doctor` + this skill + GitHub README |
| A judgment that exists as a pack (`pr_audit`, `review_diff`, `code_audit`, `intent_router`, `locale_country`, `computer_use_step`, `model_router`, or later in-repo ids) | **mcp_jev** tools |
| Next GUI / browser / mobile action from a structured catalog | **`computer_use_step`** — recipe below |
| Which model / tool lane this turn | **`model_router`** — recipe below |
| Generic diff review (correctness/security/reliability/compat/test_gap) | **`review_diff`** — recipe below |
| Per-file / full-repo structured audit (layering / blast-radius / verification) | **`code_audit`** — recipe below |
| Closed skill list → load one or none | **`skill_router`** |
| Proposed shell command risk signals | **`command_risk`** — allowlist still required |
| Designing new TypeSafe questions / SDK code | Official **TypeSafe skill** (`npx skills add typesafe-ai/skills --skill typesafe-ai`) |
| Prose, patches, reasoning, typed-in text | A **plain LLM** (you) |
| Merge, comment, refund, catalogue write, clicks | **Your code / other MCPs** after typed answers |

### Which pack

| Situation | Pack | Not this |
| --- | --- | --- |
| Structured screen state (OCR / AX / DOM ids) → one next click/type/scroll/wait/done | `computer_use_step` | Do not send screenshots. Do not use `intent_router` (utterances) or `model_router` (compute lanes). |
| Start of an agent turn: cheap local vs strong reasoner vs tool loop vs ask the user vs skip | `model_router` | Do not use it to drive the GUI or to classify a chat intent. |
| Incoming user message → FAQ / action / handoff / refuse | `intent_router` | Not a screen catalog. Not a PR. |
| Generic diff: risk Nouls → hotspot file from `files[]` → severity | `review_diff` | Orchestration stays in the caller. Not `pr_audit` (money/hours/migration). |
| Per-file or full-repo scan: closed per-file state → typed ratings | `code_audit` | Do not dump the monorepo. Fan out `run_pack`. Not `review_diff` (a short diff). |
| Pull request merge risk (money / hours / migration) | `pr_audit` | Jev does not write the review or compute `code_gate`. |
| Catalogue SKU → one of five countries | `locale_country` | Not a geocoder for people or addresses. |
| Closed skill names → load one or none | `skill_router` | Not a model lane. Not a GUI step. |
| Proposed shell command → risk signals | `command_risk` | Not an allowlist. Sandbox still required. |

If the user wants a question that is not in a pack, say this server cannot do that. Offer a new in-repo pack (`CONTRIBUTING.md`) or the TypeSafe SDK.

## Recipe: `computer_use_step`

Harness contract (enforced):

1. Observe in **code** (OCR, accessibility tree, or DOM). Build an **indexed closed catalog** `items[]` / `offscreen_items[]` with stable ids and `role` / `name` / `value` / `state` / `label`. Never put screenshots, pixels, or image blobs in state.
2. One `systemOne` fan-out: Choice `operation` plus a separate target Choice per op (`click_target`, `type_target`, `offscreen_target`). Each target question **assumes** its operation (independent). Use ONLY `guidance.target_for[operation]` / `effective_targets`. Ignore the other heads.
3. For `type_text` / `type_email`, a **writer LLM** (or stored value) supplies the string. Jev never invents it (`guidance.writer_owns_typed_string`).
4. `max_steps` and `max_candidates` are harness stop rules, not MCP side effects. Example thresholds: stop if `goal_achieved.noul ≥ 0.8` or `operation` is `done`; re-observe if `observation_stale.noul ≥ 0.65` or `step_confidence.score < 1.5`.

## Recipe: `model_router`

Closed lanes — do not invent a sixth:

| Lane | Meaning |
| --- | --- |
| `fast_local` | Cheap/local or no model: lookup, format, one obvious tool |
| `strong_reasoner` | Ambiguous design, hard failure, plan not yet mechanical |
| `tools_heavy` | Long tool / browser / shell loop |
| `ask_user` | Missing preference, secret, or confirmation |
| `skip` | Already done, blocked, or out of scope |

Example thresholds (caller-owned): `route.confidence < 0.45` → treat as `ask_user`; `unsafe_or_irreversible.noul ≥ 0.70` → refuse or confirm; `simple_lookup.noul ≥ 0.75` and `difficulty.score < 1.5` → force `fast_local`.

## Recipe: `review_diff`

1. Collect a short `diff_summary` and closed `files[]` in code. No mega-diff.
2. `run_pack` `review_diff`.
3. Read Nouls `correctness` / `security` / `reliability` / `compat` / `test_gap`, then `hotspot_file.choice` (only from `files[]`), then `severity.score`.
4. Compose the gate and any comment **in the caller**. Example: request review if any Noul ≥ 0.65; block if `security.noul ≥ 0.75` or `severity.score ≥ 2.5`.

`pr_audit` is the separate money/hours/migration merge pack. Keep both ids.

## Recipe: `code_audit`

Full-repo scan = harness lists all files → filter screenshots/binaries/generated vendor dirs → truncate excerpts (caller-owned, e.g. ≤4k chars) → parallel `run_pack` `code_audit` → aggregate top `problem_severity` / most frequent Nouls. **Do not send the monorepo as prose.**

Mode A (preferred): one file per call.

```json
{
  "path": "src/billing/invoice-total.ts",
  "language": "ts",
  "role_hint": "domain",
  "excerpt": "export function invoiceTotal(lines) { return lines.reduce((s, l) => s + l.price * l.qty, 0); }",
  "signals": { "loc": 12, "has_tests_nearby": false, "touches_money": true, "is_generated": false },
  "repo_context": "Billing module: invoice line totals."
}
```

Read Nouls `wrong_layer` / `blast_radius` / `missing_verification` / `secret_or_credential_risk` / `inefficiency` / `dead_or_premature_abstraction`, Scores `problem_severity` + `change_cost`, Choice `primary_concern` (`none` | `layering` | `blast_radius` | `verification` | `security` | `performance` | `abstraction` | `other`).

Optional Mode B: `files[]` paths + short `batch_notes` (no bodies) → Choice `hotspot_file`. If `path` is set, Mode A wins.

Example gate: `gateCodeAudit` in `src/policy-examples.ts` → `ok` | `glance` | `deep_review`. Unit-test without a TypeSafe key.

## Recipe: code-owned policy (`skill_router`, `command_risk`, `model_router`, `code_audit`)

Jev returns signals. **Your functions** decide. Unit-test those functions without a TypeSafe key (`src/policy-examples.ts`).

`skill_router`: Noul `needs_skill` + Choice `skill` from closed `available_skills[]` + Score `change_risk`. Load the skill in the host.

`command_risk`: Nouls `is_destructive` / `touches_credentials` / `scope_matches` + Score `severity`. **Signals only.** Your allowlist and sandbox still run.

`model_router`: model cascade — map `route.choice` to models/tools in code.

`code_audit`: Nouls + severity → `gateCodeAudit` → `ok` | `glance` | `deep_review`. Aggregate across files in the harness.

Example (copy into the harness): refuse a command if `is_destructive.noul ≥ 0.70` or `scope_matches.noul < 0.50`. Jev does not execute.

## Multi-host

Keyless `command` is always `~/.mcp_jev/bin/mcp_jev` (Windows: `mcp_jev.cmd`).

| Host | Config | Format |
| --- | --- | --- |
| Cursor | `~/.cursor/mcp.json` or `.cursor/mcp.json` | JSON `mcpServers` |
| Claude Desktop | `claude_desktop_config.json` (OS paths in `references/install.md`) | JSON |
| Claude Code | `claude mcp add …` or `~/.claude.json` | JSON |
| Codex | `~/.codex/config.toml` | TOML `[mcp_servers.mcp_jev]` |
| Grok | `~/.grok/config.toml` | TOML |
| Antigravity | `~/.gemini/config/mcp_config.json` or `.agents/mcp_config.json` | JSON |

`mcp_jev hosts print` · `mcp_jev hosts write all` · `MCP_JEV_WRITE_HOSTS=all ./scripts/install.sh`. `doctor` reports whether those files exist and whether `mcp_jev` is registered (informational).

## Key is installed once

Configure the TypeSafe key **once** during MCP install (`install.sh` prompt or `mcp_jev config set-key`). Any agent that attaches this MCP reuses it. Do not embed the key in Cursor/Claude/Codex/Grok entries. `ping.api_key_set` / `api_key_source` (`user_store` \| `env` \| `none`) never include the secret. The store at `~/.mcp_jev/.env` (override: `MCP_JEV_HOME`) wins; process env is fallback only.

## Verify

1. **`mcp_jev doctor`** — checkout, dist, wrapper, key boolean, `NOT_READY` absent.
2. **`ping`** — `ok`, `server: "mcp_jev"`, `packs` ≥ 9. If `api_key_set` is false: tell the user to run `config set-key`. You may still `list_packs` / `describe_pack`. Never invent `run_pack` answers.
3. **`list_packs`** — pick an `id` from the result.
4. Then `describe_pack` / `run_pack`.

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
- Returns `{ pack_id, pack_version, model, answers, usage }` (plus additive `guidance` on `computer_use_step`)
- No side effects
- Errors: `missing_api_key`, `invalid_state` (may include structured `details.missing`), `unknown_pack`, `auth`, `rate_limit`, `timeout`, `connection`, `validation`

Skip `describe_pack` only when you already have that pack's schema in **this** session.

## Pack catalog (in-repo)

Packs live under `src/packs/` in [pedroknigge/mcp_jev](https://github.com/pedroknigge/mcp_jev). New packs are added in-repo. Always `list_packs`.

| id | Jev answers | Caller still does |
| --- | --- | --- |
| `pr_audit` | `merge_risk`; Nouls `money` / `hours` / `hours_money_boundary` / `migration`; Score `blast_radius` | Staged review: risk Nouls → file Choice over `files[]` → severity. Compute **`code_gate`**. No merge/comment here. |
| `review_diff` | Nouls `correctness` / `security` / `reliability` / `compat` / `test_gap`; Choice `hotspot_file`; Score `severity` | Gate and comments in caller code. |
| `code_audit` | Nouls layering / blast-radius / verification / secrets / inefficiency / abstraction; Scores `problem_severity` + `change_cost`; Choice `primary_concern` | Fan out one file per `run_pack`. Aggregate + `gateCodeAudit` in code. Optional Mode B `hotspot_file`. |
| `skill_router` | `needs_skill`; `skill` from `available_skills[]`; Score `change_risk` | Load the skill in the host. |
| `command_risk` | `is_destructive` / `touches_credentials` / `scope_matches`; Score `severity` | Allowlist/sandbox still required. |
| `intent_router` | `intent`; Nouls `jailbreak` / `policy_violation`; Score `urgency` | Route / refuse in code. |
| `locale_country` | `country` (AR/US/IN/UY/SA/`unclear`); Noul `explicit_geo_cue`; Score `locale_signal` | Write the catalogue yourself. |
| `computer_use_step` | `operation`; targets from your item ids; Nouls `goal_achieved` / `observation_stale`; Score `step_confidence`; `guidance` | Observe, click/type/scroll, writer LLM for text, stop. No screenshots in state. |
| `model_router` | `route`; Nouls `needs_code_edit` / `needs_browser` / `unsafe_or_irreversible` / `simple_lookup`; Score `difficulty` | Map the lane. Thresholds in your code. |

## Required workflow

1. If tools missing → install + `doctor` (above)
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
- Treat non-interactive install without a key as success (`NOT_READY` / doctor must fail)
- Ask Jev for `code_gate` on `pr_audit` or `review_diff`
- Dump a whole monorepo into `code_audit` state (fan out truncated per-file excerpts instead)
- Put screenshots, binaries, or generated vendor trees in `code_audit` state
- Put screenshots or image blobs in `computer_use_step` state
- Act on speculative targets that do not match `operation`
- Invent item ids or file paths that were not in the closed catalog
- Retry `invalid_state` by guessing fields
- Call `run_pack` when `api_key_set` is false

## Env

| Variable | Role |
| --- | --- |
| `TYPESAFE_API_KEY` | For `run_pack`. Prefer `~/.mcp_jev/.env` |
| `MCP_JEV_HOME` | User config dir (default `~/.mcp_jev`) — key + wrapper |
| `MCP_JEV_CONFIG` | Alias for `MCP_JEV_HOME` |
| `MCP_JEV_CHECKOUT` | Git checkout (default `~/mcp_jev`) |
| `MCP_JEV_WRITE_HOSTS` | Optional install-time host write |
| `TYPESAFE_BASE_URL` / `JEV_MODEL` / `TYPESAFE_DEFAULT_MODEL` | Optional |

The user store wins; process env is fallback only. Repo `.env` is not auto-loaded.
