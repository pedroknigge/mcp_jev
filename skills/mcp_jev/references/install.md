# Host install snippets

**Source of truth:** [https://github.com/pedroknigge/mcp_jev](https://github.com/pedroknigge/mcp_jev)

Happy path: `scripts/install.sh` / `install.ps1` → key once in `~/.mcp_jev/.env` → paste **keyless** JSON → restart → `ping`.

```json
{
  "mcpServers": {
    "mcp_jev": {
      "command": "/Users/YOU/.mcp_jev/bin/mcp_jev"
    }
  }
}
```

Windows: `%USERPROFILE%\.mcp_jev\bin\mcp_jev.cmd`. Update: `scripts/update.sh` (keeps the key).

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

## Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.mcp_jev]
command = "/Users/YOU/.mcp_jev/bin/mcp_jev"
```

## Grok / xAI

`~/.grok/config.toml` — same `[mcp_servers.mcp_jev]` table. `grok mcp add mcp_jev -- ~/.mcp_jev/bin/mcp_jev`

## Antigravity

`~/.gemini/config/mcp_config.json` or `.agents/mcp_config.json` — generic JSON.

## Windsurf / Cline / Continue / Zed

Same wrapper `command`. Zed uses **`context_servers`**. Details: repo `docs/INSTALL_AGENTS.md`.
