---
title: Onboarding Refresh
slug: onboarding-refresh-2026-03
status: planned
size: medium
tags: [onboarding, ux, dx]
created: 2026-03-24T08:55:00Z
updated: 2026-03-26T04:59:51.922Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 0
---

# Onboarding Refresh

**Status**: Draft  
**Priority**: High (critical for new user experience)  
**Effort**: Medium (Phase 1: 1hr, Phase 2: 3-4hrs)  
**Source**: Testing fresh workspace setup (2026-03-24)

---

## Overview

Refresh the onboarding experience based on issues found during fresh workspace testing. Two phases: quick fixes for immediate pain points, then a comprehensive overhaul of both CLI and conversational onboarding paths.

**Core principle**: Both `arete onboard` (CLI) and "Let's get started" (agent) should provide a similar, complete onboarding experience. Users shouldn't need to switch between them.

---

## Phase 1: Quick Fixes (Mechanical Only)

*Estimated: 30 min | Pure code changes, no architectural decisions*

> **Review feedback incorporated**: Task 1.4 (session-start context) moved to Phase 2 — it's architectural, not a quick fix.

### 1.1 Update Default AI Tiers

**Location**: `packages/cli/src/commands/onboard.ts` (two places: lines ~381 and ~444)

**Current** (outdated):
```yaml
tiers:
  fast: anthropic/claude-3-5-haiku-latest
  standard: anthropic/claude-sonnet-4-20250514
  frontier: anthropic/claude-3-opus
```

**Target** (verify format matches codebase conventions):
```yaml
tiers:
  fast: anthropic/claude-haiku-4-5
  standard: anthropic/claude-sonnet-4-6
  frontier: anthropic/claude-opus-4-6
```

> **Note**: Check existing model references in codebase to confirm `anthropic/` prefix convention.

**Acceptance**: New workspace gets current model versions.

**Verification**: After change, run `arete install` in test dir, check `arete.yaml` for correct tiers.

---

### 1.2 Improve Onboard Messaging

**Location**: `packages/cli/src/commands/onboard.ts`

**Issues**:
- "Update Anthropic credentials?" is confusing (line 282)
- Doesn't explain WHY Areté needs AI

**Fixes**:
1. Change credential prompt to be more contextual:
   - Current: "Update Anthropic credentials?"
   - Better: "Areté uses AI to extract insights from meetings and power the intelligence layer. Update your Anthropic credentials?"

2. Add context before AI setup section:
   ```
   Areté embeds LLMs into your workflow — extracting decisions from meetings,
   building context for prep, and powering search across your workspace.
   ```

**Acceptance**: User understands why AI credentials matter before being asked.

---

### 1.3 Fix agent-observations.md Creation

**Problem**: File may not be created on install.

**Tasks**:

1. **Verify file creation on install**
   - Check `packages/cli/src/commands/install.ts` or workspace template
   - Ensure `.arete/memory/items/agent-observations.md` is created with starter content
   - Starter content:
     ```markdown
     # Agent Observations
     
     Observations about working with you. Agents add entries here when they notice
     patterns, preferences, or corrections. These inform how agents collaborate with you.
     
     ---
     
     <!-- Format: - [YYYY-MM-DD] [Observation] → [Implication] -->
     ```

**Acceptance**: File exists after fresh `arete install`.

**Verification**: Run `arete install` in test dir, verify `cat .arete/memory/items/agent-observations.md` shows content.

> **Note**: Session-start context injection moved to Phase 2 (Task 2.0) — it's architectural.

---

## Phase 2: Onboarding Overhaul

*Estimated: 3-4 hours | Requires PRD for autonomous execution*

> **Review feedback incorporated**: 
> - Task 2.0 added (session-start context injection — moved from Phase 1)
> - Explicit dependency: 2.1 must complete before 2.2
> - Multi-IDE impact noted for rule changes

### Goal

Both CLI (`arete onboard`) and agent ("Let's get started") provide a complete, similar onboarding experience:
- Collect identity + AI credentials
- Configure integrations (calendar choice, etc.)
- Bootstrap initial context
- Guide to first win

---

### 2.0 Session-Start Context Injection

**New enhancement**: Agents should automatically receive context at session start.

**Inject**:
- Last 3-5 observations from `.arete/memory/items/agent-observations.md`
- Current week focus from `now/week.md` (if exists)
- Commitments due this week (not all open — scoped to current week)

**Implementation**: Add section to `agent-memory.mdc` rule:
```markdown
## Session Start

At the beginning of each conversation, proactively read:
1. `.arete/memory/items/agent-observations.md` — last 5 entries
2. `now/week.md` — current focus and priorities (if exists)
3. Run `arete commitments list --due-this-week` — what's urgent

This ensures continuity without requiring explicit briefing.
```

**Multi-IDE Impact**: Update BOTH rule directories:
- `packages/runtime/rules/cursor/agent-memory.mdc`
- `packages/runtime/rules/claude-code/agent-memory.mdc` (if exists, or equivalent)

**Acceptance**: Agent references past observations and current priorities without being asked.

**Verification**: Start new session, verify agent mentions week focus or recent observations.

---

### 2.1 CLI Onboard Enhancement

> **Note**: Must complete before 2.2 — agent skill depends on CLI commands working correctly.

**Current flow**:
1. Identity (name, email, company)
2. AI credentials
3. *Stops* — tells user to say "Let's get started" in chat

**Target flow**:
1. Identity (name, email, company)
2. AI credentials
3. **NEW**: Integration setup
   - "Would you like to connect a calendar? (Apple Calendar / Google Calendar / Skip)"
   - If Apple: run `arete integration configure apple-calendar --all`
   - If Google: guide through OAuth, then `--all` for calendars
