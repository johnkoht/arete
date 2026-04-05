# PRD: Onboarding Refresh

**Version**: 1.0  
**Status**: Ready  
**Date**: 2026-03-24  
**Branch**: `feature/onboarding-refresh-2026-03`  
**Source**: Fresh workspace setup testing (2026-03-24)

---

## 1. Problem & Goals

### Problem

Testing fresh Areté workspace setup revealed multiple UX issues:

1. **Outdated model defaults**: New workspaces get old AI model versions that may not exist
2. **Confusing messaging**: "Update Anthropic credentials?" prompt doesn't explain WHY Areté needs AI
3. **Missing file**: `agent-observations.md` isn't created on install, so session-start context injection fails
4. **Incomplete CLI onboarding**: `arete onboard` stops after AI credentials, requiring user to switch to conversation
5. **Broken skill**: getting-started skill delegates to CLI instead of helping directly, assumes ical-buddy without asking
6. **No session context**: Agents don't proactively read observations or week focus at conversation start

### Goals

1. **Phase 1 (Quick Fixes)**: Update model defaults, improve messaging, ensure agent-observations.md created
2. **Phase 2 (Overhaul)**: Both CLI and conversational onboarding provide complete, similar experiences
3. **Core Principle**: Users shouldn't need to switch between CLI and agent to complete onboarding

### Out of Scope

- Full self-guided onboarding with checkpoints (Phase 3 — deferred)
- Existing workspace migration (users can run `arete update`)
- Google Calendar OAuth flow changes (just document proper usage)
- Goals structure refactor (individual files vs quarter.md — current behavior works)

---

## 2. Architecture Decisions

### File Location

`agent-observations.md` is added to `DEFAULT_FILES` in `packages/core/src/workspace-structure.ts`, NOT `install.ts`. This ensures:
- Consistency with other default files
- `arete update` backfills missing file for existing users

### Multi-IDE Consistency

Rule changes must update BOTH:
- `packages/runtime/rules/cursor/agent-memory.mdc`
- `packages/runtime/rules/claude-code/agent-memory.mdc`

Verify with `diff` after changes.

### Model Name Format

Use `anthropic/` prefix for model names (matches existing codebase convention):
- `anthropic/claude-haiku-4-5`
- `anthropic/claude-sonnet-4-6`
- `anthropic/claude-opus-4-6`

---

## 3. User Stories / Tasks

### Phase 1: Quick Fixes

#### Task 1.1: Update Default AI Tiers

**Description**: Update outdated model names in onboard.ts to current versions.

**Files to modify**:
- `packages/cli/src/commands/onboard.ts` (lines 381-383 and 444-446)

**Acceptance Criteria**:
- [ ] Both DEFAULT_AI_CONFIG and API_KEY_AI_CONFIG use current model names
- [ ] Model names use `anthropic/` prefix format
- [ ] `npm run typecheck` passes
- [ ] Manual verification: `arete install && cat arete.yaml | grep tiers -A 5` shows correct models

---

#### Task 1.2: Improve Onboard Messaging

**Description**: Add context explaining WHY Areté needs AI credentials.

**Files to modify**:
- `packages/cli/src/commands/onboard.ts`

**Changes**:
1. Before AI setup section (around line 300), add info message:
   ```
   Areté embeds LLMs into your workflow — extracting decisions from meetings,
   building context for prep, and powering search across your workspace.
   ```
2. Change credential update prompt (line 282) from:
   - "Update Anthropic credentials?"
   - To: "Areté uses AI for meeting insights and intelligence. Update your Anthropic credentials?"

**Acceptance Criteria**:
- [ ] Info message appears before AI configuration section
- [ ] Credential prompt explains purpose
- [ ] `npm run typecheck` passes

---

#### Task 1.3: Add agent-observations.md to DEFAULT_FILES

**Description**: Ensure agent-observations.md is created on workspace install.

**Files to modify**:
- `packages/core/src/workspace-structure.ts`

**Add to DEFAULT_FILES** (after line ~200):
```typescript
'.arete/memory/items/agent-observations.md': `# Agent Observations

Observations about working with you. Agents add entries here when they notice
patterns, preferences, or corrections. These inform how agents collaborate with you.

---

<!-- Format: - [YYYY-MM-DD] [Observation] → [Implication] -->
`,
```

