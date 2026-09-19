# mcp_jev skill

Model-universal skill for **mcp_jev** (TypeSafe Jev / System One packs).

- Latest install: [https://github.com/pedroknigge/mcp_jev](https://github.com/pedroknigge/mcp_jev)
- This folder: [`SKILL.md`](./SKILL.md) · [`references/install.md`](./references/install.md) · [`references/pack-catalog.md`](./references/pack-catalog.md)
- Custom judgments (packs are shortcuts; no pack fits → typed `run_questions`): [`docs/CUSTOM_JUDGMENTS.md`](../../docs/CUSTOM_JUDGMENTS.md)
- Blind dogfood (invent questions before the pack list): [`docs/DOGFOOD.md`](../../docs/DOGFOOD.md)

## Install the skill

`scripts/install.sh` / `update.sh` refresh **once** to `~/.agents/skills/mcp_jev`. If you skipped those scripts, pick **one** path (never both):

```bash
npx skills add pedroknigge/mcp_jev --skill mcp_jev
# or: rm -rf ~/.agents/skills/mcp_jev && cp -R skills/mcp_jev ~/.agents/skills/mcp_jev
```

Do not copy into a dest that already contains `mcp_jev` (nests `mcp_jev/mcp_jev`). Frontmatter `description` always starts with `VERSION — ` (`package.json` version + em dash).

This is **not** the official TypeSafe authoring skill (`npx skills add typesafe-ai/skills --skill typesafe-ai`).

## Install / update the server

The skill does not start Jev. From the repo:

```bash
./scripts/install.sh    # key once → keyless host snippets
./scripts/update.sh     # GitHub pull + build (not npm); keeps ~/.mcp_jev/.env
mcp_jev doctor          # checkout, dist, wrapper, key boolean
mcp_jev smoke           # stdio initialize / tools / ping / list_packs (no TypeSafe)
./scripts/verify-mcp.sh # same smoke as a script
```

Then paste the printed MCP snippets (or `mcp_jev hosts write`) and restart the host.

After `update.sh`, the skill is refreshed **once** to `~/.agents/skills/mcp_jev`. Hosts that do not read that path: re-add **once** (do not also copy):

```bash
npx skills add pedroknigge/mcp_jev --skill mcp_jev
```

`npm test` fails if a pack or question id is missing from `SKILL.md` / `references/pack-catalog.md`.

**Say this to your agent:**  
Install and configure mcp_jev from https://github.com/pedroknigge/mcp_jev using the install script and skill.
