## Summary

I've completed a **comprehensive Senior Engineering Lead review** of the search command consolidation plan. Here's what I found:

### 🎯 **DECISION: APPROVED FOR IMPLEMENTATION**

The plan is technically feasible and well-architected. The original pre-mortem identified valid blockers; the revised approach addresses them soundly.

### ✅ **Architecture Validation**

| Component | Status | Finding |
|-----------|--------|---------|
| **Multi-Collection QMD** | ✅ Feasible | Code review confirms `ensureQmdCollection()` supports this; needs scope-specific masks |
| **Empty Directories** | ✅ Handled | QMD gracefully handles empty collections |
| **`qmd embed`** | ✅ Works | Embeds all collections in one command |
| **Performance** | ✅ Acceptable | 6 collections vs 1: ~5-10s update, ~10-20s embed |
| **`arete.yaml` Change** | ✅ Backward Compatible | Old `qmd_collection` field and new `qmd_collections` coexist safely |
| **`--intent` Flag** | ✅ Valid QMD Feature | Confirmed in `qmd query --help`; part of query grammar |
| **`--answer` AI Synthesis** | ✅ Sound | AIService design already supports task-based routing |

### 🛑 **5 Critical Fixes Required (Pre-Implementation)**

1. **QMD Collection Filtering** (Blocker)
   - Current: `packages/core/src/search/providers/qmd.ts` ignores `SearchOptions.paths`
   - Fix: Add `-c, --collection` flag when calling `qmd query`

2. **Output Schema Documentation** (Concern)
   - Define 3 schemas: default search, timeline mode, with --answer
   - Document which schema is returned for each mode

3. **Skill/Documentation Update Coordination** (Blocker)
   - 45+ references identified across 18+ files
   - **Mandatory**: Update PATTERNS.md, _authoring-guide.md, and 3 skills BEFORE adding deprecation warnings
   - Phase 5 can only proceed after skill updates verified via grep

4. **Test Coverage Matrix** (Concern)
   - Missing tests for `--scope memory|meetings|context|projects|people`
   - Missing tests for `--person`, `--timeline --days`, `--answer` variants
   - Write test cases before implementation

5. **Config Migration Logic** (Concern)
   - Existing workspaces have `qmd_collection: "..."` (singular)
   - Add migration to support new `qmd_collections: {...}` (plural) format

### 📋 **What's Solid**

- Service layer isolation — no changes to context.ts, memory.ts, entity.ts ✓
- QMD multi-collection infrastructure already exists ✓
- Deprecation path is pragmatic (phased: keep → warn → hide → remove) ✓
- Config storage supports nested keys ✓

### 🚀 **Recommended Priority Order**

1. **Phase 0**: Setup & Planning (test matrix, output schemas, scope-mask mapping)
2. **Phase 1**: Multi-Collection Setup (with scope-specific masks + migration logic)
3. **Phase 2**: Create search.ts (with collection filtering FIX #1)
4. **Phase 3**: Timeline Mode
5. **Phase 4**: AI Synthesis
6. **Phase 5**: **Mandatory skill updates → then deprecation warnings**
7. **Phase 6-7**: Documentation & remaining skills

---

**Full review written to**: `/Users/john/code/worktrees/arete--consolidate-search-command/context.md`