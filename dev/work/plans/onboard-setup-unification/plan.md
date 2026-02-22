---
status: building
size: medium
created: 2026-02-22
updated: 2026-02-22T21:20:04.480Z
tags: []
has_prd: true
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

## Decisions (resolved)

- **Dependency**: Add `@inquirer/prompts` (tree-shakeable v2 package) to `packages/cli`. Use for calendar checkbox picker, confirm prompts, and input with defaults. Update LEARNINGS.md to reflect this is now the real dependency (not the monolithic `inquirer`).
- **Fathom**: Prompt inline for API key paste, write to `.credentials/credentials.yaml` under `fathom.api_key`, mark integration active. URL: `https://fathom.video/customize`. No API key validation in this phase.
- **Rerun behavior**: Pre-fill and allow editing, don't blow away existing config.
- **Integration defaults**: All default to `N` (skip) — integrations are optional, don't pressure.
- **Already-configured integrations**: Show `[active]` status, default to `N` for reconfigure.
- **`arete setup` retirement**: Remove cleanly — keep the CLI surface small.

---

## Plan

### 1. Add `@inquirer/prompts` dependency

Add `@inquirer/prompts` to `packages/cli/package.json`. Verify it works with NodeNext module resolution and ESM setup.

**AC**: `npm run typecheck` passes. Import of `@inquirer/prompts` resolves correctly.

### 2. Add `listIcalBuddyCalendars()` to core

Create a `listIcalBuddyCalendars()` function in `packages/core/src/integrations/calendar/ical-buddy.ts` that:
- Runs `icalBuddy calendars`
- Parses output: filters lines starting with `• `, strips prefix
- Returns `string[]` of calendar names
- Returns empty array if icalBuddy is not available

Add fixture-based unit test in `packages/core/test/integrations/calendar.test.ts`.

**AC**: Function returns clean calendar names from fixture data. Handles missing icalBuddy gracefully (empty array, no throw).

### 3. Upgrade `arete onboard` — identity phase (rerun-safe)

Replace the current bail-early behavior with rerun-safe prompts:
- Read existing `context/profile.md` if present, parse frontmatter
- Use `@inquirer/prompts` `input()` with `default` set to existing values
- User can edit or press enter to keep current value
- Write updated profile on completion (same format as today)
- Preserve the `--json` + `--name/--email/--company` non-interactive path

**AC**: 
- First run: prompts for all fields, creates profile
- Second run: shows current values as defaults, enter keeps them, typing replaces
- `--json` mode unchanged
- Profile format identical to current (frontmatter schema preserved)

### 4. Upgrade `arete onboard` — integration phase

After identity, present integration prompts:

**Calendar (macOS only):**
- Always show the calendar prompt: "Set up calendar integration? (y/N)"
- If yes: check if icalBuddy is available
  - If **not available**: print install instructions (`brew install ical-buddy`) and "Then rerun: `arete onboard`", continue to next integration
  - If **available**: checkbox picker of available calendars (+ "All calendars" option), `pageSize: 12`
- Write calendar config via `services.integrations.configure()`
- If already active: "Calendar [active] — reconfigure? (y/N)" defaulting to N

**Fathom:**
- "Set up Fathom (meeting recordings)? (y/N)"
- If yes: print "Get your API key from https://fathom.video/customize", prompt "Paste your Fathom API key:"
- Write key to `.credentials/credentials.yaml` under `fathom.api_key`
- Mark integration active via `services.integrations.configure()`
- If already active: "Fathom [active] — reconfigure? (y/N)" defaulting to N

**Krisp:**
- "Set up Krisp (meeting recordings)? (y/N)"
- If yes: invoke `KrispMcpClient.configure()` with 120s timeout
- If timeout: print friendly fallback message, continue flow
- If already active: "Krisp [active] — reconfigure? (y/N)" defaulting to N

Add CLI flags for non-interactive testing: `--skip-integrations`, `--calendar`, `--fathom-key <key>`, `--skip-krisp`.

