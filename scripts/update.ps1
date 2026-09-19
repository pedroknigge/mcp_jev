# One-shot update: git pull + npm install + build. Preserves $HOME\.mcp_jev\.env.
$ErrorActionPreference = "Stop"

$configDir = if ($env:MCP_JEV_HOME) { $env:MCP_JEV_HOME } elseif ($env:MCP_JEV_CONFIG) { $env:MCP_JEV_CONFIG } else { Join-Path $HOME ".mcp_jev" }
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$homeFile = Join-Path $configDir "home"

if ($env:MCP_JEV_CHECKOUT) {
  $repoHome = $env:MCP_JEV_CHECKOUT
} elseif (Test-Path $homeFile) {
  $repoHome = (Get-Content -Raw $homeFile).Trim()
} elseif (Test-Path (Join-Path $scriptDir "..\package.json")) {
  $repoHome = (Resolve-Path (Join-Path $scriptDir "..")).Path
} else {
  $repoHome = Join-Path $HOME "mcp_jev"
}

if (-not (Test-Path $repoHome)) {
  throw "mcp_jev update: no checkout at $repoHome — run scripts/install.ps1 from https://github.com/pedroknigge/mcp_jev"
}

Write-Host "Updating $repoHome"
Write-Host "Key store $configDir\.env is not touched."

if (Test-Path (Join-Path $repoHome ".git")) {
  git -C $repoHome pull --ff-only
}

Push-Location $repoHome
try {
  npm install
  npm run build
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path (Join-Path $configDir "bin") | Out-Null
Set-Content -Path (Join-Path $configDir "home") -Value $repoHome -NoNewline
$wrapper = Join-Path $configDir "bin\mcp_jev.cmd"
@(
  "@echo off"
  "setlocal"
  "if defined MCP_JEV_HOME (set CFG=%MCP_JEV_HOME%) else if defined MCP_JEV_CONFIG (set CFG=%MCP_JEV_CONFIG%) else (set CFG=%USERPROFILE%\.mcp_jev)"
  "if defined MCP_JEV_CHECKOUT (set REPO=%MCP_JEV_CHECKOUT%) else if exist %CFG%\home (set /p REPO=<%CFG%\home) else (set REPO=%USERPROFILE%\mcp_jev)"
  "if exist %CFG%\.env for /f `"usebackq tokens=1,* delims==`" %%A in (`"%CFG%\.env`") do ("
  "  if not `"%%A`"==`"`" if not `"%%A:~0,1`"==`"#`" set `"%%A=%%B`""
  ")"
  "node `"%REPO%\dist\index.js`" %*"
) | Set-Content -Path $wrapper -Encoding ASCII

$refresh = Join-Path $scriptDir "refresh-skill.ps1"
if (Test-Path $refresh) {
  & $refresh $repoHome
}

Write-Host "Done. Restart your MCP host, then ping → list_packs."
Write-Host ""
Write-Host "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
Write-Host "SKILL REFRESH — one path only (already ran): ~/.agents/skills/mcp_jev"
Write-Host "Do not also copy the skill folder (nests mcp_jev/mcp_jev)."
Write-Host "Hosts that ignore ~/.agents/skills: re-add once after update:"
Write-Host ""
Write-Host "  npx skills add pedroknigge/mcp_jev --skill mcp_jev"
Write-Host ""
Write-Host "Description always starts with VERSION — (package.json)."
Write-Host "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
Write-Host "Docs: https://github.com/pedroknigge/mcp_jev"
