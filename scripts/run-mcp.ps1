# Load the one-time user store, then exec the stdio MCP server.
# Do not Write-Host anything to stdout — that breaks MCP.
$ErrorActionPreference = "Stop"
$configDir = if ($env:MCP_JEV_CONFIG) { $env:MCP_JEV_CONFIG } else { Join-Path $HOME ".mcp_jev" }
$repo = $env:MCP_JEV_HOME
$homeFile = Join-Path $configDir "home"
if (-not $repo -and (Test-Path $homeFile)) {
  $repo = (Get-Content -Raw $homeFile).Trim()
}
if (-not $repo) {
  $here = Split-Path -Parent $MyInvocation.MyCommand.Path
  $candidate = Resolve-Path (Join-Path $here "..")
  if (Test-Path (Join-Path $candidate "dist\index.js")) {
    $repo = $candidate.Path
  } else {
    $repo = Join-Path $HOME "mcp_jev"
  }
}
$envFile = Join-Path $configDir ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $i = $line.IndexOf("=")
      $name = $line.Substring(0, $i).Trim()
      $value = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}
$entry = Join-Path $repo "dist\index.js"
if (-not (Test-Path $entry)) {
  [Console]::Error.WriteLine("mcp_jev: missing $entry — run scripts/install.ps1 from https://github.com/pedroknigge/mcp_jev")
  exit 1
}
$node = Get-Command node -ErrorAction Stop
& $node.Source $entry @args
exit $LASTEXITCODE
