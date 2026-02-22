---
title: Onboard + Setup Unification
slug: onboard-setup-unification
status: draft
size: small
tags: [cli, onboarding, dx]
created: 2026-02-21T17:55:00Z
updated: 2026-02-21T17:55:00Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

# Onboard + Setup Unification

## Problem

The post-install CLI flow has too many steps:

```
arete install my-project
cd my-project
arete onboard      ← identity only
arete setup        ← just prints a menu of other commands
```

`arete setup` is thin — it prints integration command names, nothing more. There's no reason a user should have to discover and run those commands separately. And `arete onboard` exits early on rerun instead of letting you update your config.

## Goal

Make `arete onboard` the single post-install command. It handles:
1. Identity (name, email, company, website)
2. Integration setup (calendar, Fathom, Krisp) — each skippable

Safe to rerun: pre-fills existing values, skips already-configured integrations (or offers to reconfigure).

Retire `arete setup`.

Update `arete install` next steps copy to reflect the new two-step flow.

---

## What Changes

### 1. Upgrade `arete onboard` — identity phase (rerun-safe)

Current behavior: bails early if profile already exists.

New behavior:
- Read existing `context/profile.md` if present
- Pre-fill prompts with existing values (show current value, user can edit or press enter to keep)
- Write updated profile on completion

### 2. Upgrade `arete onboard` — integration phase

After identity questions, prompt for each integration with a y/N default:

**Calendar:**
- "Set up calendar integration? (y/N)"
- If yes: fetch available calendars via ical-buddy, present checkbox list, let user select (or "all")
- Skip if already configured and user doesn't opt to reconfigure

**Fathom:**
- "Set up Fathom (meeting recordings)? (y/N)"
- If yes: prompt for API key, validate, save
- Skip if already configured

**Krisp:**
- "Set up Krisp? (y/N)"
- If yes: invoke `KrispMcpClient.configure()` as today
- Skip if already configured

Each integration shows current status if already configured:
```
Calendar [active] — reconfigure? (y/N)
```

### 3. Update `install.ts` next steps copy

From:
```
1. cd my-project
2. arete onboard   ← set up your profile
3. arete setup     ← configure integrations (optional)
4. Say "Let's get started" in chat
```

To:
```
1. cd my-project
2. arete onboard   ← set up your profile and integrations
3. Say "Let's get started" in chat
```

### 4. Retire `arete setup`

- Remove `setup.ts` command registration
- If someone runs `arete setup`, either remove the command entirely or print a deprecation message pointing to `arete onboard`

---

## Files Touched

| File | Change |
|------|--------|
| `packages/cli/src/commands/onboard.ts` | Identity rerun-safety + integration prompts |
| `packages/cli/src/commands/install.ts` | Update next steps copy |
| `packages/cli/src/commands/setup.ts` | Retire (remove or deprecate) |
| `packages/cli/src/index.ts` | Remove setup command registration |
| `packages/cli/test/commands/onboard.test.ts` | Update/expand tests |
| `packages/cli/test/commands/setup.test.ts` | Remove or update tests |

---

## Key Decisions

- **Rerun behavior**: Pre-fill and allow editing, don't blow away existing config
- **Integration defaults**: All default to `N` (skip) — integrations are optional, don't pressure
- **Already-configured integrations**: Show `[active]` status, default to `N` for reconfigure
- **Fathom**: Currently `integration configure fathom` has no prompts (just marks active). Will need to determine if Fathom needs an API key captured via CLI or if it's config-only. Investigate before building.
- **`arete setup` retirement**: Remove cleanly rather than alias — keep the CLI surface small

---

## Open Questions

1. **Fathom config**: Does Fathom need an API key or credential captured at the CLI level, or is it purely workspace config? Need to check `services.integrations.configure` for fathom to understand what it actually persists.
2. **Calendar interactive prompt**: The current `integration configure calendar` has no interactive prompts — only CLI flags (`--calendars`, `--all`). We'll need to add an ical-buddy calendar list + checkbox picker inside onboard. Confirm ical-buddy is available before showing that prompt.

---

## Relationship to the Onboarding Skill

The `onboarding` skill (in-agent, `packages/runtime/skills/onboarding/SKILL.md`) is explicitly aware of the CLI command. It checks whether `context/profile.md` exists with real values — if so, it skips Q0 (identity) and jumps straight to data sources and context bootstrap.

The CLI command is the pre-IDE bootstrap. The skill is the deep in-agent onboarding. They are a two-stage handoff, not alternatives.

**Constraint**: The unified `arete onboard` must continue producing `context/profile.md` in the exact format the skill expects. Don't change the frontmatter schema or field names without updating the skill's detection logic.

> ⚠️ **Before finalizing this plan**: The onboarding skill is being updated. Pull in those changes and review them before building — the skill's identity detection logic and handoff contract may change, which affects what `arete onboard` needs to produce.

---

## Out of Scope

- `arete init` (wrapping install + onboard) — discussed, deferred. `install` naming is already correct (analogous to `git init` scaffolding). Not worth the added surface.
- Conversational/in-agent onboarding — separate plan (`onboarding-mvp`)
- Adding new integrations to the onboard flow
