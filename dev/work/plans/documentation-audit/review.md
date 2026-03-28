# Review: Documentation Audit Skill Plan

**Type**: Plan (pre-execution)  
**Audience**: Builder (internal tooling for developing Areté)
**Reviewer**: Cross-model review via reviewer agent
**Date**: 2026-03-28

---

## Checklist Assessment

| Concern | Status | Notes |
|---------|--------|-------|
| **Audience** | ✅ Pass | Clear — builder-facing skill for Areté development |
| **Scope** | ✅ Pass | Appropriate — creates one skill with existing patterns |
| **Risks** | ✅ Pass | Pre-mortem covers 8 risks across 6 categories, 2 high severity addressed |
| **Dependencies** | ⚠️ Minor | Step 5 unclear — see concern #1 |
| **Patterns** | ✅ Pass | Structure matches ship skill (orchestrator.md, templates/) |
| **Multi-IDE** | ✅ N/A | Build skill only |
| **Backward compatibility** | ✅ N/A | New skill |
| **Catalog** | ⚠️ Gap | New skill should be added to `dev/catalog/capabilities.json` |
| **Completeness** | ⚠️ Gaps | See concerns #2-4 |

---

## Concerns

### 1. Dependencies: Step 5 is ambiguous

**Issue**: Step 5 says "Add skill to AGENTS.md [Skills] section (or verify auto-generation picks it up)."

The `[Skills]` section in AGENTS.md lists `root:runtime/skills` — those are **user-facing** runtime skills. Build skills in `.pi/skills/` are auto-discovered into the `<available_skills>` block (visible in the injected project context). The plan conflates these mechanisms.

**Suggestion**: Replace step 5 with:
> "Verify skill discovery: After creating SKILL.md, run `subagent({ action: "list" })` or check Pi's skill routing to confirm the audit skill is discoverable."

---

### 2. Completeness: Report aggregation flow under-specified

**Issue**: Plan says experts write to `/tmp/audit-{domain}.md` and orchestrator "collects reports," but doesn't specify:
- What **format** should experts use?
- How are **capabilities.json proposals** communicated?
- How does orchestrator **deduplicate and merge**?

**Suggestion**: Add to orchestrator.md a clear report schema with required sections and JSON snippet format for capabilities.json proposals.

---

### 3. Completeness: Approval gate UX undefined

**Issue**: Plan says "Present structural changes for approval" (orchestrator step 5) but doesn't define:
- How is the prompt presented?
- What are the approval options?
- What if builder says "no"?

**Suggestion**: Define approval behavior in orchestrator.md with explicit gate pattern matching existing skills.

---

### 4. Completeness: `--dry-run` behavior unclear

**Issue**: Pre-mortem Risk 8 adds `--dry-run` flag for validation, but plan doesn't specify behavior.

**Suggestion**: Add to SKILL.md:
```markdown
## Flags

`--dry-run`: Run full audit and generate reports but suppress all auto-fixes. 
- Reports still written to `dev/work/audits/{date}.md`
- Proposed changes shown but not applied
- Experts run with `DRY_RUN=true` in their task prompts
```

---

### 5. Catalog: Missing capability entry for the skill itself

**Issue**: `dev/catalog/capabilities.json` tracks extensions, tools, and services. The audit skill should be registered there once created.

**Suggestion**: Add step to register skill in capabilities.json after creation.

---

### 6. Completeness: Collision handling for auto-fixes

**Issue**: LEARNINGS.md auto-fixes could collide if domain boundaries overlap.

**Suggestion**: Add to orchestrator.md: "Before auto-fixing, verify the file is exclusively within your domain. If boundary is unclear, flag for approval."

---

## Strengths

- **Profile injection pattern** (Risk 7 mitigation) is correct — avoids new agent definitions
- **Single-point capabilities.json edit** (Risk 3) is essential and well-designed
- **Explicit file lists in subagent prompts** (Risk 2) follows execute-prd best practices
- **Skill structure** matches existing patterns (ship, execute-prd)
- **Scope is tight** — out-of-scope items are explicitly called out
- **Pre-mortem is thorough** — 8 risks with concrete mitigations

---

## Devil's Advocate

**If this fails, it will be because...** the orchestrator can't reliably parse and merge 5 expert reports that were written in subtly different formats. Pre-mortem Risk 6 acknowledges this, but the mitigation isn't actually implemented in the plan — neither the report template structure nor the enforcement mechanism is specified.

**The worst outcome would be...** auto-fixes introduce regressions. An expert identifies a "gap" that's actually intentional (e.g., a LEARNINGS.md file is empty because the component is new), auto-fixes it with wrong content, and the audit report shows ✅ success.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

**Summary**: The plan is solid and follows established patterns. Three specification gaps should be addressed in implementation:

1. **Define the expert report schema** (concern #2)
2. **Specify --dry-run behavior** (concern #4)
3. **Define approval gate UX** (concern #3)

These can be incorporated into orchestrator.md during implementation.
