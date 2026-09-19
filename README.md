# mcp_jev

Local MCP server that runs **TypeSafe Jev** (System One) **packs** — typed **Choice / Noul / Score** judgments, not chat.

Anyone runs it **on their own PC** with **their own** TypeSafe API key. This repo does not host Jev, proxy your key, or invent a free-form `ask_jev` tool.

**Configure the TypeSafe key once** during MCP install (`~/.mcp_jev/.env`). Any agent that attaches this MCP reuses it. Do **not** paste the key into host `mcp.json` / TOML.

**Docs (source of truth):** this repo — [https://github.com/pedroknigge/mcp_jev](https://github.com/pedroknigge/mcp_jev) · TypeSafe API: [docs.typesafe.ai](https://docs.typesafe.ai) · [llms.txt](https://docs.typesafe.ai/llms.txt)

Skill: [skills/mcp_jev/SKILL.md](skills/mcp_jev/SKILL.md) · Host deep dive: [docs/INSTALL_AGENTS.md](docs/INSTALL_AGENTS.md)

- [Why mcp_jev](#why-mcp_jev)
- [Install (happy path)](#install-happy-path)
- [First-run](#first-run)
- [Recipes](#recipes)
- [Update](#update)
- [Say this to your agent](#say-this-to-your-agent)
- [Install for agents & IDEs](#install-for-agents--ides)
- [Tools](#tools-closed-catalog)
- [Troubleshooting](#troubleshooting)

## Why mcp_jev

mcp_jev is the **judgment layer** for agents and harnesses. Jev is fast at **typed decisions** (one Choice, a few Nouls, a Score) over a short named state. It is not a chat model and not an executor.

Use it when the host already has structured state and needs a closed-catalog call:

| Layer | Owns |
| --- | --- |
| **Harness / agent** | Observation, tools, typed strings, merges, comments, stop rules |
| **mcp_jev** | Versioned packs → `systemOne` → Choice / Noul / Score |
| **Host config** | Keyless `command` = `~/.mcp_jev/bin/mcp_jev` |

Closed tools only: `list_packs` / `describe_pack` / `run_pack` / `ping`. Key-once in `~/.mcp_jev`. Patterns here follow common ecosystem loops (computer-use, review pipelines, model routing) reimplemented as packs — no copied code, no third-party trademarks.

| | Jev (System One) | Chat LLM |
| --- | --- | --- |
| Input | State + closed questions | Prompt / conversation |
| Output | `choice` / `noul` / `score` + probabilities | Prose you must parse |
| Control | Your code composes answers | The model narrates a plan |
| This MCP | Runs a **pack** | Out of scope |

JavaScript SDK (what this server calls):

```ts
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient(); // reads TYPESAFE_API_KEY
await client.systemOne({
  state: { /* pack state */ },
  questions: {
    intent: choice("…", { faq: "…", action: "…" }),
    jailbreak: noul("…"),
    urgency: score("…", ["routine", "soon", "emergency"]),
  },
  model: "jev-latest",
});
```

Python exists (`typesafe-sdk`, `client.system_one`) if you are writing app code. This server is TypeScript / Node 20+.

## Install (happy path)

**Prerequisites:** Node.js **20+**, git, a TypeSafe key from [console.typesafe.ai](https://console.typesafe.ai).

```bash
# macOS / Linux — checkout ~/mcp_jev; key + wrapper in ~/.mcp_jev (override: MCP_JEV_HOME)
git clone https://github.com/pedroknigge/mcp_jev.git ~/mcp_jev
~/mcp_jev/scripts/install.sh
```

```powershell
# Windows
git clone https://github.com/pedroknigge/mcp_jev.git $HOME\mcp_jev
$HOME\mcp_jev\scripts\install.ps1
```

Already cloned? Run `./scripts/install.sh` from that checkout. `MCP_JEV_HOME` overrides the **config dir** (`~/.mcp_jev`). Optional `MCP_JEV_CHECKOUT` overrides the git checkout.

The script: clones or pulls → `npm install && npm run build` → writes `~/.mcp_jev/bin/mcp_jev` → stores `TYPESAFE_API_KEY` **once** in `~/.mcp_jev/.env` (chmod 600) → prints **keyless** snippets for Cursor, Claude Desktop, Claude Code, Codex, Grok, and Antigravity.

Non-interactive and no key → writes `~/.mcp_jev/NOT_READY`, prints a loud next step, **exits non-zero**. `mcp_jev doctor` fails until `mcp_jev config set-key`. Do not treat a missing key as a successful install.

Optional host write: `MCP_JEV_WRITE_HOSTS=all ./scripts/install.sh` (or `cursor,claude_desktop,claude_code,codex,grok,antigravity`). Merge is additive; existing servers stay.

Paste this **keyless** block (the script prints your real wrapper path):

```json
{
  "mcpServers": {
    "mcp_jev": {
      "command": "/Users/YOU/.mcp_jev/bin/mcp_jev"
    }
  }
}
```

Then **`mcp_jev doctor`** → restart the host → `ping` → `list_packs`.

Non-interactive key: `TYPESAFE_API_KEY=… ./scripts/install.sh`  
Later: `node ~/mcp_jev/dist/index.js config set-key`

### Alternatives

| Style | When |
| --- | --- |
| **Install script (prefer this)** | Humans and agents. Key once, keyless host config. |
| Git clone + manual build | `npm install && npm run build && npm test` in `REPO_PATH`. Then `node dist/index.js config set-key`. |
| `npx -y github:pedroknigge/mcp_jev` | No clone. Slow first start. Still run `config set-key` so hosts stay keyless. |
| `npx -y mcp_jev` | **Not on npm yet.** Future published bin (`mcp_jev` → `dist/index.js`). |

`npm test` mocks TypeSafe and must pass without a live key.

## First-run

```bash
mcp_jev doctor          # checkout, dist, wrapper, api_key_set (boolean), host registration
# or: node ~/mcp_jev/dist/index.js doctor --json
~/mcp_jev/scripts/verify-mcp.sh   # stdio JSON-RPC: initialize, tools/list, ping, list_packs
```

On the host, after restart:

1. **`ping`** — `ok`, `packs` ≥ 8, `api_key_set` boolean. Never invent `run_pack` answers if the key is missing.
2. **`list_packs`** — pick an `id`.
3. **`describe_pack`** then **`run_pack`**.

CLI: `mcp_jev doctor` · `mcp_jev hosts print` · `mcp_jev hosts write all` · `mcp_jev config set-key` · `mcp_jev config status`.

## Recipes

### `computer_use_step` (harness)

Code owns OCR / accessibility / DOM, clicks, and the **writer LLM** for free text. Jev only picks the next operation and a target from your closed catalogs.

1. Observe in the harness. Build `items[]` (and optional `offscreen_items[]`) with stable ids. Short `observation_summary`. **No screenshots, pixels, or image blobs in state** (rejected as `invalid_state`).
2. `run_pack` `computer_use_step` with `goal`, `app_or_url`, that observation, recent `history`, and `flags`.
3. One `systemOne` call fans out `operation` plus speculative `click_target` / `type_target` / `offscreen_target` plus `goal_achieved`, `observation_stale`, `step_confidence`.
4. Prefer additive **`guidance`**: `ignore_targets`, `effective_targets`, `writer_owns_typed_string`. Raw `answers` stay intact.
5. Execute **only** the chosen operation. Ignore speculative targets that do not match `operation`. For `type_text` / `type_email`, a writer LLM (or stored value) supplies the string.
6. Example thresholds (tune on your traces): stop if `goal_achieved.noul ≥ 0.8` or `operation` is `done`; re-observe if `observation_stale.noul ≥ 0.65` or `step_confidence.score < 1.5`.

Example state:

```json
{
  "goal": "Sign in with the saved work account",
  "app_or_url": "https://app.example.com/login",
  "observation_summary": "Login form: email focused and empty, password empty, Sign in button, Forgot password link.",
  "focused_field": "email",
  "items": [
    { "id": "email", "role": "textfield", "label": "Work email", "region": "form", "source": "ax" },
    { "id": "password", "role": "textfield", "label": "Password", "region": "form", "source": "ax" },
    { "id": "sign_in", "role": "button", "label": "Sign in", "region": "form", "source": "ax" }
  ],
  "history": [{ "action": "wait", "result": "form_visible" }],
  "flags": { "loading": false, "login_required": true }
}
```

### `model_router` (per-turn lane)

Closed lanes: `fast_local` | `strong_reasoner` | `tools_heavy` | `ask_user` | `skip`.

| Lane | Meaning |
| --- | --- |
| `fast_local` | Cheap/local or no model: lookup, format, one obvious tool |
| `strong_reasoner` | Ambiguous design, hard failure, plan not yet mechanical |
| `tools_heavy` | Long tool / browser / shell loop |
| `ask_user` | Missing preference, secret, or confirmation |
| `skip` | Already done, blocked, or out of scope |

Example thresholds (caller-owned): `route.confidence < 0.45` → `ask_user`; `unsafe_or_irreversible.noul ≥ 0.70` → refuse or confirm; `simple_lookup.noul ≥ 0.75` and `difficulty.score < 1.5` → force `fast_local`.

### Recipes table

| Need | Pack |
| --- | --- |
| Next GUI step from a closed element catalog | `computer_use_step` |
| Per-turn compute lane | `model_router` |
| Load a skill from a closed list | `skill_router` |
| Risk signals for a proposed shell command | `command_risk` |
| Generic diff review | `review_diff` |
| Money / hours / migration merge risk | `pr_audit` |

Code-owned policy: keep thresholds in **your** functions (unit-test them without a TypeSafe key). Jev returns signals; your gate decides.

### `review_diff` (staged review)

Nouls `correctness` / `security` / `reliability` / `compat` / `test_gap` → Choice `hotspot_file` from the closed `files[]` catalog → Score `severity`. Orchestration (comment, block, open a file) stays in the caller.

```json
{
  "intent": "Fail closed on reserved catalog ids",
  "diff_summary": "Adds reserved-id checks and a unit test. No auth change.",
  "files": ["src/packs/catalog-choice.ts", "test/computer-use.test.ts"]
}
```

Example thresholds: request review if any Noul ≥ 0.65; block if `security.noul ≥ 0.75` or `severity.score ≥ 2.5`.

`pr_audit` remains the money / hours / migration merge pack. Distinct id. Do not rename.

## Update

```bash
~/mcp_jev/scripts/update.sh          # git pull + npm install + build; keeps ~/.mcp_jev/.env
# Windows: ~\mcp_jev\scripts\update.ps1
```

Restart the MCP host. That is the whole update.

## Say this to your agent

> Install and configure mcp_jev from https://github.com/pedroknigge/mcp_jev using the install script and skill. Then run doctor, ping, and list_packs.

Or: `npx skills add pedroknigge/mcp_jev --skill mcp_jev` then run `scripts/install.sh`, paste the printed snippets, restart, `doctor` → `ping` → `list_packs`.

## Install for agents & IDEs

**Easiest path:** install script → one keyless `command` pointing at `~/.mcp_jev/bin/mcp_jev` → `mcp_jev doctor` → restart → `ping`. Full stanzas in [docs/INSTALL_AGENTS.md](docs/INSTALL_AGENTS.md).

The server reads `TYPESAFE_API_KEY` from **`~/.mcp_jev/.env` (or `$MCP_JEV_HOME/.env`)**. Process env is a fallback only when the store is empty. Host configs must stay keyless.

Generic JSON (most hosts):

```json
{
  "mcpServers": {
    "mcp_jev": {
      "command": "/absolute/path/to/.mcp_jev/bin/mcp_jev"
    }
  }
}
```

Windows wrapper: `%USERPROFILE%\.mcp_jev\bin\mcp_jev.cmd`.

Print or merge snippets: `mcp_jev hosts print` · `mcp_jev hosts write all`.

### Cursor

Project: `.cursor/mcp.json` · User: `~/.cursor/mcp.json` (project wins on name clash).

Skill: `npx skills add pedroknigge/mcp_jev --skill mcp_jev` or `cp -R skills/mcp_jev .cursor/skills/mcp_jev`.

### Claude Desktop

Settings → Developer → Edit Config, then **fully quit**.

| OS | File |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Same keyless `mcpServers` JSON as Cursor.

### Claude Code

```bash
claude mcp add --scope user --transport stdio mcp_jev -- /Users/YOU/.mcp_jev/bin/mcp_jev
```

Or merge `~/.claude.json` with the generic JSON. Skill: copy to `.claude/skills/mcp_jev`.

### Codex

TOML, not JSON. `~/.codex/config.toml` or `.codex/config.toml`:

```toml
[mcp_servers.mcp_jev]
command = "/Users/YOU/.mcp_jev/bin/mcp_jev"
```

Or `codex mcp add mcp_jev -- /Users/YOU/.mcp_jev/bin/mcp_jev`.

### Grok

`~/.grok/config.toml` / `grok mcp add mcp_jev -- ~/.mcp_jev/bin/mcp_jev`. Same TOML table `[mcp_servers.mcp_jev]`.

### Antigravity

`~/.gemini/config/mcp_config.json` or `.agents/mcp_config.json` — generic JSON, `command` = wrapper.

### Other JSON / TOML hosts

Same wrapper `command`. Some editors use `context_servers` instead of `mcpServers` — see [docs/INSTALL_AGENTS.md](docs/INSTALL_AGENTS.md).

## Agent instructions

> You have **mcp_jev** (or you must install it from https://github.com/pedroknigge/mcp_jev). Jev is **not** chat. No `ask_jev`.
>
> If the MCP tools are missing: tell the user to run `scripts/install.sh` (or `install.ps1`) from that repo, paste the printed snippets, set the key once (`config set-key` / install prompt), run `mcp_jev doctor`, restart the host.
>
> Always: `list_packs` → `describe_pack` → `run_pack`. Side effects stay in **your** code. Never put `TYPESAFE_API_KEY` in chat. If `ping.api_key_set` is false, run `mcp_jev config set-key` — do not embed the key in every host config.

## Tools (closed catalog)

| Tool | Args | What it does |
| --- | --- | --- |
| `list_packs` | none | `id`, `version`, `title`, `summary`, `when_to_use` |
| `describe_pack` | `pack_id` | JSON Schema, questions, `example_state`, `suggested_workflow`, `notes` |
| `run_pack` | `pack_id`, `state` | Validates state, calls TypeSafe `systemOne`, returns typed answers + usage. **No side effects.** |
| `ping` | none | Versions, pack count, `api_key_set`, `api_key_source` (`env` \| `user_store` \| `none`). **Never** echoes the key |

There is **no** free-form ask tool. `list_packs` / `describe_pack` / `ping` never call TypeSafe. Only `run_pack` does.

## Packs

| id | What Jev judges | What **you** still do |
| --- | --- | --- |
| `pr_audit` | `merge_risk` (safe_ui \| needs_review \| block), Nouls money / hours / hours_money_boundary / migration, Score `blast_radius` | Staged review: risk Nouls → file Choice over `files[]` → severity. Compute **`code_gate`**. Jev does not merge or comment |
| `review_diff` | Nouls correctness / security / reliability / compat / test_gap; Choice `hotspot_file` from `files[]`; Score `severity` | Orchestration stays in the caller |
| `skill_router` | Noul `needs_skill`; Choice `skill` from `available_skills[]`; Score `change_risk` | Load the skill in the host. Thresholds in your code |
| `command_risk` | Nouls `is_destructive` / `touches_credentials` / `scope_matches`; Score `severity` | Allowlist/sandbox still required. Signals only |
| `intent_router` | Closed intent Choice, jailbreak + policy Nouls, urgency Score | Route / refuse / hand off in code |
| `locale_country` | Catalogue item → Argentina \| USA \| India \| Uruguay \| Saudi Arabia (or `unclear`) | Write the country to your catalogue |
| `computer_use_step` | Next GUI `operation` + speculative targets; Nouls `goal_achieved` / `observation_stale`; Score `step_confidence`; additive `guidance` | Observe (OCR/AX/DOM), execute the op, writer LLM for typed text, stop rules |
| `model_router` | `route` (fast_local \| strong_reasoner \| tools_heavy \| ask_user \| skip); Nouls code/browser/unsafe/lookup; Score `difficulty` | Map the lane in code. Thresholds stay in the caller |

Packs live in `src/packs/` (in-repo). How to add one: [CONTRIBUTING.md](CONTRIBUTING.md).

## Architecture

```mermaid
flowchart LR
  Agent[Agent] -->|stdio MCP| Server["mcp_jev"]
  Server --> Packs[Pack registry]
  Server -->|run_pack| SDK["TypeSafeClient.systemOne"]
  SDK --> API["POST /v1/systemone"]
  API --> Jev["Jev"]
  Jev -->|typed answers| SDK
  SDK --> Server
  Server --> Agent
  Agent -->|gates and side effects| Code[Your code]
```

## Environment

| Variable | Required | Default |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | Yes, for `run_pack` | From `~/.mcp_jev/.env` after install |
| `TYPESAFE_BASE_URL` | No | SDK: `https://api.typesafe.ai` |
| `JEV_MODEL` | No | `jev-latest` |
| `TYPESAFE_DEFAULT_MODEL` | No | Used if `JEV_MODEL` is unset |
| `MCP_JEV_HOME` | No | `~/.mcp_jev` (key + wrapper) |
| `MCP_JEV_CONFIG` | No | Alias for `MCP_JEV_HOME` |
| `MCP_JEV_CHECKOUT` | No | Git checkout (default `~/mcp_jev` or the repo you ran the script from) |
| `MCP_JEV_WRITE_HOSTS` | No | Install-time host write (`all` or comma list) |

Repo `.env` is **not** auto-loaded. The **user store** `~/.mcp_jev/.env` is. The store wins; process env is fallback only.

CLI: `mcp_jev doctor` · `mcp_jev hosts print` · `mcp_jev config set-key` · `mcp_jev config status` · `mcp_jev config path`.

## Security

- Key lives in **`~/.mcp_jev/.env` (0600)**. Never in git, chat, or host JSON. Process env is fallback only if the store is empty.
- `ping` / `config status` / `doctor` never print the key.
- `scripts/update.sh` does not overwrite the key file.
- Run locally. Do not deploy this stdio binary as a public HTTP proxy.
- Pack state can contain tickets and diffs — keep diffs summarized.
- MIT licensed. Jev / TypeSafe are products of TypeSafe; this project is an independent open-source client.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `doctor` / `NOT_READY` | Non-interactive install without a key. Run `mcp_jev config set-key`, then `mcp_jev doctor`. |
| `ping` → `api_key_set: false` | Same. Confirm `~/.mcp_jev/.env` exists. Restart the host. |
| `run_pack` → `missing_api_key` | Same. Do not fabricate answers. |
| `run_pack` → `auth` | Key rejected (HTTP 401). Rotate at the TypeSafe dashboard, then `config set-key`. |
| `invalid_state` | Re-read `describe_pack`. Starter packs reject extra fields. `computer_use_step` also rejects screenshots. |
| `unknown_pack` | `list_packs`. There is no `ask_jev`. |
| Wrong Node | `node -v` must be 20+. GUI hosts may not see nvm. |
| stdio pollution | Wrapper and server must not write to **stdout**. |
| `npx mcp_jev` 404 | Not on npm yet. Use the install script or `npx -y github:pedroknigge/mcp_jev`. |

## Scripts

```bash
./scripts/install.sh     # happy path
./scripts/update.sh
./scripts/verify-mcp.sh  # stdio smoke, no TypeSafe call
npm run build            # tsc → dist/
npm start                # node dist/index.js (MCP stdio)
npm test
npm run typecheck
mcp_jev doctor
```

## License

[MIT](LICENSE)
