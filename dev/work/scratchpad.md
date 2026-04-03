# Scratchpad

> Raw capture space for ideas, issues, and observations. Items here can graduate to `dev/work/backlog/` or `dev/work/plans/` when they're ready.

---

## New Workspace Setup Testing (2026-03-24)

Issues and observations from testing a fresh Areté workspace install.

### Issues

1. **Default AI tiers are outdated** (2026-03-24)
   - New project gets old model versions:
     ```yaml
     tiers:
       fast: anthropic/claude-3-5-haiku-latest
       standard: anthropic/claude-sonnet-4-20250514
       frontier: anthropic/claude-3-opus
     ```
   - Should be (per reserv project):
     ```yaml
     tiers:
       fast: claude-haiku-4-5
       standard: claude-sonnet-4-6
       frontier: claude-opus-4-6
     ```
   - Need to update defaults in codebase
   - **Location**: `packages/cli/src/commands/onboard.ts` (two places)

2. **Onboard messaging is unclear** (2026-03-24)
   - Current: Says something like "update your anthropic key"
   - Should be: More contextual about what Areté does with LLMs
   - Suggested: "Areté embeds LLMs into the toolchain, connecting your Anthropic account to leverage the intelligence layer..."

3. **Onboard stops after Anthropic setup — UX confusion** (2026-03-24)
   - Flow: `arete install` → `arete onboard` → user expected more
   - **By design**: Integrations handled by `getting-started` skill in chat
   - **Problem**: Not clear that next step is "Let's get started" in conversation
   - **Problem**: Message says "Update Anthropic credentials?" (line 282 in onboard.ts)
     - Appears when credentials exist from previous install
     - Confusing phrasing, doesn't explain WHY Areté needs AI
   - **Fix options**:
     a. Add integrations to `arete onboard` directly
     b. Make handoff to conversational onboarding much clearer
     c. Better messaging about what Areté does with AI

4. **Getting-started skill delegates to CLI instead of helping directly** (2026-03-24)
   - User says "let's get started" → skill asks about integrations
   - Then tells user to run CLI commands manually
   - **Location**: `packages/runtime/skills/getting-started/SKILL.md` — Path C says:
     ```
     1. Run: arete integration configure calendar
     2. Then: arete pull calendar --days 7
     ```
   - **Should**: Guide user through setup conversationally, not hand off to CLI
   - The agent should BE the onboarding, not point to docs
   - **Fix**: Skill should run these commands itself or guide user step-by-step in chat

5. **Calendar integration assumes ical-buddy without asking** (2026-03-24)
   - User said "yes" to calendar integration
   - Skill proceeded directly to ical-buddy setup
   - **Location**: Same skill, Path C doesn't offer choice
   - **Should**: Ask "Would you like to use macOS Calendar (ical-buddy) or Google Calendar?"
   - Then proceed based on choice
   - Note: `arete integration configure` has both `apple-calendar` and `google-calendar` options

6. **Google Calendar integration gets stuck on interactive prompt** (2026-03-24)
   - Agent runs `arete integration configure google-calendar`
   - CLI prompts user to select which calendars (interactive)
   - Agent can't respond to interactive prompts → gets stuck
   - **Root cause**: Skill doesn't know about non-interactive flags
   - **Flags already exist**: `--calendars <list>` and `--all` (see integration.ts lines 78-79)
   - **Fix**: Update getting-started skill to:
     a. Ask user which calendars they want (or "all")
     b. Pass `--all` or `--calendars "Work,Personal"` when running command
   - Alternatively: Skill should document these flags so agent knows to use them
   - **Note**: Google Calendar also has OAuth browser flow first (line 220) — agent may need to guide user through that part manually, then use `--all` for calendar selection

7. **agent-observations.md in .arete is ignored** (2026-03-24)
   - File: `.arete/memory/items/agent-observations.md` (user workspace)
   - **Note**: File is `agent-observations.md` (singular), not `agents-observations.md`
   - **Investigation findings**:
     - File IS defined in `packages/core/src/services/memory.ts` line 31
     - File IS included in memory search (line 197: `['decisions', 'learnings', 'observations']`)
     - File IS documented in `packages/runtime/rules/cursor/agent-memory.mdc`
     - Briefing DOES include memory results (intelligence.ts lines 259-272)
   - **Possible issues**:
     a. File doesn't exist in user workspace (never created during install?)
     b. File exists but is empty/not indexed
     c. Memory search returns results but observations aren't surfaced prominently
     d. Rules file tells agents WHEN to write, but not to READ it proactively
   - **Fix needed**: Verify file is created during workspace setup, and ensure agents read it at session start (not just when searching)

8. **Onboarding needs holistic improvement** (2026-03-24)
   - Overall onboarding experience is rough
   - **Existing plan found**: `dev/work/plans/self-guided-onboarding/plan.md`
     - Status: idea (blocked - needs infrastructure)
     - Comprehensive plan for `arete onboard` using Areté to onboard to Areté
     - Includes discovery questions, personalized paths, checkpoints
   - **Also in archive**: 6+ previous onboarding improvement attempts
   - **Action**: Review self-guided-onboarding plan, update with current issues, potentially activate

9. **getting-started skill is out of date** (2026-03-24)
   - Location: `packages/runtime/skills/getting-started/SKILL.md`
   - **Outdated references**:
     - Mentions "areas" (removed?)
     - Says `/now` structure but now only has scratchpad
     - Missing info about weekly and daily plans
   - **Good parts**: "What to do first" section is solid
   - **Fix**: Audit skill against current workspace structure and update

10. **Goal setting creates individual files — is this right?** (2026-03-24)
    - User selected "let's set my goals" during onboarding
    - Agent created individual goal files instead of adding to `goals/quarter.md`
    - **Finding**: `quarter-plan/SKILL.md` explicitly says "Individual goal files are created for each outcome"
    - **No quarter.md found** in workspace template
    - **Question for John**: Is this the intended behavior? Or should goals consolidate into quarter.md?
    - If refactor needed: update quarter-plan skill + getting-started skill

### Observations

<!-- Things that work but could be better -->

### Questions

<!-- Things to investigate or clarify -->

---

## Archive

<!-- Move resolved items here with dates -->
