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

**Latest install/config source of truth:** [https://github.com/pedroknigge/mcp_jev](https://github.com/pedroknigge/mcp_jev) (README + `scripts/`). TypeSafe API docs: [https://docs.typesafe.ai/llms.txt](https://docs.typesafe.ai/llms.txt). Host extras: [`references/install.md`](references/install.md). **Exact pack ids, state fields, and question ids:** [`references/pack-catalog.md`](references/pack-catalog.md) (generated from `src/packs/`; `npm test` fails if it drifts).

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

Update later: `~/mcp_jev/scripts/update.sh` (preserves the key) → **reload this skill** → restart host.

### After `update.sh` — reload this skill

Pull updates `skills/mcp_jev` in the checkout. **Hosts do not auto-reload skills.** Re-load from the checkout or re-add:

```bash
npx skills add pedroknigge/mcp_jev --skill mcp_jev
# or copy (only into a project you mean to update — do not write into random trees):
cp -R "$REPO_HOME/skills/mcp_jev" .cursor/skills/mcp_jev   # also .claude/skills
```

Optional: `MCP_JEV_SYNC_SKILL=1 ./scripts/update.sh` copies into `$REPO_HOME/.cursor/skills/mcp_jev` or `~/.cursor/skills/mcp_jev` **only if that `.cursor/skills` directory already exists**.

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
| Per-file / full-repo / architecture / "try Jev on these files" | **`mcp_jev scan`** / **`code_audit`** Pass 1 (signals-first) — Full repo scan recipe. Not `pr_audit`. |
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
| Repo tree / architecture / "try or audit Jev on these files" | `code_audit` via `mcp_jev scan` | Pass 1 signals-only (~RTT, N workers). **`pr_audit` is not the only file-list pack.** |
| PR-shaped merge risk only: `title` / `body` / `files` / `diff_summary` / optional `flags` | `pr_audit` | Not a tree scan. Jev does not write the review or compute `code_gate`. |
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

## Recipe: `pr_audit`

**Only for a PR-shaped merge.** Required state: `title`, `body`, `files`, `diff_summary`. Optional `flags.touches_money` / `touches_hours` / `migration`. If the user says try/audit Jev on a repo tree, architecture, or file list, use **`code_audit`** — do not reach for `pr_audit` just because you have paths.

1. `title` / `body` / `diff_summary` describe **the change**, not the experiment. Never put "testing Jev", "dogfood", or "try audit" narrative in those fields.
2. Keep `files[]` to the actual PR set. A ~40-path "no signal" dump inflates `merge_risk` toward `needs_review` / `block`. Smaller batches, or `code_audit` per-file for tree scans.
3. Flags — pick one mode:
   - **Honest:** flags match paths (`billing/` → `touches_money`, `migrations/` → `migration`, `timesheet/` → `touches_hours`).
   - **Path-only test:** all flags `false` so you can see what path tokens alone do.
   - Do not mix a test story with honest flags.
4. `run_pack` `pr_audit`. Read Nouls `money` / `hours` / `hours_money_boundary` / `migration`, Choice `merge_risk` (`safe_ui` \| `needs_review` \| `block`), Score `blast_radius`. Compute **`code_gate` in the caller**.
5. **Path false positives:** this pack does **not** read file bodies. Tokens in paths (`budget`, `migration`, `finance`, `payroll`) move money/migration Nouls even when the file is a comment or a fixture. For content truth use a real `diff_summary` or `code_audit` Pass 2 `excerpt` (≤1200).

## Recipe: `code_audit`

Millisecond-tier. **~network RTT per file; parallelize N workers.** Not a multi-second LLM review. Do not send the monorepo as prose.

**This is the file-list pack.** Repo tree / architecture / "try Jev on these files" → Pass 1 here. `pr_audit` is PR-shaped merge risk only.

**Pass 1 (default, all files):** list files → filter screenshots/binaries/generated vendor dirs → `run_pack` `code_audit` with signals-only state → aggregate top `problem_severity` / most frequent Nouls.

```json
{
  "path": "src/billing/invoice-total.ts",
  "language": "ts",
  "role_hint": "domain",
  "signals": {
    "loc": 12,
    "import_count": 1,
    "top_imports": ["money"],
    "has_tests_nearby": false,
    "touches_money": true,
    "is_generated": false,
    "complexity_heuristic": 2
  },
  "repo_context": "Billing module: invoice line totals."
}
```

**Pass 2 (top-N only):** resend hottest files with a short `excerpt` (hard max 1200 chars). Oversized excerpts are `invalid_state`.

Read Nouls `wrong_layer` / `blast_radius` / `missing_verification` / `secret_or_credential_risk` / `inefficiency` / `dead_or_premature_abstraction`, Scores `problem_severity` + `change_cost`, Choice `primary_concern` (`none` | `layering` | `blast_radius` | `verification` | `security` | `performance` | `abstraction` | `other`).

Optional Mode B: `files[]` paths + short `batch_notes` (no bodies) → Choice `hotspot_file`. If `path` is set, Mode A wins.

Example gate: `gateCodeAudit` in `src/policy-examples.ts` → `ok` | `glance` | `deep_review`. Unit-test without a TypeSafe key.

## Recipe: Full repo scan

Do **not** dump a tree into `pr_audit` (path-token false positives, inflated `needs_review` / `block`). Tree → `code_audit` Pass 1.

First-class harness (same `run_pack` / `systemOne` path):

```bash
mcp_jev scan . --dry-run                 # files + signals; no TypeSafe
mcp_jev scan .                           # Pass 1, concurrency 8
mcp_jev scan . --concurrency 16 --pass2 5
# or: node dist/cli.js scan .
```

The CLI walks the tree (respects `.gitignore`; skips binaries, images, lockfiles, `node_modules`, `.git`, common generated dirs), builds compact per-file signals (`loc`, `import_count`, `top_imports`, `has_tests_nearby`, `touches_money` / `touches_auth` / `touches_migration` path heuristics as **signals only**, `is_generated`, `complexity_heuristic`), and calls `code_audit` in parallel (~RTT/file). `--pass2 N` re-runs the hottest N with an excerpt ≤1200 chars. Prints JSONL plus a summary table (top severity, `primary_concern` histogram, hottest paths). Missing API key → clear error (except `--dry-run`).

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

## CLI (`mcp_jev` / `node dist/index.js`)

No-args starts the stdio MCP server. Commands (never print the TypeSafe key):

| Command | What it does |
| --- | --- |
| `mcp_jev` | Start stdio MCP |
| `mcp_jev doctor` | Checkout, dist, wrapper, `api_key_set` (boolean), `NOT_READY` absent. Host files are informational. Exit 1 if not ready. |
| `mcp_jev doctor --json` | Same report as JSON (`ok`, `ready`, `checks[]` ids: `checkout`, `dist`, `wrapper`, `api_key`, `not_ready_marker`; optional `hosts[]`) |
| `mcp_jev hosts print` | Keyless snippets for Cursor, Claude Desktop, Claude Code, Codex, Grok, Antigravity |
| `mcp_jev hosts write [ids]` | Merge snippets (`all` or comma list: `cursor,claude_desktop,claude_code,codex,grok,antigravity`) |
| `mcp_jev config set-key` | Interactive store of `TYPESAFE_API_KEY` in `~/.mcp_jev/.env` (chmod 600) |
| `mcp_jev config set-key KEY` | Same, non-interactive |
| `mcp_jev config status` | Paths + `api_key_set` / `api_key_source` (never the secret) |
| `mcp_jev config path` | Print the user config directory |
| `mcp_jev scan <path>` | Full-repo `code_audit` Pass 1 (signals-only, parallel). `--dry-run`, `--concurrency N`, `--pass2 N`. Also `node dist/cli.js scan`. |
| `mcp_jev help` | Usage |

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
- Returns `id`, `version`, `title`, `summary`, `when_to_use`, `state_schema`, `questions`, `dynamic_choice_from_state`, `example_state`, `suggested_workflow`, `notes`
- Unknown id → `unknown_pack`

### `run_pack`

- Args: `{ pack_id: string, state: object }`
- Validates state, calls `TypeSafeClient.systemOne`
- Returns `{ pack_id, pack_version, model, answers, usage }` (plus additive `guidance` on `computer_use_step`)
- No side effects
- Errors: `missing_api_key`, `invalid_arguments`, `invalid_state` (may include structured `details.missing`), `unknown_pack`, `auth`, `rate_limit`, `timeout`, `connection`, `validation`

Skip `describe_pack` only when you already have that pack's schema in **this** session.

## Pack catalog (in-repo)

Packs live under `src/packs/` (registry order in `src/packs/registry.ts`). New packs are added in-repo. Always `list_packs`. **Full state schema + example_state + notes:** [`references/pack-catalog.md`](references/pack-catalog.md).

| id | State (exact keys) | Jev answers (exact ids) | Caller still does |
| --- | --- | --- | --- |
| `pr_audit` | required `title`, `body`, `files`, `diff_summary`; optional `flags.touches_money`, `flags.touches_hours`, `flags.migration` | Choice `merge_risk` (`safe_ui` \| `needs_review` \| `block`); Nouls `money` / `hours` / `hours_money_boundary` / `migration`; Score `blast_radius` | Staged review: risk Nouls → file Choice over `files[]` → severity. Compute **`code_gate`**. No merge/comment here. |
| `intent_router` | required `message`; optional `channel`, `user_role`, `locale` | Choice `intent` (`faq` \| `action` \| `handoff` \| `smalltalk` \| `other`); Nouls `jailbreak` / `policy_violation`; Score `urgency` | Route / refuse in code. |
| `locale_country` | required `name`; optional `description`, `hints` | Choice `country` (`argentina` \| `usa` \| `india` \| `uruguay` \| `saudi_arabia` \| `unclear`); Noul `explicit_geo_cue`; Score `locale_signal` | Write the catalogue yourself. |
| `computer_use_step` | required `goal`, `app_or_url`, `observation_summary`, `items[]` (`id`,`role`,`label` + optional `name`,`value`,`state`,`region`,`source`); optional `focused_field`, `offscreen_items[]`, `history[]` (`action`,`target`,`result`), `flags.modal_open` / `loading` / `login_required` / `keyboard_visible` / `irreversible_ahead` | Choice `operation` (`click_item` \| `type_text` \| `type_email` \| `press_enter` \| `press_escape` \| `scroll_up` \| `scroll_down` \| `use_browser` \| `press_offscreen` \| `wait` \| `done` \| `none`); Choices `click_target` / `type_target` / `offscreen_target` (from catalogs); Nouls `goal_achieved` / `observation_stale`; Score `step_confidence`; additive `guidance` | Observe, click/type/scroll, writer LLM for text, stop. No screenshots in state. |
| `model_router` | required `user_request`; optional `agent_so_far`, `available_tools`, `files_in_scope`, `last_error`, `flags.has_uncommitted_diff` / `prior_tool_failure` / `user_waiting` | Choice `route` (`fast_local` \| `strong_reasoner` \| `tools_heavy` \| `ask_user` \| `skip`); Nouls `needs_code_edit` / `needs_browser` / `unsafe_or_irreversible` / `simple_lookup`; Score `difficulty` | Map the lane. Thresholds in your code. |
| `review_diff` | required `diff_summary`, `files`; optional `title`, `intent`, `flags.touches_auth` / `touches_public_api` / `missing_tests_heuristic` | Nouls `correctness` / `security` / `reliability` / `compat` / `test_gap`; Choice `hotspot_file` (from `files[]`); Score `severity` | Gate and comments in caller code. |
| `code_audit` | Mode A: `path` + optional `language`, `role_hint`, `signals` (`loc`, `import_count`, `top_imports` max 8, `has_tests_nearby`, `touches_money`, `touches_auth`, `is_generated`, `complexity_heuristic`), `repo_context` (max 280), Pass 2 `excerpt` (max 1200). Mode B: `files[]` + `batch_notes` (max 400). `path` wins if both set. | Nouls `wrong_layer` / `blast_radius` / `missing_verification` / `secret_or_credential_risk` / `inefficiency` / `dead_or_premature_abstraction`; Scores `problem_severity` + `change_cost`; Choice `primary_concern` (`none` \| `layering` \| `blast_radius` \| `verification` \| `security` \| `performance` \| `abstraction` \| `other`); Mode B adds Choice `hotspot_file` | Pass 1 signals-only (~RTT, N workers). Pass 2 short excerpt on top-N. `gateCodeAudit` in code. |
| `skill_router` | required `user_request`, `available_skills`; optional `agent_so_far` | Noul `needs_skill`; Choice `skill` from `available_skills[]`; Score `change_risk` | Load the skill in the host. |
| `command_risk` | required `command`; optional `cwd`, `reason`, `allowed_roots` | Nouls `is_destructive` / `touches_credentials` / `scope_matches`; Score `severity` | Allowlist/sandbox still required. |

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
- Route a repo-tree / architecture / "try Jev on these files" scan to `pr_audit` (`code_audit` Pass 1 is the file-list pack)
- Put experiment narrative in `pr_audit` `title` / `body` / `diff_summary`
- Dump ~40 path-only files into `pr_audit` (inflates `needs_review` / `block`)
- Treat path tokens (`budget`, `migration`, `finance`) as content truth — this pack does not read bodies
- Dump a whole monorepo or large excerpts into `code_audit` (Pass 1 is signals-only; Pass 2 caps excerpt at 1200 chars)
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
| `MCP_JEV_SYNC_SKILL` | If `1`, `install.sh` / `update.sh` copy `skills/mcp_jev` into an **existing** `$REPO_HOME/.cursor/skills` or `~/.cursor/skills` |
| `MCP_JEV_SCAN_CONCURRENCY` | Default parallel workers for `mcp_jev scan` (default 8) |
| `TYPESAFE_BASE_URL` / `JEV_MODEL` / `TYPESAFE_DEFAULT_MODEL` | Optional |

The user store wins; process env is fallback only. Repo `.env` is not auto-loaded.