**Acceptance Criteria**:
- [ ] Entry added to `DEFAULT_FILES` object
- [ ] File created at correct path (`.arete/memory/items/agent-observations.md`)
- [ ] Fresh `arete install` creates the file with starter content
- [ ] `arete update` on existing workspace adds the file if missing
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

---

### Phase 2: Onboarding Overhaul

#### Task 2.0: Session-Start Context Injection

**Description**: Add rule section telling agents to read context at conversation start.

**Files to modify**:
- `packages/runtime/rules/cursor/agent-memory.mdc`
- `packages/runtime/rules/claude-code/agent-memory.mdc`

**Add new section** (after "## GUIDE Mode: Memory Architecture"):
```markdown
## Session Start (GUIDE Mode)

At the beginning of each conversation, proactively gather context:

1. **Read recent observations** — `.arete/memory/items/agent-observations.md` (last 5 entries)
   - Look for patterns, preferences, corrections that should inform this session

2. **Check current focus** — `now/week.md` (if exists)
   - What are this week's priorities and goals?

3. **Check urgent commitments** — Run `arete commitments list --due-this-week`
   - What's owed to others this week? What are others owed?

This ensures continuity without requiring explicit briefing. If files don't exist, skip gracefully.
```

**Acceptance Criteria**:
- [ ] Both rule files updated with identical content
- [ ] `diff packages/runtime/rules/cursor/agent-memory.mdc packages/runtime/rules/claude-code/agent-memory.mdc` shows no unexpected differences
- [ ] New session in fresh workspace → agent mentions week focus or observations if they exist

---

#### Task 2.1: CLI Onboard Enhancement

**Description**: Extend `arete onboard` to include integration setup, context prompts, and first win suggestion.

**Files to modify**:
- `packages/cli/src/commands/onboard.ts`

**New flow after AI credentials**:

1. **Calendar choice** (after AI section, before output):
   ```
   ? Would you like to connect a calendar?
     ○ Apple Calendar (syncs with macOS Calendar app)
     ○ Google Calendar (opens browser for auth)
     ○ Skip for now
   ```

2. **If Apple**: Run `services.integrations.configure(root, 'calendar', { provider: 'macos', calendars: [] })`
   - Use service method, not subprocess

3. **If Google**: 
   - Run Google OAuth flow (existing code in integration.ts)
   - After auth: configure with all calendars

4. **Basic context prompts** (optional, can skip):
   ```
   ? What does your company do? (1-2 sentences, or press Enter to skip)
   ? Who are your primary users? (or press Enter to skip)
   ```
   - If answered, write to `context/business-overview.md` and `context/users-personas.md`

5. **First win suggestion** (final output):
   ```
   ✓ Setup complete!
   
   Try one of these to get started:
     • "Prep for my next meeting" — get context on attendees
     • "Plan my week" — set priorities and focus
     • "Let's get started" — guided workspace setup
   ```

**Acceptance Criteria**:
- [ ] Calendar choice prompt appears after AI credentials
- [ ] Apple Calendar selection configures integration without subprocess
- [ ] Google Calendar selection runs OAuth then configures
- [ ] Skip option works and doesn't error
- [ ] Context prompts are optional (Enter to skip)
- [ ] First win suggestions displayed at end
- [ ] `--json` mode still works (no interactive prompts, skip new sections)
- [ ] `npm run typecheck` passes
- [ ] Integration tests: manual verification in fresh temp workspace

---

#### Task 2.2a: Getting-Started Skill — Structural Updates

**Description**: Update getting-started skill to reference current workspace structure.

**Files to modify**:
- `packages/runtime/skills/getting-started/SKILL.md`

**Changes**:
1. Remove references to "areas" (no longer used)
2. Update `now/` references:
   - Current: `now/` has multiple files
   - Correct: `now/scratchpad.md` only, with `now/week.md` and `now/today.md` for planning
3. Add note about week/daily planning skills

**Acceptance Criteria**:
- [ ] No references to "areas" remain
- [ ] `now/` structure correctly described
- [ ] Planning skills mentioned

---

#### Task 2.2b: Getting-Started Skill — Calendar Integration

**Description**: Update skill to offer calendar choice and run commands directly.

**Files to modify**:
- `packages/runtime/skills/getting-started/SKILL.md`

**Changes to Path C (Integration First)**:

Replace CLI delegation with agent execution:

**Old** (Path C):
```
Let's connect your integrations first, then add context.

  1. Run: arete integration configure calendar
  2. Then: arete pull calendar --days 7
```