**AC**:
- Each integration skippable independently
- Already-configured shows [active] status
- Calendar prompt always shown; missing icalBuddy prints install instructions and continues
- Fathom key written to credentials.yaml
- Krisp has timeout protection
- Non-interactive flags work for testing

### 5. Update `install.ts` next steps copy

Change from 4-step to 3-step post-install instructions:

```
1. cd my-project
2. arete onboard   ← set up your profile and integrations
3. Say "Let's get started" in chat
```

**AC**: `arete install` output shows 3 steps, no mention of `arete setup`.

### 6. Retire `arete setup` + doc sweep

- Delete `packages/cli/src/commands/setup.ts`
- Remove import and registration from `packages/cli/src/index.ts`
- Remove or update `packages/cli/test/commands/setup.test.ts`
- Update all doc references:
  - `ONBOARDING.md` L84: change `arete setup` → `arete onboard`
  - `packages/runtime/GUIDE.md` L144: update to reference `arete onboard`
  - `packages/cli/src/commands/LEARNINGS.md`: update references from `arete setup` to `arete onboard` (UX pattern references)
- Verify: `rg "arete setup" --type md` returns zero hits in non-plan files

**AC**: 
- `setup.ts` deleted, no import in `index.ts`
- `rg "arete setup"` finds no references outside `dev/work/plans/` (plan history is fine)
- All user-facing docs point to `arete onboard`

### 7. Tests

- Update `packages/cli/test/commands/onboard.test.ts`:
  - Rerun with existing profile: values preserved
  - Rerun with existing profile: values updated when changed
  - Integration skip via flags
  - Fathom key written to credentials.yaml
  - Missing icalBuddy: prints install instructions, continues flow
  - `--json` mode still works
- Remove `packages/cli/test/commands/setup.test.ts` (if it exists)

**AC**: `npm run typecheck` && `npm test` pass. All new test cases pass.

---

## Files Touched

| File | Change |
|------|--------|
| `packages/cli/package.json` | Add `@inquirer/prompts` |
| `packages/core/src/integrations/calendar/ical-buddy.ts` | Add `listIcalBuddyCalendars()` |
| `packages/core/test/integrations/calendar.test.ts` | Fixture test for calendar listing |
| `packages/cli/src/commands/onboard.ts` | Identity rerun-safety + integration prompts |
| `packages/cli/src/commands/install.ts` | Update next steps copy |
| `packages/cli/src/commands/setup.ts` | **Delete** |
| `packages/cli/src/index.ts` | Remove setup import + registration |
| `packages/cli/test/commands/onboard.test.ts` | Expand tests |
| `packages/cli/test/commands/setup.test.ts` | **Delete** |
| `ONBOARDING.md` | Update `arete setup` → `arete onboard` |
| `packages/runtime/GUIDE.md` | Update integration setup reference |
| `packages/cli/src/commands/LEARNINGS.md` | Update UX pattern references |

---

## Relationship to the Onboarding Skill

The `onboarding` skill (in-agent, `packages/runtime/skills/onboarding/SKILL.md`) checks `context/profile.md` for real values — if found, it skips Q0 (identity). The CLI command is pre-IDE bootstrap; the skill is deep in-agent onboarding. Two-stage handoff, not alternatives.

**Constraint**: Profile format (`name`, `email`, `company`, `website`, `created` frontmatter) must be preserved exactly.

**Note**: The skill's Path C tells users to run `arete integration configure calendar` — this still works (standalone command isn't removed), but the onboard flow is now the primary path. Consider updating the skill in a follow-up.

---

## Out of Scope

- `arete init` (wrapping install + onboard) — deferred
- Conversational/in-agent onboarding — separate plan (`onboarding-mvp`)
- Adding new integrations to the onboard flow
- Fathom API key validation (see Future Work)
- Updating the onboarding skill's Path C references

---

## Future Work / Backlog Candidates

- **Fathom API key validation**: After saving the key, make a lightweight `GET /api/recordings?limit=1` call to verify it works. Warn but don't block if validation fails (network issues, API down).
- **Onboarding skill Path C update**: Update skill to check integration status before suggesting standalone CLI commands.
