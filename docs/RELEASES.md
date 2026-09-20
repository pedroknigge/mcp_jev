# GitHub releases

mcp_jev ships as **GitHub Releases only**. Do **not** `npm publish`.

## Versioning

Public line starts at **0.0.9** (`package.json` + git tag `v0.0.9`). Earlier numbers in this repo (0.1.x / 0.2.0) were pre-release bookkeeping, not the public line.

Bump **one path at a time**, patch first:

| Current | Next |
| --- | --- |
| `0.0.11` | `0.0.12` |
| `0.0.99` | `0.1.0` |
| `0.1.0` | `0.1.1` |
| `0.1.99` | `0.2.0` |

When a path reaches **99**, roll to the next number. Tag and GitHub Release name: `v` + `package.json` version.

## Install / update

Clone from GitHub and run `scripts/install.sh`. Later updates: `scripts/update.sh` (git pull + build). Not `npm update` / `npx mcp_jev`.

## Cut a release

1. Bump `package.json` / `package-lock.json` on a PR to `main`. Run `npx tsx scripts/sync-skill-catalog.ts` so `SKILL.md` description stays `VERSION — …`.
2. Merge, then tag `vX.Y.Z` on `main` and open a GitHub Release with notes.
3. Pushing `v*` runs `.github/workflows/release.yml` (test + GitHub Release if one is not already there). It does **not** publish to npm.
