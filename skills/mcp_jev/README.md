# mcp_jev skill

Model-universal skill for **mcp_jev** (TypeSafe Jev / System One packs).

- Latest install: [https://github.com/pedroknigge/mcp_jev](https://github.com/pedroknigge/mcp_jev)
- This folder: [`SKILL.md`](./SKILL.md) · [`references/install.md`](./references/install.md)

## Install the skill

```bash
npx skills add pedroknigge/mcp_jev --skill mcp_jev
```

Or copy `skills/mcp_jev` to `.cursor/skills/mcp_jev`, `.claude/skills/mcp_jev`, or `~/.cursor/skills`.

This is **not** the official TypeSafe authoring skill (`npx skills add typesafe-ai/skills --skill typesafe-ai`).

## Install / update the server

The skill does not start Jev. From the repo:

```bash
./scripts/install.sh    # key once → keyless host JSON
./scripts/update.sh     # pull + build; keeps ~/.mcp_jev/.env
```

Then paste the printed MCP snippet and restart the host.

**Say this to your agent:**  
Install and configure mcp_jev from https://github.com/pedroknigge/mcp_jev using the install script and skill.
