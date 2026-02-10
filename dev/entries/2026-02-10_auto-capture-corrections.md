# Auto-Capture Corrections Without Asking

**Date**: 2026-02-10

## What Changed

Updated rules so that when the builder corrects the agent, the agent **automatically** records the correction to memory and collaboration — without asking for permission. This prevents repeat mistakes and ensures institutional learning from corrections.

## Context: Incident That Triggered This

From transcript `6b8cda65-351e-476e-91bc-74f7faab8dab` (skills.sh evaluation session):

1. **First correction**: Agent put the enhancement backlog in `dev/entries/`. Builder corrected: entries = actions/decisions; backlog = future work → `dev/backlog/`.
2. **Second correction**: Agent moved to `dev/backlog/` but put the file in the root. Builder corrected: use subfolders — `dev/backlog/features/` for new capabilities, `dev/backlog/improvements/` for enhancements.

Two corrections in a row. The agent fixed each time but did not record the learnings for future sessions.

## Changes Made

1. **agent-memory.mdc** — New "Corrections: Auto-Capture Without Asking" section (BUILDER mode):
   - When builder corrects you: immediately add to entry Learnings + `dev/collaboration.md` Corrections section
   - Do not ask for permission
   - Format: `[What you did wrong] → [Correct approach]`
   - Multiple corrections each get recorded

2. **agent-memory.mdc** — Updated Transparency Rules:
   - "Corrections: auto-capture, no asking" — exceptions to the "ask before adding" rule

3. **dev.mdc** — Added backlog subfolder structure:
   - `dev/backlog/features/` — new capabilities
   - `dev/backlog/improvements/` — enhancements to existing functionality
   - Explicit: do not put files in `dev/backlog/` root

4. **dev/collaboration.md** — Populated Corrections section with the two corrections from the incident

## Learnings

- Corrections are high-value institutional memory. Capturing them automatically (without asking) ensures future agents benefit.
- No separate skill needed — this is a behavioral rule ("when corrected, do X") that belongs in the main prompts (agent-memory.mdc, dev.mdc).
- When a location or structure has subfolders, always check and use them; don't default to the parent.
