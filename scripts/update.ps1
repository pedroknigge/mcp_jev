# One-shot update: git pull + npm install + build. Preserves $HOME\.mcp_jev\.env.
$ErrorActionPreference = "Stop"

$configDir = if ($env:MCP_JEV_CONFIG) { $env:MCP_JEV_CONFIG } else { Join-Path $HOME ".mcp_jev" }
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$homeFile = Join-Path $configDir "home"

if ($env:MCP_JEV_HOME) {
  $repoHome = $env:MCP_JEV_HOME
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
  "if defined MCP_JEV_CONFIG (set CFG=%MCP_JEV_CONFIG%) else (set CFG=%USERPROFILE%\.mcp_jev)"
  "if defined MCP_JEV_HOME (set REPO=%MCP_JEV_HOME%) else if exist %CFG%\home (set /p REPO=<%CFG%\home) else (set REPO=%USERPROFILE%\mcp_jev)"
  "if exist %CFG%\.env for /f `"usebackq tokens=1,* delims==`" %%A in (`"%CFG%\.env`") do ("
  "  if not `"%%A`"==`"`" if not `"%%A:~0,1`"==`"#`" set `"%%A=%%B`""
  ")"
  "node `"%REPO%\dist\index.js`" %*"
) | Set-Content -Path $wrapper -Encoding ASCII

Write-Host "Done. Restart your MCP host, then ping → list_packs."
Write-Host "Docs: https://github.com/pedroknigge/mcp_jev"
