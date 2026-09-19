# One-shot install (Windows): clone or pull, build, store the TypeSafe key once, print host JSON.
$ErrorActionPreference = "Stop"

$repoUrl = if ($env:MCP_JEV_REPO) { $env:MCP_JEV_REPO } else { "https://github.com/pedroknigge/mcp_jev.git" }
# MCP_JEV_HOME = user config dir (key + wrapper). Default ~/.mcp_jev
$configDir = if ($env:MCP_JEV_HOME) { $env:MCP_JEV_HOME } elseif ($env:MCP_JEV_CONFIG) { $env:MCP_JEV_CONFIG } else { Join-Path $HOME ".mcp_jev" }
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..") -ErrorAction SilentlyContinue
$homeRecord = Join-Path $configDir "home"

if ($env:MCP_JEV_CHECKOUT) {
  $repoHome = $env:MCP_JEV_CHECKOUT
} elseif ($repoRoot -and (Test-Path (Join-Path $repoRoot "package.json"))) {
  $pkg = Get-Content (Join-Path $repoRoot "package.json") -Raw
  if ($pkg -match '"name":\s*"mcp_jev"') { $repoHome = $repoRoot.Path } else { $repoHome = Join-Path $HOME "mcp_jev" }
} elseif (Test-Path $homeRecord) {
  $repoHome = (Get-Content -Raw $homeRecord).Trim()
} else {
  $repoHome = Join-Path $HOME "mcp_jev"
}

function Need($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "mcp_jev install: missing '$name'. Install Node 20+ and git, then retry."
  }
}

Need git
Need node
Need npm

$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 20) { throw "Node 20+ required (found $(node -v))." }

Write-Host "Repo:    $repoHome"
Write-Host "Config:  $configDir"
Write-Host "Source:  $repoUrl"

if (Test-Path (Join-Path $repoHome ".git")) {
  Write-Host "Updating existing clone…"
  git -C $repoHome pull --ff-only
} elseif ((Test-Path $repoHome) -and (Test-Path (Join-Path $repoHome "package.json"))) {
  Write-Host "Using existing directory (not a git clone)."
} else {
  Write-Host "Cloning…"
  git clone $repoUrl $repoHome
}

Write-Host "npm install && npm run build"
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

$envFile = Join-Path $configDir ".env"
if ($env:TYPESAFE_API_KEY) {
  $env:MCP_JEV_HOME = $configDir
  node (Join-Path $repoHome "dist\index.js") config set-key $env:TYPESAFE_API_KEY
} elseif ((Test-Path $envFile) -and (Select-String -Path $envFile -Pattern "^TYPESAFE_API_KEY=.+" -Quiet)) {
  Write-Host "Keeping existing key in $envFile"
} else {
  Write-Host ""
  Write-Host "Set your TypeSafe key ONCE (https://console.typesafe.ai). Any agent that attaches this MCP reuses it."
  Write-Host "Host mcp.json stays keyless."
  if ($Host.UI.RawUI) {
    $env:MCP_JEV_HOME = $configDir
    node (Join-Path $repoHome "dist\index.js") config set-key
  } else {
    Write-Host "Non-interactive: re-run with `$env:TYPESAFE_API_KEY or:"
    Write-Host "  `$env:MCP_JEV_HOME='$configDir'; node `"$repoHome\dist\index.js`" config set-key"
  }
}

$wrapperJson = $wrapper.Replace("\", "/")
$json = @"
{
  "mcpServers": {
    "mcp_jev": {
      "command": "$wrapperJson"
    }
  }
}
"@

Write-Host ""
Write-Host "=== Cursor  (%USERPROFILE%\.cursor\mcp.json) ==="
Write-Host $json
Write-Host ""
Write-Host "=== Claude Desktop  (%APPDATA%\Claude\claude_desktop_config.json) ==="
Write-Host $json
Write-Host ""
Write-Host "Then: restart the MCP host → ping → list_packs"
Write-Host "Update later:  $repoHome\scripts\update.ps1"
Write-Host "Docs: https://github.com/pedroknigge/mcp_jev"
Write-Host "Do not put the key in chat or in mcp.json."

try {
  Set-Clipboard -Value $json
  Write-Host "Copied Cursor JSON to the clipboard."
} catch {
  # clipboard may be unavailable
}
