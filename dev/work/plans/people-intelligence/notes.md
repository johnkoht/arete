# People Intelligence — Planning Notes

## Decisions Made (2026-03-01)

### Decision 1: LLM Extraction Architecture
LLM extraction lives in a separate module (`person-signals.ts`), NOT injected into EntityService.
- `extractStancesForPerson(meetingContent, personName, callLLM)` — standalone function
- `LLMCallFn` passed through `RefreshPersonMemoryOptions`, not stored on class
- CLI provides LLM function at call time (same as conversation capture pattern)
- Without LLM function, stances are skipped (graceful degradation)

### Decision 2: Workspace Owner Identity
Read owner name/email from `context/profile.md` frontmatter (`name` field).
- Already read by `suggestPeopleIntelligence()` at line 1532 of entity.ts
- Fallback: first-person language heuristics
- No new config fields needed

### Decision 3: Communication Preferences — Cut from v1
Explicitly out of scope per Persona Council recommendation.
- Harvester harmed by false positives; Preparer sees marginal delta
- Backlog for post-v1 with LLM extraction + user validation

### Decision 4: Task 0 Mandatory
Extract person-memory module from entity.ts before any new features.
- Module-level functions have zero dependency on EntityService class state
- Clean seam: explicit params, no class state access
- Target: person-memory.ts (extraction/rendering) + person-signals.ts (new features)

## Engineering Lead Feedback (Key Points)
- Stances need LLM (semantic, not regex-friendly) — hybrid approach
- Action item dedup: content-normalized hash(normalize(text) + slug + direction)
- Action item lifecycle is critical: auto-stale 30 days, cap 10 items
- Keep ONE auto-managed marker pair, render all sub-sections inside it
- Relationship health: computed on-demand during refresh, not separately persisted
- Phase D is prompt edits (SKILL.md + PATTERNS.md), not code

## Persona Council Policies (Hypothesis-Based)
- Stances: Required, on by default. Source citation mandatory.
- Communication Preferences: CUT from v1.
- Action Items: Required, on by default. Auto-extract, no confirmation gate.
- Relationship Health: Required, on by default.
- All extraction automatic during process-meetings. No prompts.
- Conservative extraction: precision over recall.
- `--dry-run` flag for preview without committing.
- Source citation on every item — non-negotiable.

## Pre-Mortem Top Risks
1. God Object (entity.ts) — Task 0 resolves
2. LLM into EntityService — separate module resolves
3. Workspace Owner Identity — profile.md resolves
4. Action Item Lifecycle — design in Phase B
5. LLM non-determinism — content hash caching
