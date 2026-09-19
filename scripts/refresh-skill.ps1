# Refresh skills\mcp_jev ONCE into $HOME\.agents\skills\mcp_jev.
# Never runs `npx skills add` (that plus a copy nests mcp_jev\mcp_jev).
# Usage: refresh-skill.ps1 REPO_HOME
$ErrorActionPreference = "Stop"

if ($args.Count -lt 1 -or -not (Test-Path $args[0])) {
  throw "usage: refresh-skill.ps1 REPO_HOME"
}

$repoHome = $args[0]
$skillSrc = Join-Path $repoHome "skills\mcp_jev"
$nested = Join-Path $skillSrc "mcp_jev\SKILL.md"
$direct = Join-Path $skillSrc "SKILL.md"
if ((Test-Path $nested) -and -not (Test-Path $direct)) {
  Write-Host "mcp_jev: unwrapping nested skill source $skillSrc\mcp_jev"
  $skillSrc = Join-Path $skillSrc "mcp_jev"
}

if (-not (Test-Path (Join-Path $skillSrc "SKILL.md"))) {
  Write-Host "mcp_jev: no skill at $skillSrc — skip refresh"
  exit 0
}

$dest = if ($env:MCP_JEV_SKILL_HOME) { $env:MCP_JEV_SKILL_HOME } else { Join-Path $HOME ".agents\skills\mcp_jev" }
$srcReal = (Resolve-Path $skillSrc).Path

if (Test-Path $dest) {
  $destReal = (Resolve-Path $dest).Path
  if ($destReal -eq $srcReal) {
    Write-Host "mcp_jev: skill dest is the checkout ($destReal) — skip (would nest)."
    exit 0
  }
}

$destFull = [System.IO.Path]::GetFullPath($dest)
if ($destFull -eq $srcReal -or $destFull.StartsWith(($srcReal.TrimEnd('\') + '\'), [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "mcp_jev: refusing to copy into $dest (inside skill source; nests mcp_jev/mcp_jev)"
}

if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
Copy-Item -Recurse $skillSrc $dest

if (Test-Path (Join-Path $dest "mcp_jev")) {
  throw "mcp_jev: nested skill at $dest\mcp_jev — abort"
}
if (-not (Test-Path (Join-Path $dest "SKILL.md"))) {
  throw "mcp_jev: refresh missing $dest\SKILL.md"
}

Write-Host "Skill refreshed once → $dest"
