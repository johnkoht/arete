# Intelligence Patterns (Shared)

These patterns are used by multiple Areté skills. When a skill says "use the get_meeting_context pattern" or "use the extract_decisions_learnings pattern", follow the steps below.

---

## get_meeting_context

**Purpose**: Given a meeting (title and/or attendees), assemble full context: people, prior meetings, related projects, outstanding action items.

**Used by**: meeting-prep, daily-plan, prepare-meeting-agenda (for suggested agenda items; gather when meeting has specific purpose, named attendees, or relevant plan files—see skill step 4)

**Inputs**: Meeting title (optional), attendee names or slugs.

**Steps**:

1. **Resolve attendees** — Match names to people slugs (search `people/index.md` or `people/**/*.md` by name; or use slug directly). Optionally `qmd query "[attendee name] person"`.
2. **Read person files** — For each attendee: `people/{internal|customers|users}/{slug}.md`. Extract name, role, company, recent notes.
3. **Search meetings** — Prefer scanning `resources/meetings/index.md` (table: Date | Title | Attendees | Recording | Topics). Match by Topics column or attendee names, then open the linked file(s). Alternatively list `resources/meetings/*.md` and filter by frontmatter `attendee_ids` or body/attendees; sort by date descending; take 1–3 most recent.
4. **Read projects** — Scan `projects/active/*/README.md` for `stakeholders` or body mentions of attendee names/slugs.
5. **Extract action items** — From recent meetings: "## Action Items" or similar; collect unchecked `- [ ] ...`. Prefer items referencing the attendee or "For me" / "Follow up".
6. **QMD (optional)** — `qmd query "decisions or learnings involving [attendee] or [company]"`, `qmd query "meetings or notes about [topic]"`. Incorporate into brief.

**Outputs**: Attendee details, recent meetings (1–3 with summary), related projects, outstanding action items, prep suggestions.

---

## extract_decisions_learnings

**Purpose**: Scan content for candidate decisions and learnings, present for inline review, write approved items to memory.

**Used by**: process-meetings, sync, finalize-project

**Steps**:

1. **Scan for decisions** — Look for: "we decided", "going with", "the plan is", "consensus was".
2. **Scan for learnings** — Look for: user insights, process observations, market/competitive insights, surprises.
3. **Format candidates** — For each: title, source reference, context quote, suggested memory format.
4. **Present for review** — Show each candidate; user chooses Approve / Edit / Skip.
5. **Write approved items** — Append to `.arete/memory/items/decisions.md` or `.arete/memory/items/learnings.md` using the standard formats below.

**Decision format** (append to decisions.md):

```markdown
### YYYY-MM-DD: [Decision Title]
**Project**: [If applicable]
**Context**: [What led to this decision]
**Decision**: [What was decided]
**Rationale**: [Why this choice]
**Alternatives Considered**: [If known]
**Status**: Active
```

**Learning format** (append to learnings.md):

```markdown
### YYYY-MM-DD: [Learning Title]
**Source**: [What surfaced this]
**Insight**: [What was learned]
**Implications**: [How this affects future work]
**Applied To**: [Updated as used]
```

**Rule**: Never write to memory without user approval. Always present candidates for Approve / Edit / Skip first.

---

## light_pre_mortem

**Purpose**: Quick risk identification before committing to a decision (PRD, quarter plan, roadmap). Takes 5 minutes; surfaces 2-3 risks with mitigations.

**Used by**: create-prd, quarter-plan, construct-roadmap

**Steps**:

1. **Frame the scenario** — "If [this decision/plan/PRD] failed 6 months from now, what would have caused it?"
2. **Surface 2-3 risks** — Ask the user to identify specific failure causes (not vague "bad execution")
3. **Define one mitigation per risk** — Concrete action to reduce likelihood or impact
4. **Document** (optional) — Add risks/mitigations to the deliverable (PRD, quarter file, roadmap)

**Outputs**: 2-3 risk-mitigation pairs; optional inclusion in deliverable.

**Note**: For higher-stakes decisions (PRD execution, large refactors), use the full pre-mortem template at `dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md` with 8 risk categories.
