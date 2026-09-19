# mcp_jev skill

Model-universal skill for **mcp_jev** (TypeSafe Jev / System One packs).

- Latest install: [https://github.com/pedroknigge/mcp_jev](https://github.com/pedroknigge/mcp_jev)
- This folder: [`SKILL.md`](./SKILL.md) · [`references/install.md`](./references/install.md) · [`references/pack-catalog.md`](./references/pack-catalog.md)

## Install the skill

```bash
npx skills add pedroknigge/mcp_jev --skill mcp_jev
```

Or copy `skills/mcp_jev` to `.cursor/skills/mcp_jev`, `.claude/skills/mcp_jev`, or `~/.cursor/skills`.

This is **not** the official TypeSafe authoring skill (`npx skills add typesafe-ai/skills --skill typesafe-ai`).

## Install / update the server

The skill does not start Jev. From the repo:

```bash
./scripts/install.sh    # key once → keyless host snippets
./scripts/update.sh     # pull + build; keeps ~/.mcp_jev/.env
mcp_jev doctor          # checkout, dist, wrapper, key boolean
mcp_jev smoke           # stdio initialize / tools / ping / list_packs (no TypeSafe)
./scripts/verify-mcp.sh # same smoke as a script
```

Then paste the printed MCP snippets (or `mcp_jev hosts write`) and restart the host.

After `update.sh`, **re-add or copy this skill** — hosts do not auto-reload it:

```bash
npx skills add pedroknigge/mcp_jev --skill mcp_jev
# or: cp -R skills/mcp_jev .cursor/skills/mcp_jev
```

`npm test` fails if a pack or question id is missing from `SKILL.md` / `references/pack-catalog.md`.

**Say this to your agent:**  
Install and configure mcp_jev from https://github.com/pedroknigge/mcp_jev using the install script and skill.
