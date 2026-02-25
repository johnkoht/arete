# Areté Skills

> **For complete documentation** on skills, workflows, and customization, see [GUIDE.md](../../GUIDE.md).

## What are skills?

Skills are reusable workflows that help you (and your AI) get things done in Areté—discovery, PRDs, meeting prep, synthesis, planning, and more. Each skill is a procedure (steps, patterns, and output format) that the agent follows when you ask for that kind of work.

## Default skills

Areté ships with default skills for core PM workflows. They live in `.agents/skills/` after install. You can use them as-is or add your own.

| Area | Examples |
|------|----------|
| Planning | quarter-plan, week-plan, week-review, daily-plan, goals-alignment |
| Discovery & definition | discovery, create-prd, competitive-analysis, construct-roadmap |
| Execution | meeting-prep, save-meeting, process-meetings, schedule-meeting, sync, synthesize |
| Operations | finalize-project, periodic-review, workspace-tour, generate-prototype-prompt |

Run `arete skill list` to see all available skills.

## Customizing a skill

To change how a default skill works:

1. **Edit the skill** directly in `.agents/skills/<name>/`
2. **Protect your changes** by adding the skill to `arete.yaml`:
   ```yaml
   skills:
     overrides:
       - daily-plan
   ```
3. Your version will be preserved during `arete update`

To **restore the default**:
1. Remove the skill from the `overrides` list in `arete.yaml`
2. Delete the skill folder: `rm -rf .agents/skills/<name>`
3. Run `arete update` to restore the default version

**Tip**: Keep a backup in `.agents/skills/<name>.backup/` before making changes, or version control your workspace.

## Adding third-party skills

Install skills from the [skills.sh](https://skills.sh/) ecosystem or from a local path:

```bash
# From skills.sh (owner/repo)
arete skill install owner/repo

# From a local folder that contains SKILL.md
arete skill install ./path/to/skill
```

After install, Areté adds a `.arete-meta.yaml` file next to the skill so routing and briefing work correctly. You can edit that file to add triggers, change `work_type`, or set `requires_briefing` without touching the original SKILL.md.

You can also run `npx skills add owner/repo` directly; then use `arete skill install ./path/to/installed-skill` if you need Areté metadata.

## Choosing a different skill for a role

When a query matches a *role* (e.g. “create a PRD” → `create-prd`), you can tell Areté to use a different skill for that role—for example, a community PRD skill instead of the default.

```bash
# Use this skill whenever the "create-prd" role is matched
arete skill set-default my-prd-skill --for create-prd
```

## Viewing your defaults

```bash
arete skill defaults
```

Shows which roles have a custom skill and which use the Areté default.

## Resetting to default

- **Restore default skill** (remove your customization):  
  1. Remove the skill from `skills.overrides` in `arete.yaml`
  2. Delete the skill folder: `rm -rf .agents/skills/<name>`
  3. Run `arete update` to restore the default
- **Restore Areté default for a role** (when using `set-default`):  
  `arete skill unset-default <role>`

## Creating your own skill

1. Create a folder (e.g. `.agents/skills/my-skill/`).
2. Add `SKILL.md` with a standard skill format: name, description, and steps (see [Agent Skills](https://agentskills.io) and [skills.sh docs](https://skills.sh/docs)).
3. Optionally add `.arete-meta.yaml` with `category: community`, `requires_briefing: true`, and `work_type` / `primitives` so routing and briefing work well.

Run `arete skill list` to confirm it appears.

## Adding new capabilities

Install a skill (from skills.sh or locally) that fits what you want. If its description and triggers are clear, the router will pick it up when you ask for that kind of work. No extra configuration needed—just install and use.
