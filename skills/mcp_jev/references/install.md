# Host install snippets

Use with [`SKILL.md`](../SKILL.md). Prefer a built clone. Replace `REPO_PATH` with an **absolute** path (example only: `/Users/pedroknigge/Desktop/mcp_jev`). The package is **not on npm yet**; `npx -y mcp_jev` is the future published shape. Today: `node REPO_PATH/dist/index.js` or `npx -y github:pedroknigge/mcp_jev`.

The server does **not** load `.env`. Always set `TYPESAFE_API_KEY` in the host `env` block.

## Generic JSON (most hosts)

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

## Cursor

- Project: `.cursor/mcp.json` · User: `~/.cursor/mcp.json`
- Skill: `.cursor/skills/mcp_jev` or `~/.cursor/skills/mcp_jev`

npx (git): `"command": "npx", "args": ["-y", "github:pedroknigge/mcp_jev"]`.

## Claude Desktop

| OS | File |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Same JSON as generic. Fully quit the app after saving. Windows npx: `"command": "cmd", "args": ["/c", "npx", "-y", "github:pedroknigge/mcp_jev"]`.

## Claude Code

```bash
claude mcp add --scope user --env TYPESAFE_API_KEY=YOUR_KEY --transport stdio mcp_jev \
  -- node REPO_PATH/dist/index.js
```

Project file: `.mcp.json`. Skill: `.claude/skills/mcp_jev`. Also: `npx skills add pedroknigge/mcp_jev --skill mcp_jev`.

## Codex

`~/.codex/config.toml` (CLI, IDE, ChatGPT desktop Codex host):

```toml
[mcp_servers.mcp_jev]
command = "node"
args = ["REPO_PATH/dist/index.js"]

[mcp_servers.mcp_jev.env]
TYPESAFE_API_KEY = "YOUR_KEY"
```

Or: `codex mcp add mcp_jev --env TYPESAFE_API_KEY=YOUR_KEY -- node REPO_PATH/dist/index.js`.

## Grok / xAI

`~/.grok/config.toml` or `.grok/config.toml`. CLI: `grok mcp add mcp_jev -- node REPO_PATH/dist/index.js`. Same TOML shape as Codex (`[mcp_servers.mcp_jev]`). `${TYPESAFE_API_KEY}` expands. `grok mcp doctor mcp_jev`.

## Google Antigravity

`~/.gemini/config/mcp_config.json` or `.agents/mcp_config.json`. Same generic JSON (`command` / `args` / `env`). UI: … → MCP Servers → View raw config. No `serverUrl` — this is stdio. Skill fallback: copy this folder into the workspace skills dir.

## Windsurf

`~/.codeium/windsurf/mcp_config.json` — generic `mcpServers` JSON.

## Cline

Configure MCP Servers in the Cline panel. IDE file is usually `cline_mcp_settings.json` under VS Code `globalStorage/saoudrizwan.claude-dev`. CLI: `~/.cline/mcp.json`. Generic `mcpServers` JSON.

## Continue

`.continue/mcpServers/mcp_jev.yaml`:

```yaml
name: mcp_jev
version: 0.1.0
schema: v1
mcpServers:
  - name: mcp_jev
    command: node
    args: [REPO_PATH/dist/index.js]
    env:
      TYPESAFE_API_KEY: YOUR_KEY
```

Or drop the generic JSON into `.continue/mcpServers/`.

## Zed

`~/.config/zed/settings.json` — key is **`context_servers`**:

```json
{
  "context_servers": {
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

## After install

Restart the host. `ping` then `list_packs`. If `api_key_set` is false, fix the `env` block — do not invent judgments.
