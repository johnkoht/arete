# Search Command Consolidation - Engineering Lead Critical Review

**Reviewer**: Paranoid Engineering Lead  
**Date**: 2026-03-10  
**Stance**: Adversarial — find reasons NOT to proceed

---

## 🛑 STOP — Blocking Issues

### Issue #1: QMD SearchProvider Does NOT Support Path Filtering

**Evidence**: In `packages/core/src/search/providers/qmd.ts`, the `semanticSearch()` method ignores the `options.paths` parameter entirely:

```typescript
async semanticSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  const limit = options?.limit ?? 10;
  try {
    const { stdout } = await execFileAsyncImpl(
      'qmd',
      ['query', query, '--json', '-n', String(limit)],  // No path filtering!
      { timeout: DEFAULT_TIMEOUT_MS, cwd: workspaceRoot, maxBuffer: 10 * 1024 * 1024 }
    );
    // ...
  }
}
```

The `--scope memory` flag relies on path filtering. With QMD, this won't work — all results will be returned regardless of scope.

**Good news**: The **fallback provider** DOES support path filtering (line 97 of fallback.ts):
```typescript
const scopePaths = options?.paths?.length ? options.paths : ['.'];
```

**Mitigation Options**:
1. Post-filter QMD results by path prefix (simple, ~10 lines of code)
2. Check if `qmd query` CLI supports a `--path` or `--filter` flag
3. Document that scope filtering may be less precise with QMD

**Severity**: HIGH — Core feature doesn't work as specified  
**Recommendation**: Add post-filtering for QMD results. This is ~10 lines:
```typescript
const filtered = results.filter(r => 
  scopePaths.some(prefix => r.path.startsWith(prefix))
);
```

---

### Issue #2: Output Format Incompatibility

**Evidence**: The three commands return fundamentally different JSON shapes:

| Command | Root Field | Item Shape |
|---------|------------|------------|
| `context --for` | `files[]` | `{ path, relativePath, category, summary, relevanceScore }` |
| `memory search` | `results[]` | `{ content, source, type, date, relevance }` |
| `memory timeline` | `items[]` | `{ title, content, date, source, relevanceScore, type }` |

**Problem**: Consumers parsing JSON output will break when the unified `search` command returns a different shape.

**Mitigation Options**:
1. **Mode-specific schemas** — Document that `--scope memory` returns memory format, etc.
2. **Unified schema with discriminator** — `{ type: 'file' | 'memory' | 'timeline', ... }`
3. **Normalized minimal schema** — Force all results into `{ title, content, date, source, score, type }`

**Severity**: MEDIUM-HIGH — Breaking change for programmatic consumers  
**Recommendation**: Option 1 (mode-specific schemas). Document explicitly in JSON output which schema is being returned.

---

### Issue #3: Runtime Skills Will Silently Break

**Evidence**: Skills call these commands directly:

`packages/runtime/skills/PATTERNS.md` (lines 418-420):
```markdown
2. **Gather strategy & goals** — Run `arete context --for "<topic>"`. 
3. **Gather existing memory** — Run `arete memory search "<topic>"`.
```

`packages/runtime/skills/week-review/SKILL.md`:
```markdown
1. **Strategy & goals** — Run `arete context --for "<topic>"` ...
2. **Existing memory** — Run `arete memory search "<topic>"` ...
```

**Problem**: When deprecated commands are removed, these skills will fail. There's no runtime error — the command just won't exist.

**Mitigation**: 
- Phase 1: Keep deprecated commands working with warnings
- Update all skill files BEFORE removing commands
- Deprecation warnings should go to STDERR (not STDOUT) to avoid polluting JSON output

**Severity**: HIGH — User workflows break silently  
**Recommendation**: Mandatory doc update pass before Phase 3 (removal)

---

## ⚠️ CONCERN — Secondary Risks

### Concern #1: EntityService Ambiguity for `--person`

**Question**: What if `EntityService.resolve("jane", "person", paths)` returns:
- Multiple matches? (Jane Smith and Jane Doe)
- No matches?
- A person without any meeting mentions?

**Recommendation**: Fail fast with helpful error messages. Don't guess.

### Concern #2: AIService Failure Handling for `--answer`

**Question**: What happens if:
- AI isn't configured → Return results only with warning (confirmed behavior)
- AI call fails mid-request → Should we show partial results? Error?
- AI returns unhelpful response → User sees bad answer with no fallback

**Recommendation**: Always return results. AI synthesis is additive, not blocking.

### Concern #3: Test Coverage Gaps

**Current tests**: 
- `context.test.ts` — 4 tests
- `memory-search.test.ts` — 3 tests

**Missing tests for new features**:
- `--scope` with each scope value
- `--person` with resolved/unresolved/ambiguous names
- `--timeline` without `--days`
- `--answer` with AI configured/not configured
- Flag combinations (`--scope memory --timeline`)

**Recommendation**: Write test matrix before implementation.

### Concern #4: QMD Index Freshness

**Issue**: QMD index might not include recently added files. If user adds a meeting and immediately searches, it won't appear.

**Recommendation**: Document that `arete index` should be run after adding content. Consider automatic refresh hint in output.

### Concern #5: Deprecation Warning Location

**Issue**: Where do deprecation warnings go?
- STDOUT → Breaks `--json` output parsing
- STDERR → May not be visible in some contexts

**Recommendation**: STDERR for warnings. Document in JSON output: `{ "deprecated": true, "migration": "Use arete search instead" }`

---

## 👀 WATCH — Minor Risks

1. **Help text clarity** — New flags need clear, concise help. Don't just list options — explain when to use each.
2. **Command completion** — Shell completions may need updating.
3. **Memory search type filtering** — Current `--types` flag becomes redundant with `--scope memory`. Remove or map?
4. **Timeline date range** — `--days` vs `--from/--to` — current timeline supports both. New command should too.

---

## ✅ OK — Solid Foundations

1. **Service layer design** — No service changes needed. ContextService and MemoryService are well-isolated.
2. **Test infrastructure** — Golden file tests exist. Extending them is straightforward.
3. **AGENTS.md auto-generation** — Update `.agents/sources/` and regeneration handles the rest.
4. **Deprecation warning utility** — `warn()` from formatters.ts writes to stderr. Ready to use.
5. **EntityService.resolve()** — Already handles single-match case well. Just need to add error handling for edge cases.

---

## Pre-Implementation Checklist

Before writing any code:

- [ ] **Decide**: Mode-specific JSON schemas or unified schema?
- [ ] **Implement**: Post-filtering for QMD results by path prefix
- [ ] **Document**: Which schema is returned for each `--scope` value
- [ ] **Test matrix**: Write test cases for all flag combinations
- [ ] **Skills audit**: Confirm all 45+ references have migration paths
- [ ] **Deprecation plan**: Confirm stderr-only warnings + JSON `deprecated` field

---

## Verdict

**Should we proceed?** YES, with mitigations.

The issues are all addressable:
1. QMD path filtering → Post-filter results (~10 lines)
2. Output format → Document mode-specific schemas
3. Skill breakage → Update skills before removal phase

The core design is sound. The service layer is well-isolated. The test infrastructure is ready.

**Recommended approach**:
1. **Phase 1**: Create `search.ts` with post-filtering. Keep deprecated commands working with stderr warnings.
2. **Phase 2**: Update all runtime skills and documentation.
3. **Phase 3**: After 1 release cycle, hide deprecated commands from help.
4. **Phase 4**: After 2 release cycles, remove deprecated commands.
