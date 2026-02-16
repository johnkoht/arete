#!/usr/bin/env bash
# Dev setup: copy runtime skills to .agents/skills and ensure workspace dirs exist.
# Run from repo root when developing Areté (tsx dev mode uses packages/runtime/, install uses .agents/skills).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/.agents/skills"
if [ -d "$ROOT/packages/runtime/skills" ]; then
  rsync -a --delete "$ROOT/packages/runtime/skills/" "$ROOT/.agents/skills/" 2>/dev/null || {
    cp -R "$ROOT/packages/runtime/skills/"* "$ROOT/.agents/skills/" 2>/dev/null || true
  }
  echo "Copied packages/runtime/skills to .agents/skills"
fi
# Optional: create workspace dirs for local dev testing
for d in context now goals projects people resources .cursor/rules .cursor/tools .cursor/integrations; do
  mkdir -p "$ROOT/$d"
done
echo "Dev setup done. .agents/skills ready for arete skill list / route."
