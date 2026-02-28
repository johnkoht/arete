# Pre-Mortem: Router Trigger Improvements

## Risk 1: Test Quality — Overfitting to Specific Queries

**Problem**: Adding tests for the exact two failing queries might pass after trigger expansion, but doesn't validate the underlying scoring fix. Future similar queries (e.g., "I need to add some documents to my workspace") would still fail.

**Mitigation**: 
- Add tests for **patterns**, not just specific queries:
  - Test category: "content ingestion queries" (3-4 variations)
  - Test category: "queries that should NOT match prepare-meeting-agenda" (2-3 variations)
- Include negative test cases: queries that previously false-positived to wrong skills

**Verification**: Test file includes comments grouping tests by pattern category, not just by specific query.

---

## Risk 2: Test Quality — Incomplete Skill Fixture

**Problem**: Golden tests in `route.test.ts` create minimal skill fixtures (just `meeting-prep` and `onboarding`). New tests for routing between `rapid-context-dump` and `prepare-meeting-agenda` need both skills in fixtures. Missing skills means tests pass but don't validate real routing behavior.

**Mitigation**:
- Create a comprehensive skill fixture set that includes all skills relevant to disambiguation:
  - `rapid-context-dump` (target skill for new queries)
  - `prepare-meeting-agenda` (current false positive)
  - `save-meeting` (related — could also false positive)
  - `capture-conversation` (related — content capture)
- Use realistic trigger lists and descriptions from actual SKILL.md files

**Verification**: Test fixture includes at least 4 skills with realistic metadata copied from runtime skills.

---

## Risk 3: Scoring Algorithm Change — Unintended Regressions

**Problem**: Changing the minimum overlap threshold from 1 to 2 tokens could break legitimate routing for skills that rely on single-word description matches (e.g., "roadmap" → `construct-roadmap`).

**Mitigation**:
- Before changing `scoreMatch()`, run existing test suite to establish baseline
- After changes, verify all 23+ existing routing tests still pass
- Add specific tests for skills that might be affected by single-word matching:
  - "roadmap planning" → `construct-roadmap`
  - "discovery" → `discovery`
  - "synthesize" → `synthesize`

**Verification**: `npm test` passes with 0 failures after scoring changes.

---

## Risk 4: Trigger Expansion — Creating New False Positives

**Problem**: Adding triggers like "add to context" or "save document" to `rapid-context-dump` might cause it to match queries that should go elsewhere (e.g., "save this meeting" should go to `save-meeting`, not `rapid-context-dump`).

**Mitigation**:
- For each new trigger added, write a test that confirms it doesn't steal from related skills
- Prioritize multi-word phrase triggers over single words
- Add disambiguation tests: "save this meeting" → `save-meeting` (not `rapid-context-dump`)

**Verification**: Test file includes at least 2 disambiguation tests per new trigger phrase.

---

## Risk 5: Test Quality — Not Testing the Actual Router

**Problem**: Tests in `packages/core/test/services/intelligence.test.ts` test `routeToSkill` with mock candidates. Tests in `packages/cli/test/golden/route.test.ts` test CLI output. Neither directly tests routing with real runtime skills.

**Mitigation**:
- Golden tests should create fixtures that match actual runtime skill metadata
- Consider adding an integration test that loads actual skills from `packages/runtime/skills/`
- At minimum, copy exact trigger lists and descriptions from SKILL.md files into fixtures

**Verification**: Fixture skills have `triggers` and `description` copied verbatim from corresponding SKILL.md files.

---

## Risk 6: Incomplete Coverage — Only Testing Happy Path

**Problem**: Tests might only verify that correct skill is matched, but not verify that incorrect skills are NOT matched. A test that passes could still allow false positives.

**Mitigation**:
- For each new routing test, add explicit negative assertion:
  ```typescript
  assert.notEqual(result.skill, 'prepare-meeting-agenda', 'Should not route to agenda skill');
  ```
- Add "no match" tests for queries that shouldn't match any skill strongly

**Verification**: Each routing test includes at least one negative assertion.

---

## Risk 7: Multi-Skill Ambiguity Not Captured

**Problem**: The router returns the single best match. We're not testing the second-best match, which might reveal that `prepare-meeting-agenda` still scores high (just not highest). Future changes could flip the ranking.

**Mitigation**:
- After implementing, manually test with debug output showing all skill scores
- Consider adding a test utility that returns top-N matches for debugging
- Document expected score ranges in test comments

**Verification**: At least one test comment documents expected relative scoring behavior.

---

## Summary

| # | Risk | Category | Severity |
|---|------|----------|----------|
| 1 | Overfitting to specific queries | Test Quality | Medium |
| 2 | Incomplete skill fixtures | Test Quality | High |
| 3 | Scoring change regressions | Integration | Medium |
| 4 | New trigger false positives | Integration | Medium |
| 5 | Not testing actual router | Test Quality | Medium |
| 6 | Only testing happy path | Test Quality | High |
| 7 | Multi-skill ambiguity hidden | Test Quality | Low |

**Total risks identified**: 7  
**Categories covered**: Test Quality (5), Integration (2)

---

## Recommended Test Structure

Based on the pre-mortem, here's a recommended test structure:

```typescript
describe('routing: content ingestion queries', () => {
  // Fixture: realistic skills from runtime
  const CONTENT_SKILLS = [
    { id: 'rapid-context-dump', triggers: [...], description: '...' },
    { id: 'prepare-meeting-agenda', triggers: [...], description: '...' },
    { id: 'save-meeting', triggers: [...], description: '...' },
    { id: 'capture-conversation', triggers: [...], description: '...' },
  ];

  describe('should route to rapid-context-dump', () => {
    it.each([
      'I have input data to add about Reserve, the product team, etc.',
      'save a lengthy document and include it in context',
      'where should I put this content?',
      'add this to my workspace context',
    ])('routes "%s" to rapid-context-dump', (query) => {
      const result = routeToSkill(query, CONTENT_SKILLS);
      assert.equal(result?.skill, 'rapid-context-dump');
      assert.notEqual(result?.skill, 'prepare-meeting-agenda'); // negative
    });
  });

  describe('should NOT steal from related skills', () => {
    it('routes "save this meeting" to save-meeting, not rapid-context-dump', () => {
      const result = routeToSkill('save this meeting', CONTENT_SKILLS);
      assert.equal(result?.skill, 'save-meeting');
      assert.notEqual(result?.skill, 'rapid-context-dump');
    });
  });
});
```
