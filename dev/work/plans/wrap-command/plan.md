---
title: "/wrap — Post-Execution Close-Out Command"
slug: wrap-command
status: complete
size: small
tags: [plan-mode, dx]
created: 2026-03-02T00:00:00.000Z
updated: 2026-03-09T04:45:00.000Z
completed: 2026-03-09T04:45:00.000Z
execution: prd
has_review: true
has_pre_mortem: true
has_prd: true
steps: 4
---

# `/wrap` — Post-Execution Close-Out Command

**Source**: Builder frustration — orchestrator agents do documentation close-out partially or only when explicitly asked

---

## Problem

After a PRD execution completes, there's no enforced mechanism to verify that documentation is actually up to date. The orchestrator is *supposed* to handle this in Phase 3 (holistic review + System Improvements Applied), but in practice:

- It gets skipped or done partially
- The builder has to ask the orchestrator explicitly ("did you update LEARNINGS?")
- Memory entries get created but documentation (AGENTS.md, profiles, patterns.md) may not get updated
- No single place to see what the close-out checklist requires

The gap: execution ends, the conversation closes, and nobody has definitively confirmed documentation is current.

---

## Proposed Solution

A `/wrap` plan-mode command that acts as a structured post-execution close-out. When invoked:

1. **Loads the current plan context** — what was built, which files were touched, what the PRD tasks covered
2. **Runs a close-out checklist** against the plan's state:
   - [ ] Memory entry exists in `memory/entries/`
   - [ ] `MEMORY.md` index updated
   - [ ] LEARNINGS.md updated in all directories with code changes (or explicitly confirmed: no new gotchas)
   - [ ] Expertise profiles checked for accuracy (if architecture changed)
   - [ ] `patterns.md` updated (if new patterns discovered)
   - [ ] AGENTS.md rebuilt if CLI commands or Skills changed (`npm run build:agents:prod`)
   - [ ] `dev/catalog/capabilities.json` updated if new services/tools/commands added
   - [ ] `packages/runtime/GUIDE.md` CLI Reference updated (if new CLI commands added)
   - [ ] `packages/runtime/UPDATES.md` entry added (user-facing release note, 1-3 sentences for GUIDE users)
   - [ ] Plan status set to `complete` with `completed:` timestamp
3. **Prompts for an `UPDATES.md` entry** — user-facing release note for what shipped (1-3 sentences, written for GUIDE mode users, not BUILD)
4. **Reports what's done, what's missing, what needs attention**
5. **Optionally executes the remaining items** (spawn a subagent to fill the gaps)
6. **Archives the plan** or prompts to archive

---

## Design Notes

### Command placement
- `/wrap` in plan mode, mirroring `/review` (pre-execution) and `/pre-mortem` (risk analysis)
- Could also surface as a reminder at end of `/build` — "Run `/wrap` to close out this plan"

### Checklist scope
The checklist should be **tiered by change type**:
- **Docs-only PRD** (e.g. agent-learning-loop): check memory entry + MEMORY.md index only
- **Code PRD, no new services**: add LEARNINGS.md check
- **Code PRD, new service/command**: add AGENTS.md rebuild + catalog check
- **Architecture PRD**: add profiles + patterns.md check

The plan's `tags` and `size` can help infer which tier applies, or it can just run all checks and mark inapplicable items N/A.

### Gap execution
When gaps are found, `/wrap` should offer to spawn a subagent to fill them — e.g. "3 LEARNINGS.md files need updating. Run now?" This avoids the current pattern where the builder asks the orchestrator who then does it incompletely.

### Relationship to execute-prd Phase 3
This doesn't replace Phase 3 — it's a safety net for when Phase 3 is rushed or partial. Think of it as the builder's manual audit trigger.

---

## Acceptance Criteria

1. `/wrap` command available in plan mode when a plan is open
2. Checklist shows actual status (green/red per item) based on filesystem inspection where possible
3. Missing items are actionable (clear instruction or offer to execute)
4. On completion: plan status set to `complete`, plan archived (or prompted)
5. `UPDATES.md` entry written in user-friendly language (not technical — "now you can do X")
6. Works for both PRD-executed plans and direct-execution plans

---

## Related

- `packages/runtime/UPDATES.md` — the file this command writes entries to
- `review-artifact-consumption` plan — related gap (pre-execution artifacts not consumed during build handoff)
- `execute-prd` SKILL.md Phase 3 — what the orchestrator is *supposed* to do; `/wrap` is the enforcement layer
- `maintenance.md` — the protocol being checked; `/wrap` makes it automatic

---

## Audit Results (2026-03-08)

### Validation of Checklist Design

Conducted an audit of recent commits (past 5 days) against the proposed checklist items. See `audit-notes.md` for full details.

**Major changes audited**:
- AIService + credentials (e72a580, 049fd26, 9a4e05f)
- Meeting extract command (8f01c4a)
- Backend AIService migration (bc4cec7)
- Credentials/config CLI commands (f645b3b, 58638b3)

**Results by checklist item**:

