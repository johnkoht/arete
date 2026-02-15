# Preference Model

**Status**: Backlog  
**Priority**: Medium  
**Related**: Temporal Memory PRD (completed), People Intelligence (related), Agent Memory Research (2026-02-14)

---

## Summary

Learn user preferences from corrections and past work to automatically apply their style without being told. Transform the agent from "follows instructions" to "knows how I work."

## Problem

Every time a user works with the agent, they correct output to match their preferences:
- "Make the PRD more concise"
- "Add a diagram here"
- "I always want edge cases called out"
- "Skip the executive summary, I never use it"

These corrections are lost. The agent makes the same mistakes next session.

## Goals

1. **Capture Corrections** — When user edits agent output, log what changed
2. **Learn Preferences** — Synthesize patterns from corrections
3. **Apply Automatically** — Skills reference preferences and apply them
4. **Periodic Synthesis** — "I've noticed you prefer X. Should I always do this?"

## Key Deliverables

- **Collaboration Profile for Users** (`.arete/memory/summaries/collaboration.md`)
  - Output preferences (concise vs detailed, structure, diagrams)
  - Process preferences (options before decisions, devil's advocate)
  - Corrections log (what the user changed)

- **Correction Capture Mechanism**
  - When user edits agent output, detect the delta
  - Log correction with context (skill, output type, what changed)
  - No user action required — automatic capture

- **Skills Reference Collaboration Profile**
  - Skills check collaboration.md before generating output
  - Apply known preferences (length, structure, inclusions)
  - Mention when applying learned preference ("Using concise format per your preference")

- **Periodic Synthesis Prompts**
  - After N corrections of same type: "I've noticed you often shorten the executive summary. Should I skip it by default?"
  - User confirms → preference promoted from correction log to Patterns section

## Success Criteria

After 10 PRDs, agent applies your style preferences without being told:
- Correct level of detail
- Right structure/sections
- Appropriate use of diagrams
- No repeated corrections needed

## Dependencies

- **Temporal Memory System** — Provides foundation for structured memory items
- **Existing session tracking** — `.arete/activity/` for correction context

## Implementation Notes

### Collaboration Profile Schema

```markdown
# Collaboration Profile

> How you prefer to work with Areté. Auto-learned from your corrections and feedback.

## Output Preferences

### PRDs
- Length: Concise (prefer 2-3 pages over 5+)
- Structure: Always include "Why Now" section
- Edge cases: Call out explicitly in dedicated section
- Diagrams: Include for complex flows

### Meeting Notes
- Format: Bullet points, not prose
- Action items: Bold with owner name

### Reports
- Skip executive summary
- Start with metrics, then narrative

## Process Preferences
- Always offer options before making decisions
- Run devil's advocate on PRDs (don't wait to be asked)
- Prefer incremental delivery over big reveals

## Corrections Log (Recent)
<!-- Auto-populated when user edits agent output -->

### 2026-02-14 — PRD for checkout
**Skill**: create-prd
**Change**: Shortened executive summary from 3 paragraphs to 3 bullets
**Pattern**: Prefers concise summaries

### 2026-02-13 — Week plan
**Skill**: week-plan
**Change**: Removed "motivational" closing
**Pattern**: Prefers direct, no fluff

## Last Synthesized
2026-02-14 — 3 new patterns identified
```

### Correction Capture Flow

1. Agent generates output
2. User edits output (in file or chat)
3. System detects edit (file watcher or explicit "I changed X")
4. Log to `.arete/activity/corrections/YYYY-MM-DD.md`:
   ```
   ### HH:MM — [skill]
   Original: [snippet]
   Changed to: [snippet]
   Inferred pattern: [guess]
   ```
5. Periodically: Synthesize corrections into collaboration.md

### Skill Integration

Skills check collaboration.md:

```typescript
// In skill briefing or execution
const prefs = loadCollaborationProfile(paths);
if (prefs.outputPreferences?.prds?.length === 'concise') {
  // Apply concise template
}
```

Or via briefing assembly:
```
Briefing includes:
- User prefers concise PRDs (2-3 pages)
- User wants edge cases in dedicated section
- User likes diagrams for complex flows
```

## Estimated Scope

- **Phase 1**: Collaboration profile schema and manual population — 1-2 tasks
- **Phase 2**: Correction capture mechanism — 3-4 tasks
- **Phase 3**: Skills reference profile — 2-3 tasks
- **Phase 4**: Periodic synthesis prompts — 2-3 tasks

## Risks

- **Correction detection is hard** — How do we know what the user changed vs added?
  - Mitigation: Start with explicit "I corrected X" or file diff detection
  
- **Over-fitting to recent corrections** — User corrects once, agent assumes always
  - Mitigation: Require 3+ corrections of same type before promoting to preference

- **Preferences conflict** — Different contexts need different styles
  - Mitigation: Allow context-specific preferences (PRDs vs meeting notes)

## References

- Agent Memory Research plan: `/Users/johnkoht/.cursor/plans/agent_memory_research_401237a5.plan.md`
- Temporal Memory PRD: `dev/prds/temporal-memory/prd.md`
- BUILD collaboration profile: `memory/collaboration.md` (example pattern)
