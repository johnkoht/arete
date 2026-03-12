# Search Command Consolidation - Complete Skills Inventory

**Audit Date**: 2026-03-10  
**Total Skills**: 28 directories + 4 foundation files

---

## Skills with DIRECT Command References

These skills explicitly call the deprecated commands and need intelligent migration:

| Skill | Commands Used | Lines | Migration Complexity |
|-------|---------------|-------|---------------------|
| `week-review` | `arete context --for`, `arete memory search` | L67-68 | Medium - context bundle assembly |
| `process-meetings` | `arete context --for`, `arete memory search` | L252-253 | Medium - context bundle assembly |
| `capture-conversation` | `arete context --for` (informational) | L127, L195, L203, L277 | Low - documentation refs only |

---

## Foundation Files with Command References

These define patterns and documentation that other skills inherit:

| File | Refs | Purpose | Impact |
|------|------|---------|--------|
| `PATTERNS.md` | 3 refs | `context_bundle_assembly` pattern | HIGH - 11 skills inherit this |
| `_authoring-guide.md` | 12+ refs | Skill authoring documentation | HIGH - all skill authors |
| `_integration-guide.md` | 1 ref | Integration documentation | LOW |
| `README.md` | 1 ref | Skills overview | LOW |

---

## Skills that INHERIT from PATTERNS.md

These skills reference patterns containing deprecated commands. When we update `PATTERNS.md`, they'll get the new commands automatically:

| Skill | Pattern Used | Direct Update Needed? |
|-------|--------------|----------------------|
| `daily-plan` | `get_meeting_context` | No (indirect via PATTERNS) |
| `meeting-prep` | `get_meeting_context` | No (indirect via PATTERNS) |
| `prepare-meeting-agenda` | `get_meeting_context` | No (indirect via PATTERNS) |
| `discovery` | `research_intake` | No (indirect via PATTERNS) |
| `general-project` | `research_intake` | No (indirect via PATTERNS) |
| `fathom` | `enrich_meeting_attendees` | No (indirect via PATTERNS) |
| `krisp` | `enrich_meeting_attendees` | No (indirect via PATTERNS) |
| `finalize-project` | `extract_decisions_learnings` | No (indirect via PATTERNS) |
| `schedule-meeting` | (references PATTERNS.md) | No - uses `arete resolve` only |

---

## Skills with NO Search Command Usage

These skills don't use any of the deprecated commands:

| Skill | Commands Used (if any) | Notes |
|-------|------------------------|-------|
| `calendar` | None | Creates calendar events |
| `competitive-analysis` | None | Uses templates |
| `construct-roadmap` | None | Uses templates |
| `create-prd` | None | Uses templates |
| `generate-mockup` | None | Generates images |
| `generate-prototype-prompt` | None | Generates prompts |
| `getting-started` | None | Onboarding guide |
| `goals-alignment` | None | Goal review workflow |
| `notion` | None | Integration skill |
| `people-intelligence` | `arete people memory refresh` | Different command |
| `periodic-review` | None | Review workflow |
| `quarter-plan` | None | Planning template |
| `rapid-context-dump` | None | Captures context |
| `save-meeting` | None | Saves meeting notes |
| `synthesize` | None | Cross-meeting synthesis |
| `week-plan` | None | Planning template |
| `workspace-tour` | None | Onboarding |

---

## Commands NOT Being Deprecated

For clarity, these commands are NOT affected and skills using them don't need changes:

- `arete brief --for` — Stays (different purpose)
- `arete resolve` — Stays (disambiguation)
- `arete people memory refresh` — Stays (different command)
- `arete commitments list` — Stays
- `arete pull calendar` — Stays
- `arete calendar create` — Stays
- `arete availability find` — Stays

---

## Migration Strategy by Priority

### 🔴 Priority 1: Foundation (must update first)
1. **PATTERNS.md** — Update `context_bundle_assembly` pattern
   - Agent reviews WHY context + memory are gathered
   - Determines if `search` or `search --scope X` is appropriate
   - Updates pattern; 11 skills auto-inherit

2. **_authoring-guide.md** — Update skill authoring documentation
   - Agent reviews each recipe
   - Updates examples and recommendations

### 🟡 Priority 2: Direct Command Skills
3. **week-review/SKILL.md** — Intelligent migration
   - Agent reads full skill, understands purpose
   - Updates lines 67-68 appropriately

4. **process-meetings/SKILL.md** — Intelligent migration
   - Agent reads full skill, understands purpose
   - Updates lines 252-253 appropriately

### 🟢 Priority 3: Informational References
5. **capture-conversation/SKILL.md** — Documentation update
   - References are informational ("discoverable via arete context")
   - Update to mention `arete search`

### ⚪ Priority 4: Low-impact Documentation
6. **_integration-guide.md** — Minor update
7. **README.md** — Minor update

---

## Note: No `daily-winddown` Skill

The user asked about `daily-winddown` — this skill does not exist. The only daily skill is `daily-plan`, which:
- Uses `get_meeting_context` pattern (inherits from PATTERNS.md)
- Uses `arete people memory refresh` (NOT deprecated)
- Uses `arete commitments list` (NOT deprecated)
- Uses `arete pull calendar` (NOT deprecated)

No direct migration needed for `daily-plan`.

---

## Subagent Dispatch Plan for Step 5

### Agent 1: Foundation Agent
**Files**: `PATTERNS.md`, `_authoring-guide.md`
**Task**: Review and understand the pedagogical intent. Update patterns and documentation consistently. This is the most critical — getting this right means 11 skills auto-inherit.

### Agent 2: Week Review Agent
**File**: `week-review/SKILL.md`
**Task**: Read the full skill. Understand the context bundle assembly in step 3.5. Update to use appropriate `search` command.

### Agent 3: Process Meetings Agent
**File**: `process-meetings/SKILL.md`
**Task**: Read the full skill. Understand the context bundle assembly in step 4.2. Update to use appropriate `search` command.

### Agent 4: Documentation Agent
**Files**: `capture-conversation/SKILL.md`, `_integration-guide.md`, `README.md`
**Task**: Update informational references. These are low-risk documentation updates.

### Verification
After all agents complete, grep for any remaining references to deprecated commands.
