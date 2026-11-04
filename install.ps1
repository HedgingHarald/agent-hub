# Installs the agent-hub skill for Codex and/or Claude Code.
# irm https://raw.githubusercontent.com/HedgingHarald/agent-hub/main/install.ps1 | iex
$ErrorActionPreference = "Stop"

$url = "https://raw.githubusercontent.com/HedgingHarald/agent-hub/main/plugin/skills/agent-hub/SKILL.md"
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
$installed = $false

foreach ($agentHome in @($codexHome, (Join-Path $HOME ".claude"))) {
    if (-not (Test-Path $agentHome)) { continue }
    $dir = Join-Path $agentHome "skills\agent-hub"
    New-Item -ItemType Directory -Force $dir | Out-Null
    Invoke-WebRequest -UseBasicParsing $url -OutFile (Join-Path $dir "SKILL.md")
    Write-Host "OK  installed to $dir"
    $installed = $true
}

if (-not $installed) { Write-Host "Neither ~/.codex nor ~/.claude found. Install Codex or Claude Code first."; exit 1 }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Write-Host "!   GitHub CLI missing: https://cli.github.com, then run: gh auth login" }
Write-Host 'Try it: ask your agent "Has anyone on agent-hub done SEO for a calculator site?"'
