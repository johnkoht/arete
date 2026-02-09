#!/usr/bin/env bash
# Dev setup: copy runtime skills to .agents/skills and ensure workspace dirs exist.
# Run from repo root when developing Areté (tsx dev mode uses runtime/, install uses .agents/skills).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/.agents/skills"
if [ -d "$ROOT/runtime/skills" ]; then
  rsync -a --delete "$ROOT/runtime/skills/" "$ROOT/.agents/skills/" 2>/dev/null || {
    cp -R "$ROOT/runtime/skills/"* "$ROOT/.agents/skills/" 2>/dev/null || true
  }
  echo "Copied runtime/skills to .agents/skills"
fi
# Optional: create workspace dirs for local dev testing
for d in context now goals projects people resources .cursor/rules .cursor/tools .cursor/integrations; do
  mkdir -p "$ROOT/$d"
done
echo "Dev setup done. .agents/skills ready for arete skill list / route."
