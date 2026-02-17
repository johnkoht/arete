# Templates

This folder is **your customization space** for Areté's output and document templates.

> **Agent tip**: If you're an agent helping a user customize a template, read this file first, then find the skill's default template in `.agents/skills/{skill-id}/templates/`, show it to the user, and help them create their override at the path shown below.

---

## How it works

Every skill that produces a document has a built-in default template bundled alongside it in `.agents/skills/{skill-id}/templates/`. You never need to touch those files.

To customize, drop your version at the **workspace override path** for that template. The skill picks it up automatically — no config, no reinstall.

**Resolution order** (first match wins):

```
1. templates/{category}/{variant}.md      ← your override (this folder)
2. .agents/skills/{skill}/templates/...  ← skill default (read-only)
```

---

## What you can customize

| What | Your override path | Variants |
|------|--------------------|----------|
| **PRD templates** | `templates/outputs/create-prd/` | `prd-simple.md`, `prd-regular.md`, `prd-full.md` |
| **Meeting agendas** | `templates/meeting-agendas/` | `one-on-one.md`, `leadership.md`, `customer.md`, `dev-team.md`, `other.md` |
| **Week plan structure** | `templates/plans/` | `week-priorities.md` |
| **Quarter goals structure** | `templates/plans/` | `quarter-goals.md` |
| **Roadmap output** | `templates/outputs/construct-roadmap/` | `roadmap.md` |
| **Discovery project README** | `templates/projects/discovery/` | `project.md` |
| **PRD project README** | `templates/projects/definition/` | `project.md` |
| **Competitive analysis README** | `templates/projects/analysis/` | `project.md` |
| **Roadmap project README** | `templates/projects/roadmap/` | `project.md` |
| **Research notes** | `templates/inputs/` | `research-note.md` |
| **User feedback capture** | `templates/inputs/` | `user-feedback.md` |

---

## How to customize a template

1. **Find the default** — open `.agents/skills/{skill-id}/templates/{variant}.md`
2. **Copy it** to the override path in this folder (create the folder if needed)
3. **Edit** your copy — the skill uses it immediately on the next run
4. **Test it** — ask the agent to run the skill and verify your changes

Your file is never overwritten by `arete update`. If you delete it, the skill falls back to the skill default.

---

## Copy-paste prompts

Paste any of these directly into an agent chat. The agent will read this README, find the default, and help you create your override.

### Customize a PRD template
```
I want to customize my PRD template. Please read `templates/README.md` to understand
the override system, then open `.agents/skills/create-prd/templates/prd-simple.md`
(or prd-regular / prd-full — ask me which), show me what's there, and help me create
a customized version at `templates/outputs/create-prd/prd-simple.md`.
```

### Customize a meeting agenda
```
I want to customize my one-on-one meeting agenda template. Please read `templates/README.md`,
then open `.agents/skills/prepare-meeting-agenda/templates/one-on-one.md`, show me the
default, and help me create my version at `templates/meeting-agendas/one-on-one.md`.
```

### Add a new meeting agenda type
```
I want to create a new meeting agenda type called "product-review" for my weekly product
review meetings. Please read `templates/README.md` and `.agents/skills/prepare-meeting-agenda/SKILL.md`,
look at an existing agenda template for the format, and help me create
`templates/meeting-agendas/product-review.md` with the right frontmatter and sections.
```

### Customize the week plan structure
```
I want to change how my weekly plan is structured. Please read `templates/README.md`,
open `.agents/skills/week-plan/templates/week-priorities.md`, show me the default,
and help me create my version at `templates/plans/week-priorities.md`.
```

### Customize a project README template
```
I want to change the structure of my discovery project READMEs. Please read
`templates/README.md`, open `.agents/skills/discovery/templates/project.md`,
show me the default, and help me create my version at
`templates/projects/discovery/project.md`.
```

### General: customize any template
```
I want to customize the [skill name] template. Please read `templates/README.md`
to understand the override system, find the default in `.agents/skills/[skill-id]/templates/`,
show it to me, and help me create my override at the right path.
```

---

## Files already in this folder

The two files in `templates/inputs/` are **integration-driven** — they're used by
Areté's meeting import pipeline (Fathom, calendar) to format imported meeting notes.
You can edit them to change how imported meetings look in your workspace:

| File | Used by |
|------|---------|
| `inputs/integration-meeting.md` | Fathom recording imports |
| `inputs/meeting-note.md` | Calendar event imports |

These use `{variable}` placeholders that the integration fills in automatically.

---

## Tips

- **Folders are created on demand** — you don't need to pre-create them; just drop your file in
- **Partial overrides are fine** — you can override just one PRD variant and leave the others as defaults
- **`arete update` never overwrites your files** — safe to run anytime
- See `GUIDE.md` at your workspace root for the full Areté reference
