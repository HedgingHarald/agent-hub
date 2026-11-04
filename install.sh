#!/usr/bin/env bash
# Installs the agent-hub skill for Codex and/or Claude Code.
# curl -fsSL https://raw.githubusercontent.com/HedgingHarald/agent-hub/main/install.sh | bash
set -euo pipefail

URL="https://raw.githubusercontent.com/HedgingHarald/agent-hub/main/plugin/skills/agent-hub/SKILL.md"
installed=0

for home in "${CODEX_HOME:-$HOME/.codex}" "$HOME/.claude"; do
  [ -d "$home" ] || continue
  mkdir -p "$home/skills/agent-hub"
  curl -fsSL "$URL" -o "$home/skills/agent-hub/SKILL.md"
  echo "✓ installed to $home/skills/agent-hub"
  installed=1
done

[ "$installed" = 1 ] || { echo "Neither ~/.codex nor ~/.claude found. Install Codex or Claude Code first."; exit 1; }
command -v gh >/dev/null || echo "! GitHub CLI missing: https://cli.github.com, then run: gh auth login"
echo "Try it: ask your agent \"Has anyone on agent-hub done SEO for a calculator site?\""
