# PRD: Onboard + Setup Unification

**Version**: 1.0
**Status**: Ready
**Date**: 2026-02-22
**Branch**: `feature/onboard-setup-unification`

---

## 1. Problem & Goals

### Problem

The post-install CLI flow has too many steps and too much friction:

```
arete install my-project
cd my-project
arete onboard      ← identity only
arete setup        ← just prints a menu of other commands
```

- `arete setup` is a thin passthrough — it prints integration command names, nothing more. Users must discover and run `arete integration configure <name>` separately for each integration.
- `arete onboard` bails early on rerun (`Profile already exists at context/profile.md`) instead of letting users update their config.
- The Fathom integration has `auth.type: 'api_key'` in the registry but no CLI prompt to collect the key — `configure fathom` just marks it "active" without credentials.

### Goals

1. **Single post-install command**: `arete onboard` handles identity + integration setup in one flow.
2. **Rerun-safe**: Pre-fills existing values, lets users update. Already-configured integrations show `[active]` status and default to skip.
3. **Retire `arete setup`**: Remove the command, update all docs referencing it.
4. **Calendar picker**: Interactive checkbox for calendar selection when icalBuddy is available; install instructions when it's not.
5. **Fathom key capture**: Inline prompt for API key, saved to `.credentials/credentials.yaml`.

### Out of Scope

- `arete init` (wrapping install + onboard) — deferred
- Conversational/in-agent onboarding — separate plan (`onboarding-mvp`)
- Adding new integrations to the onboard flow
- Fathom API key validation against the Fathom API
- Updating the onboarding skill's Path C integration references
- Non-macOS calendar providers

---

## 2. Architecture Decisions

### Dependency: `@inquirer/prompts`

Add `@inquirer/prompts` (tree-shakeable v2, ESM-compatible) to `packages/cli`. This replaces the current `readline/promises` for interactive prompts, providing:
- `input()` with editable defaults (for rerun-safe identity)
- `confirm()` for y/N integration prompts
- `checkbox()` for calendar multi-select with `pageSize: 12`

The LEARNINGS.md reference to `inquirer` describes an aspiration — the CLI has never had it. This PR adds the real dependency.

### Calendar Listing: `listIcalBuddyCalendars()`

A new exported function in `packages/core/src/integrations/calendar/ical-buddy.ts`:
- Shells out to `icalBuddy calendars`
- Parses multi-line output (LEARNINGS warns: lines starting with `• ` are names; following lines are metadata)
- Returns `string[]` of clean calendar names
- Returns `{ available: false, calendars: [] }` when icalBuddy is not installed

### Fathom Credential Storage

Follows the existing Krisp pattern: write to `.credentials/credentials.yaml` under the `fathom.api_key` key. `loadFathomApiKey()` in `packages/core/src/integrations/fathom/client.ts` already reads from this location — no reader changes needed.

### Profile Format Contract

The onboarding skill (`packages/runtime/skills/onboarding/SKILL.md`) checks `context/profile.md` for real values vs `[Your name]` placeholders. The profile frontmatter schema (`name`, `email`, `company`, `website`, `created`) must be preserved exactly.

---

## 3. Tasks

### Task A: Add `@inquirer/prompts` dependency

**Description**: Add `@inquirer/prompts` to `packages/cli/package.json`. Verify ESM/NodeNext compatibility.

**Files**: `packages/cli/package.json`

**Acceptance Criteria**:
- [ ] `@inquirer/prompts` added to dependencies
- [ ] `npm install` succeeds
- [ ] `npm run typecheck` passes
- [ ] A test import of `input`, `confirm`, `checkbox` from `@inquirer/prompts` resolves correctly

---

### Task B: Add `listIcalBuddyCalendars()` to core

**Description**: Create a function to list available macOS calendars by parsing `icalBuddy calendars` output. Export from the calendar module.

**Files**:
- `packages/core/src/integrations/calendar/ical-buddy.ts` — add function + export
- `packages/core/src/integrations/calendar/index.ts` — re-export
- `packages/core/test/integrations/calendar.test.ts` — fixture-based tests

**Acceptance Criteria**:
- [ ] `listIcalBuddyCalendars()` returns `{ available: boolean, calendars: string[] }`
- [ ] Parses `icalBuddy calendars` output correctly: filters `• `-prefixed lines, strips prefix, ignores metadata lines
- [ ] Returns `{ available: false, calendars: [] }` when icalBuddy binary is not found (no throw)
- [ ] Unit test with fixture data covering: multiple calendars, metadata lines, empty output, missing binary
- [ ] Exported from `packages/core/src/integrations/calendar/index.ts`

**Key Reference**: `packages/core/src/integrations/LEARNINGS.md` — icalBuddy output parsing gotchas

---

### Task C: Upgrade `arete onboard` — identity phase (rerun-safe)

**Description**: Replace the current bail-early behavior with rerun-safe prompts using `@inquirer/prompts`.

**Files**:
- `packages/cli/src/commands/onboard.ts`

**Acceptance Criteria**:
- [ ] If `context/profile.md` exists with real values, parse frontmatter and pre-fill prompts
- [ ] Uses `@inquirer/prompts` `input()` with `default` set to existing values
- [ ] Press enter keeps current value; typing replaces it
- [ ] First run (no profile): prompts for name, email, company, website
- [ ] Profile written in exact same format as current (frontmatter: `name`, `email`, `company`, `website`, `created`)
- [ ] `--json` + `--name/--email/--company` non-interactive path preserved and unchanged
- [ ] Domain extraction logic preserved (email domain, website domain → `domain-hints.md`)

