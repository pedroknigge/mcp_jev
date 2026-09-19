# Install mcp_jev for any coding agent

This is the deep-dive companion to the [README](../README.md#install-for-agents--ides). The skill ([`skills/mcp_jev/SKILL.md`](../skills/mcp_jev/SKILL.md)) is the model-facing contract. Read those first.

**What this package is:** a **local stdio MCP** that runs in-repo TypeSafe **Jev** (System One) packs. Not chat. Not a hosted API. Not `ask_jev`.

**What every host needs:**

1. Node 20+
2. A built (or npx-launched) `mcp_jev` process on **stdio**
3. `TYPESAFE_API_KEY` in that process's **environment** (the server does not load `.env`)
4. The skill copied into the host's skills directory so the model uses `list_packs` → `describe_pack` → `run_pack`

## Canonical stdio stanza

JSON hosts (Cursor, Claude Desktop, Claude Code `.mcp.json`, Windsurf, Cline, Antigravity, most others):

```json
{
  "mcpServers": {
    "mcp_jev": {
      "command": "node",
      "args": ["REPO_PATH/dist/index.js"],
      "env": {
        "TYPESAFE_API_KEY": "YOUR_KEY"
      }
    }
  }
}
```

`REPO_PATH` must be **absolute**. Example only (Pedro's typical Desktop checkout):

```text
/Users/pedroknigge/Desktop/mcp_jev
```

Linux example: `/home/pedroknigge/Desktop/mcp_jev`. Windows example: `C:\\Users\\pedroknigge\\Desktop\\mcp_jev\\dist\\index.js`.

### Three launch styles

| Style | `command` + `args` | Notes |
| --- | --- | --- |
| Local build | `node`, `["REPO_PATH/dist/index.js"]` | After `npm install && npm run build`. Preferred. |
| Git via npx | `npx`, `["-y", "github:pedroknigge/mcp_jev"]` | Runs `prepare` → `tsc`. Slow first start. |
| npm (when published) | `npx`, `["-y", "mcp_jev"]` | Package name / bin: `mcp_jev`. **Not on the public registry yet.** |

Optional env on every style: `TYPESAFE_BASE_URL`, `JEV_MODEL` (wins over `TYPESAFE_DEFAULT_MODEL`; default `jev-latest`).

### Generic "paste into your MCP servers list"

If a host UI has a form instead of a file:

- **Name:** `mcp_jev`
- **Transport:** stdio (local process)
- **Command:** `node`
- **Arguments:** one arg, the absolute path to `dist/index.js`
- **Environment:** `TYPESAFE_API_KEY=…`

Do not choose HTTP/SSE/URL. This server has no listen port.

## Build checklist (once per machine)

```bash
export REPO_PATH="$HOME/src/mcp_jev"   # or your path
git clone https://github.com/pedroknigge/mcp_jev.git "$REPO_PATH"
cd "$REPO_PATH"
npm install && npm run build && npm test
```

Smoke without a key: `npm test` and, after the host is configured, MCP tool `ping` (`api_key_set` may be `false` until you add the key).

## Cursor

| Scope | File |
| --- | --- |
| Project | `.cursor/mcp.json` |
| User | `~/.cursor/mcp.json` |

Both are merged; project overrides the same server name. Cursor interpolates `${userHome}`, `${workspaceFolder}`, `${env:NAME}` in some fields — still prefer an absolute `args` path.

Skill: `cp -R skills/mcp_jev .cursor/skills/mcp_jev` or `~/.cursor/skills/mcp_jev`.

Cloud Agents at cursor.com do **not** automatically inherit a laptop `~/.cursor/mcp.json`. Register the server in the team Integrations / MCP dashboard if you need it there, or have the cloud agent clone + build and write a project `.cursor/mcp.json`.

## Claude Desktop

| OS | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Settings → Developer → Edit Config. **Fully quit** (macOS: Cmd+Q) after saving. Root key must be `mcpServers`.

Windows `npx` wrapper if the host cannot exec `npx` directly:

```json
{
  "mcpServers": {
    "mcp_jev": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "github:pedroknigge/mcp_jev"],
      "env": {
        "TYPESAFE_API_KEY": "YOUR_KEY"
      }
    }
  }
}
```

Logs: `~/Library/Logs/Claude/mcp*.log` on macOS (similar under `%APPDATA%\Claude\logs` on Windows).

## Claude Code

```bash
claude mcp add --scope user --env TYPESAFE_API_KEY=YOUR_KEY --transport stdio mcp_jev \
  -- node /absolute/path/to/mcp_jev/dist/index.js
```

| Scope | File |
| --- | --- |
| `local` (default) | `~/.claude.json` under this project |
| `project` | `.mcp.json` in the repo (safe to commit **without** secrets — use env interpolation if the host supports it) |
| `user` | `~/.claude.json` top-level `mcpServers` |

`--` is required before the server command. Put another flag (`--scope` / `--transport`) between `--env` and the server name.

Skill: `.claude/skills/mcp_jev` or `npx skills add pedroknigge/mcp_jev --skill mcp_jev`.

## OpenAI Codex

Not JSON. User file `~/.codex/config.toml`; project `.codex/config.toml` (trusted projects). Shared by Codex CLI, the IDE extension, and ChatGPT desktop's Codex host.

```bash
codex mcp add mcp_jev --env TYPESAFE_API_KEY=YOUR_KEY \
  -- node /absolute/path/to/mcp_jev/dist/index.js
```

```toml
[mcp_servers.mcp_jev]
command = "npx"
args = ["-y", "github:pedroknigge/mcp_jev"]
startup_timeout_sec = 60

[mcp_servers.mcp_jev.env]
TYPESAFE_API_KEY = "YOUR_KEY"
```

Table key is `mcp_servers` (underscore). Pasting a Cursor JSON file into `config.toml` will not parse. In the TUI / IDE: `/mcp` or Settings → MCP servers.

## Grok / xAI

See [docs.x.ai — MCP servers](https://docs.x.ai/build/features/mcp-servers).

```bash
grok mcp add mcp_jev -- node /absolute/path/to/mcp_jev/dist/index.js
```

Then set env in `~/.grok/config.toml` (or `.grok/config.toml`):

```toml
[mcp_servers.mcp_jev]
command = "node"
args = ["/absolute/path/to/mcp_jev/dist/index.js"]
startup_timeout_sec = 30
tool_timeout_sec = 60

[mcp_servers.mcp_jev.env]
TYPESAFE_API_KEY = "${TYPESAFE_API_KEY}"
```

`grok mcp doctor mcp_jev` for connectivity. Stderr: `~/.grok/logs/mcp/`. Grok may also ingest `.cursor/mcp.json` and `.mcp.json`; disable with `[compat.cursor] mcps = false` if you get duplicates.

Other Grok/xAI agent UIs: paste the generic JSON `mcpServers` block if the form says "MCP servers (JSON)".

## Google Antigravity

Official: [MCP in Antigravity IDE](https://www.antigravity.google/docs/ide/mcp/).

| Scope | File |
| --- | --- |
| Global | `~/.gemini/config/mcp_config.json` |
| Workspace | `.agents/mcp_config.json` |

UI: **… → MCP Servers → Manage MCP Servers → View raw config**. Stdio fields: `command`, `args`, `env`, optional `cwd`. Remote HTTP uses `serverUrl` — **do not** use that for mcp_jev.

Skill fallback: copy `skills/mcp_jev` next to whatever skills directory that workspace already uses. If a surface cannot spawn subprocesses, run mcp_jev from Cursor/Claude/Codex on the same machine and keep using the skill's tool contract.

## Windsurf

`~/.codeium/windsurf/mcp_config.json` (Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`).

Root key `mcpServers`. Local stdio is the same `command` / `args` / `env` as Cursor. (Remote Windsurf servers use `serverUrl`, not `url` — irrelevant here.)

Cascade settings also have **View raw config**.

## Cline

In the Cline panel: MCP Servers icon → Configure → **Configure MCP Servers**.

| Flavor | Typical path |
| --- | --- |
| VS Code / Cursor extension | `.../User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| Cline CLI | `~/.cline/mcp.json` (some builds: `~/.cline/data/settings/cline_mcp_settings.json`) |

```json
{
  "mcpServers": {
    "mcp_jev": {
      "command": "node",
      "args": ["/absolute/path/to/mcp_jev/dist/index.js"],
      "env": {
        "TYPESAFE_API_KEY": "YOUR_KEY"
      },
      "disabled": false
    }
  }
}
```

## Continue

Preferred: YAML in `~/.continue/config.yaml` or a block file `.continue/mcpServers/mcp_jev.yaml`:

```yaml
name: mcp_jev
version: 0.1.0
schema: v1
mcpServers:
  - name: mcp_jev
    command: node
    args:
      - /absolute/path/to/mcp_jev/dist/index.js
    env:
      TYPESAFE_API_KEY: YOUR_KEY
```

Continue also picks up Cursor-style JSON if you drop it in `.continue/mcpServers/`. Tools require Agent mode.

## Zed

Settings → AI → MCP Servers → Add Local Server, or edit `~/.config/zed/settings.json` (macOS older fallback: `~/Library/Application Support/Zed/settings.json`).

**Key is `context_servers`:**

```json
{
  "context_servers": {
    "mcp_jev": {
      "command": "node",
      "args": ["/absolute/path/to/mcp_jev/dist/index.js"],
      "env": {
        "TYPESAFE_API_KEY": "YOUR_KEY"
      }
    }
  }
}
```

Green indicator = process is up. External ACP agents in Zed can also read their own native MCP files.

## Skill install (every host)

The MCP process is useless if the model treats Jev as ChatGPT. Copy the skill:

```bash
# Cursor
mkdir -p .cursor/skills && cp -R skills/mcp_jev .cursor/skills/mcp_jev

# Claude Code / Desktop-adjacent
mkdir -p .claude/skills && cp -R skills/mcp_jev .claude/skills/mcp_jev

# Codex (if the host reads ~/.codex/skills)
mkdir -p ~/.codex/skills && cp -R skills/mcp_jev ~/.codex/skills/mcp_jev

# skills.sh
npx skills add pedroknigge/mcp_jev --skill mcp_jev
```

This is **not** the official TypeSafe authoring skill (`npx skills add typesafe-ai/skills --skill typesafe-ai`). Use that when designing new questions or writing `@typesafe-ai/sdk` code.

## Agent verify sequence

After restart:

1. `ping` — expect `ok: true`, `server: "mcp_jev"`, `packs: 3` (or more if the repo grew), `api_key_set: true` once the key is in `env`.
2. `list_packs` — expect `pr_audit`, `intent_router`, `locale_country`.
3. `describe_pack` with `pack_id: "intent_router"`.
4. `run_pack` only if `api_key_set` is true and the user wants a live call.

`npm test` never needs a live key.

## Security

- Never commit a real key. Prefer `${TYPESAFE_API_KEY}` / host secret UI where supported.
- `ping` is designed so a leaked transcript still does not contain the key.
- Do not expose this stdio binary on a public port or wrap it in an unauthenticated HTTP proxy.
- Pack state is confidential (diffs, tickets, catalogue copy). Summarize.

## Troubleshooting

See the table in the [README](../README.md#troubleshooting). Extra notes:

- **Host cwd ≠ repo** → relative `dist/index.js` fails. Use `REPO_PATH`.
- **Two Nodes** → GUI apps often miss nvm. Use the absolute `node` binary (`which node` after `nvm use`).
- **stdout noise** → wrappers that print "starting…" break the MCP handshake.
- **Validation** → starter packs set `additionalProperties: false`. Extra keys are `invalid_state`.
- **Rate limit / timeout** — wait or shrink `diff_summary`. Do not invent a judgment.
