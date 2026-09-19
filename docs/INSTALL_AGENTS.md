# Install mcp_jev for any coding agent

**Source of truth:** [https://github.com/pedroknigge/mcp_jev](https://github.com/pedroknigge/mcp_jev)

Skill: [`skills/mcp_jev/SKILL.md`](../skills/mcp_jev/SKILL.md)

## Easiest path

1. `git clone https://github.com/pedroknigge/mcp_jev.git ~/mcp_jev && ~/mcp_jev/scripts/install.sh`  
   Windows: `scripts\install.ps1`
2. Paste the **keyless** snippets the script prints (or `mcp_jev hosts write all`).
3. `mcp_jev doctor` → restart the host → `ping` → `list_packs`.

Non-interactive install without a key writes `~/.mcp_jev/NOT_READY` and exits non-zero. Do not treat that as success.

The script stores `TYPESAFE_API_KEY` **once** in `~/.mcp_jev/.env` (chmod 600). Host configs only need:

```json
{
  "mcpServers": {
    "mcp_jev": {
      "command": "/Users/YOU/.mcp_jev/bin/mcp_jev"
    }
  }
}
```

`MCP_JEV_HOME` (default `~/.mcp_jev`) is the **user config dir** (key + wrapper). Checkout defaults to `~/mcp_jev`, or the repo you ran the script from (`cd $HOME/mcp_jev && ./scripts/install.sh`). Optional `MCP_JEV_CHECKOUT` overrides the clone path. `MCP_JEV_CONFIG` is an alias for `MCP_JEV_HOME`.

Update: `~/mcp_jev/scripts/update.sh` — pull + build; **does not** touch the key. Restart the host.

This package is **stdio only**. Do not pick HTTP/SSE/URL in host UIs.

## Alternatives

| Style | Notes |
| --- | --- |
| Script | Prefer this. |
| Manual clone | `npm install && npm run build && npm test` then `node dist/index.js config set-key` |
| `npx -y github:pedroknigge/mcp_jev` | No clone; still `config set-key` so hosts stay keyless |
| `npx -y mcp_jev` | Not on npm yet |

## Cursor

`.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (user). Skill: `npx skills add pedroknigge/mcp_jev --skill mcp_jev`

Cloud Agents do not inherit laptop `~/.cursor/mcp.json`. Register MCP in the team dashboard or have the agent run the install script in the VM.

## Claude Desktop

| OS | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Same keyless JSON. Fully quit after save.

## Claude Code

```bash
claude mcp add --scope user --transport stdio mcp_jev -- "$HOME/.mcp_jev/bin/mcp_jev"
```

## OpenAI Codex

```toml
[mcp_servers.mcp_jev]
command = "/Users/YOU/.mcp_jev/bin/mcp_jev"
```

`codex mcp add mcp_jev -- ~/.mcp_jev/bin/mcp_jev`

## Grok

`grok mcp add mcp_jev -- ~/.mcp_jev/bin/mcp_jev` plus `~/.grok/config.toml` `[mcp_servers.mcp_jev]`.

## Google Antigravity

`~/.gemini/config/mcp_config.json` or `.agents/mcp_config.json`. Generic JSON, wrapper `command`. [IDE MCP docs](https://www.antigravity.google/docs/ide/mcp/).

## Windsurf / Cline / Continue / Zed

Same wrapper command. Zed: `context_servers` in `~/.config/zed/settings.json`. Continue: `.continue/mcpServers/mcp_jev.yaml` with `command: /Users/YOU/.mcp_jev/bin/mcp_jev`. Cline: MCP Servers → Configure. Windsurf: `~/.codeium/windsurf/mcp_config.json`.

## Skill

```bash
npx skills add pedroknigge/mcp_jev --skill mcp_jev
```

**Say this to your agent:**  
Install and configure mcp_jev from https://github.com/pedroknigge/mcp_jev using the install script and skill.

## Verify

`mcp_jev doctor` → `scripts/verify-mcp.sh` (stdio smoke, no TypeSafe) → host `ping` → `list_packs` → optional `describe_pack`. `npm test` never needs a live key.

## Security

- One key file: `~/.mcp_jev/.env`. Not in git, not in host JSON, not in chat.
- `update.sh` / `update.ps1` preserve that file.
- `ping`, `config status`, and `doctor` never print the key.
