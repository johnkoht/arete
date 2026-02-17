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

All overrides live under `templates/outputs/{skill-id}/{variant}.md` — one consistent pattern for every skill.

| What | Override path |
|------|---------------|
| **PRD templates** | `templates/outputs/create-prd/prd-simple.md` (or `prd-regular`, `prd-full`) |
| **PRD project README** | `templates/outputs/create-prd/project.md` |
| **Meeting agendas** | `templates/outputs/prepare-meeting-agenda/one-on-one.md` (or `leadership`, `customer`, `dev-team`, `other`) |
| **Week plan structure** | `templates/outputs/week-plan/week-priorities.md` |
| **Quarter goals structure** | `templates/outputs/quarter-plan/quarter-goals.md` |
| **Discovery project README** | `templates/outputs/discovery/project.md` |
| **Research notes** | `templates/outputs/discovery/research-note.md` |
| **User feedback capture** | `templates/outputs/discovery/user-feedback.md` |
| **Competitive analysis README** | `templates/outputs/competitive-analysis/project.md` |
| **Roadmap project README** | `templates/outputs/construct-roadmap/project.md` |
| **Roadmap output** | `templates/outputs/construct-roadmap/roadmap.md` |

---

## How to customize a template

1. **Find the default** — run `arete template view --skill {skill-id} --variant {variant}` to see the current content
2. **Create your override** at `templates/outputs/{skill-id}/{variant}.md` (create the folder if needed)
3. **Verify** — run `arete template resolve --skill {skill-id} --variant {variant}` to confirm your override is picked up
4. **Use it** — the skill automatically uses your version on the next run

Your file is never overwritten by `arete update`. If you delete it, the skill falls back to the skill default.

---

## Copy-paste prompts

Paste any of these directly into an agent chat. The agent will read this README, find the default, and help you create your override.

### Customize a PRD template
```
I want to customize my PRD template. Run: arete template view --skill create-prd --variant prd-regular
Show me the output, then help me create my version at templates/outputs/create-prd/prd-regular.md.
After saving, run: arete template resolve --skill create-prd --variant prd-regular
to confirm the override is active.
```

### Customize a meeting agenda
```
I want to customize my one-on-one meeting agenda. Run: arete template view --skill prepare-meeting-agenda --variant one-on-one
Show me the output, then help me create my version at templates/outputs/prepare-meeting-agenda/one-on-one.md.
```

### Add a new meeting agenda type
```
I want a new meeting agenda type called "product-review". Run: arete template view --skill prepare-meeting-agenda --variant one-on-one
Use that as a format reference, then help me create templates/outputs/prepare-meeting-agenda/product-review.md
with the right frontmatter (name, type, description, time_allocation) and sections for a weekly product review.
```

### Customize the week plan structure
```
I want to change how my weekly plan is structured. Run: arete template view --skill week-plan --variant week-priorities
Show me the output, then help me create my version at templates/outputs/week-plan/week-priorities.md.
```

### Customize a project README template
```
I want to change the structure of my discovery project READMEs. Run: arete template view --skill discovery --variant project
Show me the output, then help me create my version at templates/outputs/discovery/project.md.
```

### General: customize any template
```
I want to customize the [skill-id] / [variant] template.
Run: arete template view --skill [skill-id] --variant [variant]
Show me the output, help me edit it, and save it to templates/outputs/[skill-id]/[variant].md.
Then run: arete template resolve --skill [skill-id] --variant [variant] to confirm.
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
