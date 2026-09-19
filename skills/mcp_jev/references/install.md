# Host install snippets

**Source of truth:** [https://github.com/pedroknigge/mcp_jev](https://github.com/pedroknigge/mcp_jev)

Happy path: `scripts/install.sh` / `install.ps1` → key once in `~/.mcp_jev/.env` → paste **keyless** snippets (or `mcp_jev hosts write`) → `mcp_jev doctor` → restart → `ping`.

Non-interactive without a key writes `~/.mcp_jev/NOT_READY` and exits non-zero.

```json
{
  "mcpServers": {
    "mcp_jev": {
      "command": "/Users/YOU/.mcp_jev/bin/mcp_jev"
    }
  }
}
```

Windows: `%USERPROFILE%\.mcp_jev\bin\mcp_jev.cmd`. Update from GitHub (not npm): `scripts/update.sh` (keeps the key; refreshes the skill once to `~/.agents/skills/mcp_jev`). Hosts that ignore that path: re-add once with `npx skills add pedroknigge/mcp_jev --skill mcp_jev` (do not also copy).

## Cursor

`.cursor/mcp.json` or `~/.cursor/mcp.json`. Skill: `npx skills add pedroknigge/mcp_jev --skill mcp_jev`

## Claude Desktop

| OS | File |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Same JSON. Fully quit after saving.

## Claude Code

```bash
claude mcp add --scope user --transport stdio mcp_jev -- "$HOME/.mcp_jev/bin/mcp_jev"
```

Or merge `~/.claude.json` with the generic JSON.

## Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.mcp_jev]
command = "/Users/YOU/.mcp_jev/bin/mcp_jev"
```

## Grok

`~/.grok/config.toml` — same `[mcp_servers.mcp_jev]` table. `grok mcp add mcp_jev -- ~/.mcp_jev/bin/mcp_jev`

## Antigravity

`~/.gemini/config/mcp_config.json` or `.agents/mcp_config.json` — generic JSON.

Print/merge: `mcp_jev hosts print` · `mcp_jev hosts write all` · `MCP_JEV_WRITE_HOSTS=all`.

## Other hosts

Same wrapper `command`. Some editors use **`context_servers`**. Details: repo `docs/INSTALL_AGENTS.md`.
