# One-shot install (Windows): clone or pull, build, store the TypeSafe key once, print host snippets.
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

if (-not $env:MCP_JEV_INSTALL_SKIP_GIT) {
  if (Test-Path (Join-Path $repoHome ".git")) {
    Write-Host "Updating existing clone…"
    git -C $repoHome pull --ff-only
  } elseif ((Test-Path $repoHome) -and (Test-Path (Join-Path $repoHome "package.json"))) {
    Write-Host "Using existing directory (not a git clone)."
  } else {
    Write-Host "Cloning…"
    git clone $repoUrl $repoHome
  }
} else {
  Write-Host "Skipping git (MCP_JEV_INSTALL_SKIP_GIT=1)."
}

if (-not $env:MCP_JEV_INSTALL_SKIP_BUILD) {
  Write-Host "npm install && npm run build"
  Push-Location $repoHome
  try {
    npm install
    npm run build
  } finally {
    Pop-Location
  }
} else {
  Write-Host "Skipping npm install/build (MCP_JEV_INSTALL_SKIP_BUILD=1)."
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
$ready = $true
if ($env:TYPESAFE_API_KEY) {
  $env:MCP_JEV_HOME = $configDir
  node (Join-Path $repoHome "dist\index.js") config set-key $env:TYPESAFE_API_KEY
  Remove-Item -ErrorAction SilentlyContinue (Join-Path $configDir "NOT_READY")
} elseif ((Test-Path $envFile) -and (Select-String -Path $envFile -Pattern "^TYPESAFE_API_KEY=.+" -Quiet)) {
  Write-Host "Keeping existing key in $envFile"
  Remove-Item -ErrorAction SilentlyContinue (Join-Path $configDir "NOT_READY")
} else {
  Write-Host ""
  Write-Host "Set your TypeSafe key ONCE (https://console.typesafe.ai). Any agent that attaches this MCP reuses it."
  Write-Host "Host mcp.json stays keyless."
  $interactive = $false
  try { $interactive = [Environment]::UserInteractive -and $Host.Name -ne "ServerRemoteHost" } catch { $interactive = $false }
  if ($interactive) {
    $env:MCP_JEV_HOME = $configDir
    node (Join-Path $repoHome "dist\index.js") config set-key
    Remove-Item -ErrorAction SilentlyContinue (Join-Path $configDir "NOT_READY")
  } else {
    $ready = $false
    $marker = Join-Path $configDir "NOT_READY"
    @"
NOT_READY

mcp_jev finished the checkout and wrapper, but no TypeSafe key is stored.
Host configs must stay keyless. Do not paste TYPESAFE_API_KEY into chat or mcp.json.

Next step:
  `$env:MCP_JEV_HOME='$configDir'; node `"$repoHome\dist\index.js`" config set-key

Then:
  `$env:MCP_JEV_HOME='$configDir'; node `"$repoHome\dist\index.js`" doctor
"@ | Set-Content -Path $marker -Encoding UTF8
    Write-Host ""
    Write-Host "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    Write-Host "NOT_READY: non-interactive install without a TypeSafe key."
    Write-Host "Wrote $marker"
    Write-Host "Next: `$env:MCP_JEV_HOME='$configDir'; node `"$repoHome\dist\index.js`" config set-key"
    Write-Host "Then: mcp_jev doctor"
    Write-Host "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  }
}

$env:MCP_JEV_HOME = $configDir
$cli = Join-Path $repoHome "dist\index.js"
if (Test-Path $cli) {
  Write-Host ""
  node $cli hosts print
}

if ($env:MCP_JEV_WRITE_HOSTS) {
  Write-Host ""
  Write-Host "Writing keyless host snippets (MCP_JEV_WRITE_HOSTS=$($env:MCP_JEV_WRITE_HOSTS))…"
  node $cli hosts write $env:MCP_JEV_WRITE_HOSTS
} else {
  Write-Host ""
  Write-Host "Non-interactive host write skipped unless MCP_JEV_WRITE_HOSTS is set."
}

$refresh = Join-Path $scriptDir "refresh-skill.ps1"
if (Test-Path $refresh) {
  & $refresh $repoHome
}

Write-Host ""
Write-Host "Then: mcp_jev doctor → restart the MCP host → ping → list_packs"
Write-Host "Update later (GitHub checkout, not npm):  $repoHome\scripts\update.ps1"
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
Write-Host "Do not put the key in chat or in mcp.json."

try {
  $wrapperJson = $wrapper.Replace("\", "/")
  Set-Clipboard -Value "{ `"mcpServers`": { `"mcp_jev`": { `"command`": `"$wrapperJson`" } } }"
  Write-Host "Copied Cursor JSON to the clipboard."
} catch {
  # clipboard may be unavailable
}

if (-not $ready) {
  exit 2
}
