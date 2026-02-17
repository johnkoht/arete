# Intelligence Patterns (Shared)

These patterns are used by multiple Areté skills. When a skill says "use the get_meeting_context pattern" or "use the extract_decisions_learnings pattern", follow the steps below.

---

## Template Resolution

**Purpose**: Locate the correct template file for a skill, respecting user customization over skill defaults.

**Used by**: Any skill that loads a template before generating output (create-prd, prepare-meeting-agenda, discovery, competitive-analysis, construct-roadmap).

### Resolution — use the CLI, not manual path checking

Template resolution is handled by the CLI. Each skill's SKILL.md specifies the exact command. The general form is:

```
arete template resolve --skill {skill-id} --variant {variant}
```

Use the command output as the document structure. Do not add sections from elsewhere. The CLI checks the workspace override path first, falls back to the skill default — the agent does not make this decision.

**Workspace override path** (unified for all skills): `templates/outputs/{skill-id}/{variant}.md`
**Skill default path**: `.agents/skills/{skill-id}/templates/{variant}.md`

Where `{category}` matches the template group:

| Skill | Template type | Workspace override path | Variant(s) |
|-------|--------------|------------------------|------------|
| `create-prd` | PRD output | `templates/outputs/create-prd/` | `prd-simple`, `prd-regular`, `prd-full` |
| `create-prd` | Project README | `templates/projects/definition/` | `project` |
| `prepare-meeting-agenda` | Agenda | `templates/meeting-agendas/` | `customer`, `dev-team`, `leadership`, `one-on-one`, `other` |
| `discovery` | Project README | `templates/projects/discovery/` | `project` |
| `discovery` | Research inputs | `templates/inputs/` | `research-note`, `user-feedback` |
| `competitive-analysis` | Project README | `templates/projects/analysis/` | `project` |
| `construct-roadmap` | Project README | `templates/projects/roadmap/` | `project` |
| `construct-roadmap` | Roadmap output | `templates/outputs/construct-roadmap/` | `roadmap` |
| `week-plan` | Week file | `templates/plans/` | `week-priorities` |
| `quarter-plan` | Quarter file | `templates/plans/` | `quarter-goals` |

### How to customize a template

Drop a file at the workspace override path — no config, no reinstall:

```
# Custom PRD template
templates/outputs/create-prd/prd-simple.md

# Custom meeting agenda
templates/meeting-agendas/one-on-one.md

# Custom discovery project structure
templates/projects/discovery/project.md

# Custom week plan structure
templates/plans/week-priorities.md

# Custom roadmap output format
templates/outputs/construct-roadmap/roadmap.md
```

The skill will use your file automatically on its next run.

### For skills without multiple variants

Use `default.md` as the variant name:
```
templates/outputs/{skill-id}/default.md
```

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

## refresh_person_memory

**Purpose**: Keep person profiles up to date with repeated asks/concerns from meeting notes and transcripts.

**Used by**: process-meetings, meeting-prep, prepare-meeting-agenda

**Steps**:

1. Ensure attendees are resolved to person files (`people/{internal|customers|users}/*.md`).
2. Scan recently processed meeting content for person-specific signals:
   - asks: "[Name] asked about/for..."
   - concerns: "[Name] is concerned about...", "[Name] pushed back on..."
3. Aggregate repeated mentions (default threshold: 2+ mentions) and keep source references.
4. Refresh each person file's auto-managed section (`## Memory Highlights (Auto)`).
5. Preserve manual notes; only replace the auto-managed section.

**Stale-aware (recommended for prep/planning)**:

```bash
arete people memory refresh --person jane-doe --if-stale-days 3
```

Use a short freshness window (3 days) for meeting prep/daily planning and a longer window (7 days) for week planning.

**CLI helper**:

```bash
arete people memory refresh
arete people memory refresh --person jane-doe
```

**Output**: Person profiles include fast-access highlights for recurring asks/concerns, with mention counts and recent sources.

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