4. **NEW**: Initial context prompts
   - "What does your company do? (1-2 sentences)"
   - "Who are your primary users?"
   - Write to `context/business-overview.md` and `context/users-personas.md`
5. **NEW**: First win suggestion
   - "Setup complete! Try: 'Prep for my next meeting' or 'Plan my week'"

**Acceptance**: User can complete full onboarding via CLI without needing agent.

---

### 2.2 Getting-Started Skill Overhaul

> **Dependency**: Requires 2.1 complete — skill runs CLI commands that must work correctly first.
> Test CLI calendar commands work before updating skill.

**Location**: `packages/runtime/skills/getting-started/SKILL.md`

**Current issues**:
- Delegates to CLI ("Run: arete integration configure calendar")
- Assumes ical-buddy without asking
- References outdated workspace structure (areas, /now)
- Doesn't know about `--all` flag for non-interactive calendar setup

**Target behavior**:

1. **Run commands directly, don't delegate**
   - Agent should execute CLI commands itself via bash tool
   - For OAuth flows: Guide user through browser auth manually (OAuth requires user interaction)
     - Say: "I'll help you set up Google Calendar. First, run this command which will open your browser:"
     - Provide: `arete integration configure google-calendar`
     - Wait for: "Let me know when you've completed the browser authorization"
   - After OAuth: Run `arete integration configure google-calendar --all` to complete setup

2. **Offer choices**:
   - "Would you like to use Apple Calendar (syncs with macOS Calendar app) or Google Calendar?"
   - "Should I sync all your calendars, or specific ones?"

3. **Update workspace references**:
   - Remove "areas" references
   - Update `now/` structure (just scratchpad now)
   - Add info about `now/week.md` and `now/today.md` for planning

4. **Add discovery questions** (borrowed from self-guided-onboarding):
   ```
   Q1: What data sources do you have?
       - Calendar, Meeting recordings, Existing docs, None yet
   
   Q2: What do you want to accomplish first?
       - Meeting prep, Document strategy, Organize research, Explore
   
   Q3: Context readiness?
       - Ready now, Need to gather, Need time
   ```

5. **Route to simplified paths**:
   - **Meeting-first**: Calendar → pull meetings → meeting-prep skill
   - **Strategy-first**: Context files → quarter-plan skill
   - **Explore**: Tour → try a skill

**Acceptance**: User can complete full onboarding via agent without needing CLI (except for OAuth browser steps).

---

### 2.3 Parity Checklist

Ensure both paths cover:

| Step | CLI (`arete onboard`) | Agent (getting-started) |
|------|----------------------|------------------------|
| Identity | ✓ Already works | ✓ Q0 in skill |
| AI credentials | ✓ Already works | ⚠️ May need to check/prompt |
| Calendar choice | 🆕 Add | 🆕 Add |
| Calendar setup | 🆕 Add (non-interactive) | 🆕 Run commands directly |
| Basic context | 🆕 Add prompts | ✓ Path B guided input |
| First win | 🆕 Add suggestion | ✓ Phase 4 in skill |

---

### 2.4 Goals Structure Decision

**Question**: Individual goal files vs `goals/quarter.md`?

**Current**: `quarter-plan` skill creates individual files per outcome.

**Options**:
1. Keep individual files (current)
2. Switch to single `quarter.md`
3. Hybrid: `quarter.md` as index/summary, individual files for detail

**Recommendation**: Defer decision. Current behavior works. Revisit if users report confusion.

**Action**: Add to scratchpad/backlog for future consideration.

---

## Phase 3: Future — Self-Guided Onboarding

*Defer until Phase 1+2 feedback*

The comprehensive `dev/work/plans/self-guided-onboarding/plan.md` has great ideas:
- Personalized onboarding paths with checkpoints
- Progress tracking via onboarding project
- Week/daily plans generated for onboarding itself

**When to revisit**:
- After Phase 2 ships and we get user feedback
- If users still struggle despite improved getting-started
- If we want onboarding to be a differentiator (not just "good enough")

**Key ideas to potentially extract**:
- Checkpoint verification ("Let's verify: can you see your meetings?")
- Adaptive paths based on what's working
- Onboarding as a project with tasks

---

## Success Criteria

**Phase 1** (Mechanical fixes):
- [ ] New workspace gets current AI model versions
- [ ] Onboard messaging explains why AI matters
- [ ] agent-observations.md created on install
- [ ] **Verification**: `arete install` in clean dir → check `arete.yaml` tiers and `.arete/memory/items/agent-observations.md`

**Phase 2** (Architectural changes):
- [ ] Session-start context injection works (both Cursor and Claude rules)
- [ ] `arete onboard` completes full setup (identity → AI → integrations → context → first win)
- [ ] Getting-started skill runs commands directly (no "run this CLI" delegation)
- [ ] Calendar choice offered (Apple vs Google)
- [ ] Skill references current workspace structure
- [ ] Both paths feel similar in completeness
- [ ] **Verification**: Fresh workspace → run full onboarding via CLI, then separately via agent

## Out of Scope

- **Existing workspace migration**: Changes apply to new installs only. Existing users won't automatically get agent-observations.md or updated rules. They can run `arete update` manually.
- **Full self-guided onboarding**: Deferred to Phase 3 (see below)

---

## Related

- **Existing plan**: `dev/work/plans/self-guided-onboarding/plan.md` (comprehensive, blocked)
- **Archive**: 6+ previous onboarding attempts in `dev/work/archive/`
- **Scratchpad source**: `dev/work/scratchpad.md` (issues 1-10 from 2026-03-24 testing)
- **Key files**:
  - `packages/cli/src/commands/onboard.ts`
  - `packages/cli/src/commands/install.ts`
  - `packages/runtime/skills/getting-started/SKILL.md`
  - `packages/runtime/rules/cursor/agent-memory.mdc`