**New** (Path C):
```
Let's connect your calendar. Which do you prefer?

1. **Apple Calendar** — Syncs with macOS Calendar app (iCloud, Google, Outlook via system sync)
2. **Google Calendar** — Direct connection via OAuth

(Reply with 1 or 2, or "skip" to continue without calendar)
```

**If user chooses Apple**:
- Agent runs: `arete integration configure apple-calendar --all`
- Then: `arete pull calendar --days 7`

**If user chooses Google**:
- Agent says: "I'll help you connect Google Calendar. Please run this command — it will open your browser for authorization:"
- Provide: `arete integration configure google-calendar`
- Wait for: "Let me know when you've completed the browser authorization"
- After confirmation: `arete pull calendar --days 7`

**Acceptance Criteria**:
- [ ] Calendar choice offered (Apple vs Google vs Skip)
- [ ] Apple path runs commands directly via bash
- [ ] Google path guides user through OAuth, waits for confirmation
- [ ] `--all` flag used to avoid interactive calendar selection
- [ ] Pull command runs after successful configuration

---

#### Task 2.2c: Getting-Started Skill — Discovery Questions

**Description**: Simplify discovery questions for faster onboarding.

**Files to modify**:
- `packages/runtime/skills/getting-started/SKILL.md`

**Changes**:
1. Reduce discovery to 3 focused questions (remove verbose options):
   - Q1: Data sources (calendar, recordings, docs, none)
   - Q2: Immediate need (meetings, strategy, research, explore)
   - Q3: Context readiness (ready, gathering, need time)

2. Streamline paths:
   - **Meeting-first**: Has calendar → configure → pull → meeting-prep
   - **Strategy-first**: Has docs → guided input → quarter-plan
   - **Explore**: None → workspace-tour → try a skill

**Acceptance Criteria**:
- [ ] Discovery questions are concise (not walls of text)
- [ ] Path routing is clear and deterministic
- [ ] Each path leads to a concrete "first win"

---

#### Task 2.3: Parity Verification

**Description**: Verify both CLI and agent paths cover the same ground.

**Files to verify**:
- `packages/cli/src/commands/onboard.ts`
- `packages/runtime/skills/getting-started/SKILL.md`

**Verification checklist**:

| Step | CLI (`arete onboard`) | Agent (getting-started) |
|------|----------------------|------------------------|
| Identity | ✓ | ✓ Q0 |
| AI credentials | ✓ | Check if configured |
| Calendar choice | ✓ (2.1) | ✓ (2.2b) |
| Calendar setup | ✓ (2.1) | ✓ (2.2b) |
| Basic context | ✓ (2.1) | ✓ Path B |
| First win | ✓ (2.1) | ✓ Phase 4 |

**Acceptance Criteria**:
- [ ] All rows have coverage in both columns
- [ ] No path leaves user stranded mid-onboarding
- [ ] Document any intentional differences

---

## 4. Pre-Mortem Mitigations

From `pre-mortem.md`:

| Risk | Mitigation Applied In |
|------|----------------------|
| No test coverage | Task ACs include manual verification steps |
| Wrong file location for agent-observations.md | Task 1.3 specifies `workspace-structure.ts` |
| Multi-IDE drift | Task 2.0 lists both files, requires diff verification |
| 2.1→2.2 dependency underspecified | Task order enforced; 2.1 uses service methods not subprocesses |
| Model name format | Task 1.1 specifies `anthropic/` prefix |
| Scope creep in 2.2 | Split into 2.2a, 2.2b, 2.2c subtasks |

---

## 5. Dependencies

**Task Ordering**:
- Phase 1 tasks (1.1, 1.2, 1.3) can run in parallel
- Task 2.0 has no dependencies
- Task 2.1 must complete before 2.2a/b/c (skill depends on CLI commands)
- Tasks 2.2a, 2.2b, 2.2c should run in order (structural → integration → questions)
- Task 2.3 runs last (verification)

**External Dependencies**:
- ical-buddy for Apple Calendar (user must have installed)
- Google OAuth credentials configured (beta feature)

---

## 6. Success Criteria

**Phase 1**:
- New workspace gets current AI model versions
- Onboard messaging explains why AI matters
- agent-observations.md created on install

**Phase 2**:
- `arete onboard` completes full setup without requiring conversation
- Getting-started skill runs commands directly (no CLI delegation)
- Calendar choice offered (Apple vs Google)
- Both paths feel complete and consistent
