# Review: Build Context Injection

**Type**: Plan
**Audience**: Builder (editing `.pi/skills/` files — internal tooling)

## Concerns

### 1. Completeness — Profile Section Names Inconsistent

The plan specifies "key sections: Invariants, Anti-Patterns, Key Abstractions"

- ✅ Core profile has: `## Key Abstractions & Patterns`, `## Invariants`, `## Anti-Patterns & Common Mistakes`
- ❌ CLI profile does NOT have these sections — different structure entirely

**Suggestion**: Either (a) update CLI profile to match core's structure, or (b) change plan to say "key sections IF they exist (Invariants, Anti-Patterns, Key Abstractions for core; Purpose & Boundaries, Command Architecture for cli)"

### 2. Implicit Assumption — Profile Sections Exist

The plan assumes the orchestrator can find and extract specific sections. This is a human-readable instruction, not code — the orchestrator must interpret it.

**Suggestion**: Add explicit fallback: "If profile lacks these sections, include the first 150-200 lines instead"

### 3. Dependency Order

Step 4 (LEARNINGS.md) should explicitly state it depends on understanding what was changed in Steps 1-3. Currently it's listed as independent.

**Suggestion**: Add "(after Steps 1-3 complete)" to Step 4 description

## Strengths

- **Well-researched problem**: Clear evidence that profiles aren't injected (code analysis done)
- **Pre-mortem incorporated**: 5 risks identified with concrete mitigations
- **DRY principle applied**: References existing Step 10 logic instead of duplicating
- **Concrete search instructions**: "Search by step name, not number" — good defensive practice
- **Scope well-bounded**: Clear out-of-scope list prevents creep

## Devil's Advocate

**If this fails, it will be because...** the orchestrator implementing these edits takes "include key sections: Invariants, Anti-Patterns, Key Abstractions" too literally and fails when CLI profile (or future profiles) don't have those exact section names. The instructions work for core but silently fail for other profiles.

**The worst outcome would be...** reviewers get partial/no profile context for CLI tasks while getting full context for core tasks, creating inconsistent review quality. The inconsistency might not be noticed because reviews still "work" — just worse for CLI-heavy PRDs.

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

**Recommendation**: Add fallback handling for profiles without standard sections. This can be a one-line addition: "If profile lacks these sections, include Purpose & Boundaries + first 100 lines of Component/Command Map."