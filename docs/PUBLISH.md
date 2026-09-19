# Publish mcp_jev

Pedro (maintainer) must approve the first npm publish. This repo is publish-ready; **do not** run `npm publish` from a pull request.

Unscoped name **`mcp_jev`** was free on the npm registry when this checklist was added. Bin: `mcp_jev` → `dist/index.js` (shebang). Node **20+**.

| Command | What it does |
| --- | --- |
| `npx -y mcp_jev` | Start the stdio MCP server (host `command` / `args`) |
| `npx -y mcp_jev help` | CLI usage |
| `npx -y mcp_jev doctor` | Checkout, dist, wrapper, key boolean |
| `npx -y mcp_jev scan <path>` | `code_audit` Pass 1 (`--dry-run` needs no key) |
| `npx -y mcp_jev smoke` | Stdio initialize / tools / ping / list_packs. **No TypeSafe call.** |

The published bin still reads `~/.mcp_jev/.env` (or `$MCP_JEV_HOME`). Host JSON stays keyless.

## Manual checklist

1. Bump `version` in `package.json` (semver). The git tag must be `v` + that version (`0.2.0` → `v0.2.0`).
2. `npm test` and `npm run typecheck` (also run by `prepublishOnly`).
3. `npm login` as the npm owner (Pedro).
4. Optional: `npm pack --dry-run` — tarball has `dist/`, `skills/`, `README.md`, `LICENSE`; not `src/` or `test/`.
5. `npm publish --access public`
6. Tag and GitHub Release:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
   Pushing `v*` runs `.github/workflows/release.yml` (needs `NPM_TOKEN`). Or create the GitHub Release in the UI from that tag.
7. Confirm: `npx -y mcp_jev@X.Y.Z help` and `npx -y mcp_jev@X.Y.Z smoke`

Do **not** put `TYPESAFE_API_KEY` in publish CI. `npm test` / `smoke` / `scripts/verify-mcp.sh` mock or skip TypeSafe.

## GitHub Action (`release.yml`)

Runs **only** on tags matching `v*`. It does **not** run on pull requests.

Required repository secret:

| Secret | Purpose |
| --- | --- |
| `NPM_TOKEN` | npm [automation token](https://docs.npmjs.com/creating-and-viewing-access-tokens) with publish rights to `mcp_jev` |

`setup-node` uses `registry-url: https://registry.npmjs.org` and `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`.

The job: `npm ci` → test → typecheck → `scripts/verify-mcp.sh` → assert tag version equals `package.json` → `npm publish --access public` → `gh release create` with generated notes.

Until `NPM_TOKEN` is set on the repo, a pushed `v*` tag will fail at publish. This document is the dry run for that secret — no token is created here.

## What ships in the tarball

`package.json` `files[]` plus `.npmignore`:

- **Included:** `dist/` (compiled bin), `skills/` (useful after `npx` / local copy), `docs/`, `scripts/`, `README.md`, `LICENSE`, `.env.example`
- **Excluded:** `src/`, `test/`, `.github/`, `tsconfig.json`

`prepare` builds on local `npm install` and git installs. Registry installs use the packed `dist/` and do not need TypeScript.