**Depends on**: Task A

---

### Task D: Upgrade `arete onboard` — integration phase

**Description**: After identity, present skippable integration prompts for Calendar, Fathom, and Krisp.

**Files**:
- `packages/cli/src/commands/onboard.ts`

**Acceptance Criteria**:

**Calendar:**
- [ ] Always shows calendar prompt: "Set up calendar integration? (y/N)" — defaults to N
- [ ] If yes + icalBuddy **not available**: prints `brew install ical-buddy` instructions and "Then rerun: arete onboard", continues to next integration
- [ ] If yes + icalBuddy **available**: shows checkbox picker of calendars + "All calendars" option, `pageSize: 12`
- [ ] Writes calendar config via `services.integrations.configure()` with `provider: 'macos'`
- [ ] If already active: shows "Calendar [active] — reconfigure? (y/N)" defaulting to N

**Fathom:**
- [ ] Shows "Set up Fathom (meeting recordings)? (y/N)" — defaults to N
- [ ] If yes: prints "Get your API key from https://fathom.video/customize", prompts "Paste your Fathom API key:"
- [ ] Writes key to `.credentials/credentials.yaml` under `fathom.api_key` (read-modify-write, preserve existing keys)
- [ ] Marks integration active via `services.integrations.configure()`
- [ ] If already active: shows "Fathom [active] — reconfigure? (y/N)" defaulting to N

**Krisp:**
- [ ] Shows "Set up Krisp (meeting recordings)? (y/N)" — defaults to N
- [ ] If yes: invokes `KrispMcpClient.configure()` with 120-second timeout
- [ ] If timeout: prints friendly message ("Krisp setup timed out — configure later with `arete integration configure krisp`"), continues flow
- [ ] If already active: shows "Krisp [active] — reconfigure? (y/N)" defaulting to N

**Non-interactive flags:**
- [ ] `--skip-integrations` skips the entire integration phase
- [ ] `--fathom-key <key>` sets Fathom key without prompt
- [ ] `--calendar` with `--calendars <list>` configures calendar without prompt
- [ ] All flags work with `--json` mode

**Depends on**: Tasks A, B, C

---

### Task E: Update `install.ts` next steps + retire `arete setup` + doc sweep

**Description**: Update install output, remove setup command, sweep all doc references.

**Files**:
- `packages/cli/src/commands/install.ts` — update next steps copy
- `packages/cli/src/commands/setup.ts` — **delete**
- `packages/cli/src/index.ts` — remove setup import + registration, update help text
- `ONBOARDING.md` — update `arete setup` → `arete onboard`
- `packages/runtime/GUIDE.md` — update integration setup reference
- `packages/cli/src/commands/LEARNINGS.md` — update UX pattern references from `arete setup` to `arete onboard`; note `@inquirer/prompts` is the real dependency

**Acceptance Criteria**:
- [ ] `arete install` next steps shows 3 steps (cd, onboard, chat) — no mention of `arete setup`
- [ ] `setup.ts` deleted
- [ ] `registerSetupCommand` import and call removed from `index.ts`
- [ ] Help text in `index.ts` no longer lists `setup`
- [ ] `ONBOARDING.md` references `arete onboard` not `arete setup`
- [ ] `packages/runtime/GUIDE.md` references `arete onboard` not `arete setup`
- [ ] `LEARNINGS.md` updated: UX pattern references use `arete onboard`, note `@inquirer/prompts` added
- [ ] `rg "arete setup" --type md` returns zero hits outside `dev/work/plans/`

**Depends on**: Task D (retire setup only after onboard handles integrations)

---

### Task F: Tests

**Description**: Expand onboard tests, remove setup tests, verify all quality gates.

**Files**:
- `packages/cli/test/commands/onboard.test.ts` — expand
- `packages/cli/test/commands/setup.test.ts` — **delete** (if exists)

**Acceptance Criteria**:
- [ ] Test: first run creates profile with correct format (existing test, may need update)
- [ ] Test: rerun with existing profile — values preserved when using `--json` + same flags
- [ ] Test: rerun with existing profile — values updated when different flags passed
- [ ] Test: `--skip-integrations` skips integration phase
- [ ] Test: `--fathom-key <key>` writes key to `.credentials/credentials.yaml`
- [ ] Test: `--json` mode returns complete output including integration status
- [ ] Test: domain extraction still works (existing tests preserved)
- [ ] `setup.test.ts` removed
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (full suite)

**Depends on**: Tasks C, D, E

---

## 4. Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| `@inquirer/prompts` ESM/NodeNext incompatibility | Task A validates before any code depends on it |
| icalBuddy output parsing breaks on unexpected format | Fixture-based tests in Task B; graceful fallback (empty array) |
| Profile format change breaks onboarding skill | Task C AC explicitly requires identical format; test verifies |
| Fathom credentials.yaml write corrupts existing keys | Read-modify-write pattern; test with pre-existing Krisp keys |
| Krisp OAuth hangs onboard flow | 120s timeout in Task D; friendly fallback message |
| `arete setup` references left in docs | Task E includes `rg` verification as AC |
| Interactive prompts untestable | CLI flags (`--skip-integrations`, `--fathom-key`, `--calendar`) enable non-interactive testing |

---

## 5. Future Work

- **Fathom API key validation**: Lightweight `GET /api/recordings?limit=1` to verify key works. Warn but don't block.
- **Onboarding skill Path C update**: Check integration status before suggesting standalone CLI commands.