| Checklist Item | Status | Notes |
|----------------|--------|-------|
| Memory entry exists | ✅ | Both `ai-config-learnings.md` and `int-0-service-normalization-learnings.md` exist |
| MEMORY.md index | ✅ | Both entries indexed at top |
| LEARNINGS.md updated | ✅ | `packages/core/src/services/LEARNINGS.md` and `packages/cli/src/commands/LEARNINGS.md` updated |
| Expertise profiles | ⚠️ → ✅ Fixed | Were missing AIService, credentials, new commands. Now updated. |
| patterns.md | N/A | No new patterns discovered |
| AGENTS.md rebuilt | ✅ | `dist/AGENTS.md` has new commands |
| Capability catalog | ⚠️ → ✅ Fixed | Multiple gaps: 5 capabilities added (web-dashboard, daily-intelligence, momentum-tracking, signal-patterns, meeting-extraction). ai-service updated with CLI entrypoints. Catalog was stale since 03-04. |
| UPDATES.md | ⚠️ | Not checked in this audit |
| Plan status | N/A | Plans archived properly |

### Fixes Applied During Audit

1. **`.pi/expertise/core/PROFILE.md`** — Added:
   - AIService section in Component Map
   - Credentials module documentation
   - Updated Architecture Overview diagram

2. **`.pi/expertise/cli/PROFILE.md`** — Added:
   - `meeting extract` subcommand
   - `credentials.ts` command section
   - `config.ts` command section

3. **`dev/catalog/capabilities.json`** — Fixed (significant gaps):
   - Updated `ai-service` entry with CLI command entrypoints (`arete credentials *`, `arete config *`)
   - Added `meeting-extraction` — `arete meeting extract` command
   - Added `web-dashboard` — Product Intelligence Dashboard (packages/apps/)
   - Added `daily-intelligence` — `arete daily` morning brief
   - Added `momentum-tracking` — `arete momentum` + momentum.ts service
   - Added `signal-patterns` — Cross-person pattern detection
   - Updated `lastUpdated` from 2026-03-04 to 2026-03-08
   - **Total: 8 → 13 capabilities**

### Validation Conclusion

The proposed checklist covers the right artifacts. The audit revealed **significant gaps** — the capability catalog was 4 days stale with 5 missing capabilities. This validates the need for the `/wrap` command.

**Key finding**: The critical documentation chain (code → LEARNINGS.md → memory entry → AGENTS.md) was intact. But **peripheral documentation** (capability catalog, expertise profiles, user-facing docs) was neglected. This is exactly what `/wrap` is designed to catch.

**Recommendation**: Proceed with implementation. The checklist design is validated — this audit proves the problem exists and the proposed solution would catch it.

---

## Learnings from Manual Audit (2026-03-08)

### Documentation Categories Discovered

The audit revealed **three tiers of documentation** with different failure modes:

| Tier | Artifacts | Failure Mode | Detection |
|------|-----------|--------------|-----------|
| **Critical** | LEARNINGS.md, memory entries, MEMORY.md index | Gets done (orchestrator Phase 3) | Easy (file exists, mtime) |
| **Peripheral** | Capability catalog, expertise profiles | Gets skipped (no enforcement) | Medium (content staleness) |
| **User-facing** | GUIDE.md CLI Reference, UPDATES.md | Gets forgotten entirely | Hard (requires command inventory diff) |

### Specific Gaps Found

1. **Capability catalog** — 4 days stale, 5 capabilities missing (web-dashboard, daily-intelligence, momentum-tracking, signal-patterns, meeting-extraction)
2. **Expertise profiles** — Missing AIService, credentials, new CLI commands
3. **GUIDE.md** — CLI Reference missing 7 commands (view, daily, momentum, commitments, credentials, config, meeting extract)
4. **UPDATES.md** — No release notes for web dashboard, intelligence commands, AI configuration

### Checklist Additions Needed

The original checklist should be expanded:

**Add to checklist:**
- [ ] `GUIDE.md` CLI Reference updated (if new commands added)
- [ ] `UPDATES.md` entry added (user-facing release note)

**Detection heuristic for CLI changes:**
- Compare `ls packages/cli/src/commands/*.ts` against commands documented in GUIDE.md
- Any new `.ts` file = likely missing from CLI Reference

### Process Insight

**Why these gaps occur:**
1. BUILD mode agents focus on code + tests + LEARNINGS.md
2. Memory entries get created because orchestrator Phase 3 explicitly asks for them
3. Peripheral docs (catalog, profiles) have no trigger — they're "nice to have"
4. User-facing docs (GUIDE.md, UPDATES.md) are written for a different audience — BUILD agents don't think about them

**The fix:** `/wrap` checklist must explicitly include user-facing docs as a category, not just BUILD artifacts.

### Files Updated During This Audit

| File | Changes |
|------|---------|
| `.pi/expertise/core/PROFILE.md` | Added AIService + Credentials sections |
| `.pi/expertise/cli/PROFILE.md` | Added credentials, config, meeting extract commands |
| `dev/catalog/capabilities.json` | Added 5 capabilities, updated ai-service (8→13 total) |
| `packages/runtime/GUIDE.md` | Added Daily Intelligence, Commitments, AI Configuration sections; added meeting extract |
| `packages/runtime/UPDATES.md` | Added Week of March 8 release notes |

### Time Investment

- Initial audit (code→LEARNINGS→memory→AGENTS.md): ~10 minutes
- Discovery of capability catalog gaps: ~5 minutes  
- Discovery of GUIDE.md gaps: ~5 minutes
- Fixes applied: ~20 minutes
- **Total: ~40 minutes** for a manual audit

This confirms `/wrap` automation would save significant time and prevent these gaps from accumulating.
