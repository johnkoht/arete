# Upgrade Guide: Workspace Areas

This guide helps existing Areté users adopt the new Areas system.

## What's New

**Areas** are persistent work domains that accumulate intelligence across quarters. Unlike projects (which are time-bound), areas represent ongoing relationships, initiatives, or responsibilities.

Examples:
- **Customer: Acme Corp** — your ongoing relationship with a key customer
- **Initiative: Platform Migration** — a long-running strategic initiative
- **Team: Design** — your collaboration with a specific team
- **Domain: API Strategy** — a subject matter you own

## Key Benefits

1. **Meeting context injection**: Recurring meetings auto-pull their area's context (key decisions, current state, open commitments) into meeting prep.

2. **Intelligence accumulation**: Decisions, commitments, and learnings from meetings are routed to the right area file.

3. **Area-aware planning**: Weekly and daily planning skills show your work organized by area.

## How to Upgrade

### Step 1: Update Areté

```bash
arete update
```

This creates the `areas/` directory in your workspace.

### Step 2: Create Your First Area

```bash
arete create area <slug>
```

Example:
```bash
arete create area acme-corp
```

This creates:
- `areas/acme-corp.md` — The area file with YAML frontmatter
- `context/acme-corp/` — A directory for area-specific context files

### Step 3: Configure Recurring Meetings

Edit your area file (`areas/acme-corp.md`) and add recurring meetings to the YAML frontmatter:

```yaml
---
area: Acme Corp
status: active
recurring_meetings:
  - title: Acme Weekly Sync
    attendees:
      - john@acme.com
      - sarah@acme.com
    frequency: weekly
  - title: Acme Quarterly Review
    frequency: quarterly
---
```

When you run `arete meeting-prep` for "Acme Weekly Sync", it will automatically pull context from this area file.

### Step 4: (Optional) Link Goals to Areas

Add `area: <slug>` to your goals:

```yaml
---
title: Expand Acme contract
type: quarter
quarter: Q2-2026
target: Sign SOW by end of quarter
area: acme-corp
---
```

This shows area groupings in weekly planning.

### Step 5: (Optional) Use Area Context in Meetings

After processing a meeting, extracted decisions and commitments can be routed to the area:
- Decisions appear in the area's `## Key Decisions` section
- Commitments are tagged with the area

## File Structure

After creating areas, your workspace looks like:

```
.arete/
├── areas/
│   ├── _template.md         # Template for new areas
│   ├── acme-corp.md          # Your area files
│   └── platform-migration.md
├── context/
│   ├── acme-corp/           # Area-specific context
│   │   ├── contracts.md
│   │   └── stakeholders.md
│   └── strategy.md           # Company-wide context
├── goals/
│   └── q2-expand-acme.md     # Goals with area: links
└── ...
```

## Area vs Project

| Aspect | Area | Project |
|--------|------|---------|
| Duration | Persistent (ongoing) | Time-bound (has end) |
| Examples | Customer relationship, Team | Q2 Feature, Migration |
| Frontmatter | `recurring_meetings:` | `area: <slug>` |
| Location | `areas/{slug}.md` | `projects/{slug}.md` |

Projects can link to areas via the `area:` frontmatter field.

## Tips

1. **Start with 2-3 areas**: Don't over-organize. Create areas for your most important work domains first.

2. **Use recurring meetings as signals**: If you have a recurring meeting, you probably need an area for it.

3. **Let intelligence accumulate**: The value of areas grows over time as decisions, commitments, and context accumulate.

4. **Archive when done**: When an area is no longer active, set `status: archived` in the frontmatter.

## Backward Compatibility

Existing workspaces work unchanged. Areas are opt-in:
- Goals without `area:` field continue to work
- Commitments without `area:` field continue to work
- Skills work without areas (just without area context injection)

---

**Questions?** Run `arete help create area` or check the full documentation in your workspace's GUIDE.md.
