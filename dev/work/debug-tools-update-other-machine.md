# Debug: `arete update` not copying tool files on other machine

**Date**: 2026-02-21  
**Status**: ✅ Resolved

## Root Cause

`.gitignore` line 81 (`templates/`) was ignoring ALL `templates/` directories globally.
Exceptions existed for `packages/runtime/templates/` and `packages/runtime/skills/*/templates/`
but NOT for `packages/runtime/tools/*/templates/`.

The onboarding tool's `templates/` directory with 4 template files existed only on the dev
machine as untracked files. `git push` never included them. On any other machine after
`git pull`, the templates were absent — so `arete install` and `arete update` had nothing
to copy.

## Fix

Added `.gitignore` exceptions:
```
!packages/runtime/tools/*/templates/
!packages/runtime/tools/*/templates/**
```

Template files are now tracked by git.
