# Pre-Mortem: Goals Refactor (Phase 2)

**Date**: 2026-03-17
**Plan**: `goals-refactor/plan.md`
**Risk Level**: Medium

---

## Risk Analysis

### 1. Migration Format Detection Failure
**Category**: Implementation
**Severity**: High
**Likelihood**: Medium

**Scenario**: The migration script doesn't detect all legacy formats. Users with `### Qn-N` format have goals silently skipped.

**Evidence**: LEARNINGS.md in backend shows tests use `### Q1-1` but parser expects `## Goal N:`. At least 3 formats exist in the wild.

**Mitigation**:
- [ ] Migration detects all 3 known formats with explicit regex patterns
- [ ] Test fixture for each format
- [ ] Migration outputs count: "Migrated N goals" so user knows if some were missed
- [ ] Add `--dry-run` flag to preview without writing

---

### 2. Context Service Regression
**Category**: Backward Compatibility
**Severity**: High
**Likelihood**: Medium

**Scenario**: Glob change to `goals/*.md` breaks context injection for unmigrated workspaces (no individual files yet).

**Mitigation**:
- [ ] Fallback: If no individual files found, include `quarter.md`
- [ ] Test: "Only quarter.md exists" scenario
- [ ] Test: "Mixed format" scenario (some individual + quarter.md)
- [ ] Context service logs warning if legacy format detected

---

### 3. Backend Response Shape Change
**Category**: API Compatibility
**Severity**: Critical
**Likelihood**: Low

**Scenario**: Web UI expects exact `QuarterOutcome` shape. Parser returns different fields or different field names. React components crash or show empty.

**Mitigation**:
- [ ] Backend route maintains exact response shape: `{ outcomes: QuarterOutcome[], quarter: string, found: boolean }`
- [ ] `QuarterOutcome` fields unchanged: `id`, `title`, `successCriteria`, `orgAlignment`
- [ ] Integration test asserts response shape
- [ ] No optional fields become required

---

### 4. Skill Inconsistency During Rollout
**Category**: User Experience
**Severity**: Medium
**Likelihood**: Low (if we ship all skills together)

**Scenario**: User runs `quarter-plan` (new format), then `week-plan` (old reader). Goals appear missing or duplicated.

**Mitigation**:
- [ ] All 6 skills updated in same release
- [ ] Skills share parser logic (via CLI commands or direct service import)
- [ ] Test: Run quarter-plan → week-plan → verify goals visible

---

### 5. CLI Seed Creates Wrong Structure
**Category**: New User Experience
**Severity**: Medium
**Likelihood**: Low

**Scenario**: New user runs `arete install`, seed scaffolds old `quarter.md` format, parser expects individual files. Goals page shows empty.

**Mitigation**:
- [ ] Task 2.5 updates seed before backend/skills
- [ ] Seed creates individual goal file scaffold
- [ ] Integration test: `arete install` → verify goals readable

---

### 6. Frontmatter Schema Not Documented
**Category**: Developer Experience
**Severity**: Low
**Likelihood**: Medium

**Scenario**: Users manually create goal files with wrong frontmatter. Parser silently skips them or extracts wrong data.

**Mitigation**:
- [ ] Document frontmatter schema in user guide
- [ ] Parser validates required fields, warns on missing
- [ ] Example goal file in scaffold

---

### 7. Performance Degradation with Many Goals
**Category**: Performance
**Severity**: Low
**Likelihood**: Low

**Scenario**: User has 50+ goal files. Globbing + parsing on every context request causes noticeable delay.

**Mitigation**:
- [ ] Defer caching to Phase 3 (premature optimization)
- [ ] Document: "If performance issues, we'll add caching"
- [ ] Goal parser is pure function, easy to wrap with cache later

---

### 8. Migration Backup Not Discoverable
**Category**: User Experience
**Severity**: Low
**Likelihood**: Medium

**Scenario**: User runs migration, checks `goals/`, doesn't see backup. Panics about data loss.

**Mitigation**:
- [ ] Migration outputs: "Backup saved to .quarter.md.backup"
- [ ] Backup is visible with `ls -la` (dotfile, but visible)
- [ ] Migration guide explains backup location

---

## Summary

| # | Risk | Severity | Mitigation Required |
|---|------|----------|---------------------|
| 1 | Format detection | High | Yes — all 3 formats + tests |
| 2 | Context regression | High | Yes — fallback + tests |
| 3 | API shape change | Critical | Yes — exact shape + test |
| 4 | Skill inconsistency | Medium | Yes — ship all 6 together |
| 5 | CLI seed | Medium | Yes — update seed early |
| 6 | Frontmatter schema | Low | Optional — docs |
| 7 | Performance | Low | Defer caching |
| 8 | Backup visibility | Low | Optional — output message |

**Mitigations Required**: 5 (Risks 1-5)
**Mitigations Optional**: 3 (Risks 6-8)
