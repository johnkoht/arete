# `/wrap` Command Audit Notes

## Audit Date: 2026-03-08
## Scope: Review recent commits (past 5 days) for documentation/learnings completeness

---

## Recent Major Changes Identified

| Commit | Feature | Files Changed |
|--------|---------|---------------|
| e72a580, 049fd26 | **AIService** - pi-ai wrapper with credential management | `packages/core/src/services/ai.ts`, `packages/core/src/credentials.ts` |
| 9a4e05f | **OAuth login support** - `arete credentials login` | `packages/cli/src/commands/credentials.ts`, `packages/core/src/credentials.ts` |
| 8f01c4a | **Meeting extract command** - `arete meeting extract` | `packages/cli/src/commands/meeting.ts` |
| bc4cec7 | **Backend AIService migration** - pi-coding-agent → AIService | `packages/apps/backend/src/services/agent.ts` |
| f645b3b, 58638b3 | **Credentials/config CLI commands** | `packages/cli/src/commands/credentials.ts`, `packages/cli/src/commands/config.ts` |

---

## Documentation Checklist Audit

### ✅ Memory Entries

| Entry | Status | Notes |
|-------|--------|-------|
| `2026-03-08_ai-config-learnings.md` | ✅ Exists | Covers AIService, credentials, backend migration |
| `2026-03-08_int-0-service-normalization-learnings.md` | ✅ Exists | Covers meeting extract, formatters, OAuth bonus |
| MEMORY.md index | ✅ Updated | Both entries indexed at top |

### ✅ LEARNINGS.md Files

| Location | Status | Notes |
|----------|--------|-------|
| `packages/core/src/services/LEARNINGS.md` | ✅ Updated | Has `ai.ts` entry dated 2026-03-08, Ajv import gotcha |
| `packages/cli/src/commands/LEARNINGS.md` | ✅ Updated | Has AIService pattern superseding note |
| `packages/apps/backend/LEARNINGS.md` | ✅ Updated (via commit bc4cec7) | |

### ✅ AGENTS.md

| Item | Status | Notes |
|------|--------|-------|
| `arete meeting extract` command | ✅ Present in dist/AGENTS.md | Line 56 |
| `arete credentials login` | ✅ Present | Documented |
| `arete credentials show/test` | ✅ Present | Documented |
| `arete config show/set` | ✅ Present | Documented |

### ⚠️ → ✅ Capability Catalog (Fixed — Multiple Gaps Found)

The catalog hadn't been updated since 2026-03-04. Four days of significant work was missing.

| Capability | Status | Notes |
|------------|--------|-------|
| ai-service | ⚠️ → ✅ Fixed | Was missing CLI entrypoints (credentials, config commands). Updated. |
| meeting-extraction | ⚠️ → ✅ Added | New entry for `arete meeting extract` command |
| web-dashboard | ⚠️ → ✅ Added | Full Product Intelligence Dashboard (packages/apps/) — was completely missing |
| daily-intelligence | ⚠️ → ✅ Added | `arete daily` morning brief command |
| momentum-tracking | ⚠️ → ✅ Added | `arete momentum` + core momentum.ts service |
| signal-patterns | ⚠️ → ✅ Added | Cross-person pattern detection (patterns.ts) |
| lastUpdated | ⚠️ → ✅ Fixed | Was 2026-03-04, updated to 2026-03-08 |

**Total capabilities**: 8 → 13 (5 new entries added)

---

## Gaps Identified

### 🟡 Expertise Profiles (Low Priority - Manual Review Items)

**`.pi/expertise/core/PROFILE.md`** - Missing recent additions:
- [ ] `ai.ts` service not in Component Map
- [ ] `credentials.ts` module not mentioned
- [ ] OAuth credential flow not documented

**`.pi/expertise/cli/PROFILE.md`** - Missing recent commands:
- [ ] `credentials.ts` command not in Command Map
- [ ] `config.ts` command not in Command Map  
- [ ] `meeting extract` subcommand not mentioned

**Assessment**: These are expertise profiles for BUILD mode agents. They're "manual review needed" items per the plan's notes.md analysis. The core documentation (LEARNINGS.md, AGENTS.md) is accurate. Profiles are supplementary orientation docs.

### ✅ All Critical Items Covered

- Memory entries exist and indexed
- LEARNINGS.md files updated where code changed
- AGENTS.md has new commands
- Capability catalog has new service

### ⚠️ → ✅ User-Facing Documentation (Fixed)

| Document | Status | Notes |
|----------|--------|-------|
| `packages/runtime/GUIDE.md` | ⚠️ → ✅ Fixed | CLI Reference missing 7 commands: view, daily, momentum, commitments, credentials, config, meeting extract |
| `packages/runtime/UPDATES.md` | ⚠️ → ✅ Fixed | No release notes for web dashboard, intelligence commands, AI configuration |

---

## Conclusion

**Overall Status**: ⚠️ → ✅ **Documentation gaps found and fixed**

The audit revealed three tiers of documentation with different failure modes:

| Tier | Status | Notes |
|------|--------|-------|
| **Critical** (LEARNINGS, memory, AGENTS.md) | ✅ Intact | Orchestrator Phase 3 handles these |
| **Peripheral** (catalog, profiles) | ⚠️ → ✅ Fixed | No enforcement = gets skipped |
| **User-facing** (GUIDE.md, UPDATES.md) | ⚠️ → ✅ Fixed | Different audience = forgotten entirely |

**Key insight**: BUILD mode agents focus on code artifacts. User-facing documentation for GUIDE mode users gets neglected because no one triggers it.

**Recommendation**: The `/wrap` checklist must explicitly include user-facing docs as a category.

---

## Action Items

1. [Optional] Update `.pi/expertise/core/PROFILE.md` to add AIService + credentials in Component Map
2. [Optional] Update `.pi/expertise/cli/PROFILE.md` to add credentials + config commands
3. [Done] This audit validates the wrap-command plan's checklist design is reasonable

---

## Process Notes

This audit was conducted by:
1. Reviewing git commits from past 5 days
2. Cross-referencing each significant change against LEARNINGS.md, MEMORY.md, AGENTS.md, capability catalog
3. Checking expertise profiles for completeness
4. Documenting findings in this file

The audit confirms that the wrap-command's proposed checklist items (memory entry, MEMORY.md index, LEARNINGS.md, AGENTS.md rebuild, capability catalog) are the right things to check.
