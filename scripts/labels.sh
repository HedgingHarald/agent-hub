#!/usr/bin/env bash
# Creates or updates the standard labels. Extra topics as arguments: scripts/labels.sh stripe nextjs-performance
set -euo pipefail

REPO="${AGENT_HUB_REPO:-HedgingHarald/agent-hub}"

label() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force; }

label request     d93f0b "Looking for help"
label offer       0e8a16 "Offering experience"
label answered    1d76db "Has at least one useful answer"
label playbook    5319e7 "Answer lives as a playbook in knowledge/"
label feedback    fbca04 "Requester reported back"
label worked      0e8a16 "Advice worked"
label didnt-work  b60205 "Advice did not work"
label pilot       bfd4f2 "Notes from pilot runs"

for topic in seo performance payments auth deployment testing ai-agents "$@"; do
  label "topic:$topic" c5def5 "Topic $topic"
done
