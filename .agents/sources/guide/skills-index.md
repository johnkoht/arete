# Product Skills

Skills are reusable workflows that help you (and your AI) get things done—discovery, PRDs, meeting prep, synthesis, planning, and more. Each skill is a procedure (steps, patterns, and output format) that the agent follows when you ask for that kind of work.

## Available Skills

| Skill | Path | Description | When to Use |
|-------|------|-------------|-------------|
| **competitive-analysis** | `runtime/skills/competitive-analysis/SKILL.md` | Analyze competitors and identify patterns/opportunities | "Analyze Notion, Linear, and Asana" |
| **construct-roadmap** | `runtime/skills/construct-roadmap/SKILL.md` | Build product roadmaps with prioritization and timelines | "Build roadmap for Q2 2026" |
| **create-prd** | `runtime/skills/create-prd/SKILL.md` | Interactive PRD creation with Product Leader persona | "Create a PRD", "write a PRD for..." |
| **daily-plan** | `runtime/skills/daily-plan/SKILL.md` | Plan your day with focus, meetings, and priorities | "What's on my plate today?" |
| **discovery** | `runtime/skills/discovery/SKILL.md` | Guide problem discovery and research synthesis | "Start discovery", "research [topic]" |
| **finalize-project** | `runtime/skills/finalize-project/SKILL.md` | Archive completed projects and extract learnings | "Finalize this project" |
| **generate-prototype-prompt** | `runtime/skills/generate-prototype-prompt/SKILL.md` | Create prompts for quick UI/UX prototyping | "Generate prototype prompt for..." |
| **goals-alignment** | `runtime/skills/goals-alignment/SKILL.md` | Compare your goals to org strategy | "Show my goal alignment" |
| **meeting-prep** | `runtime/skills/meeting-prep/SKILL.md` | Build prep brief for meetings with attendee context | "Prep for my meeting with Jane" |
| **periodic-review** | `runtime/skills/periodic-review/SKILL.md` | Audit and refresh workspace context | "Review my workspace" |
| **prepare-meeting-agenda** | `runtime/skills/prepare-meeting-agenda/SKILL.md` | Create structured meeting agenda documents | "Create meeting agenda for leadership sync" |
| **process-meetings** | `runtime/skills/process-meetings/SKILL.md` | Extract decisions/learnings from saved meetings | "Process my meetings" |
| **quarter-plan** | `runtime/skills/quarter-plan/SKILL.md` | Set quarterly goals and outcomes | "Set my quarter goals" |
| **capture-conversation** | `runtime/skills/capture-conversation/SKILL.md` | Capture pasted conversations with extracted insights | "Capture this conversation", "save this discussion" |
| **save-meeting** | `runtime/skills/save-meeting/SKILL.md` | Save and structure meeting notes | "Save this meeting" |
| **sync** | `runtime/skills/sync/SKILL.md` | Sync recent data from integrations | "Sync my meetings" |
| **synthesize** | `runtime/skills/synthesize/SKILL.md` | Extract themes and insights from project inputs | "Synthesize what we've learned" |
| **week-plan** | `runtime/skills/week-plan/SKILL.md` | Plan the week and set weekly priorities | "Plan the week", "set weekly priorities" |
| **week-review** | `runtime/skills/week-review/SKILL.md` | Review week progress and prepare for next week | "Review my week" |
| **workspace-tour** | `runtime/skills/workspace-tour/SKILL.md` | Orient users to workspace structure and capabilities | "Give me a tour", "how does this work?" |

## Skill Categories

### Planning
- **quarter-plan** - Set 3-5 quarterly outcomes linked to org strategy
- **week-plan** - Define top 3-5 outcomes for the week
- **week-review** - Review progress and prepare for next week
- **daily-plan** - Daily focus with meeting context and priorities
- **goals-alignment** - Compare goals to org strategy

### Discovery & Definition
- **discovery** - Problem/solution/market discovery projects
- **create-prd** - Interactive PRD creation with context integration
- **competitive-analysis** - Competitor research and synthesis
- **construct-roadmap** - Roadmap building with prioritization

### Execution
- **meeting-prep** - Prep briefs with attendee context and history
- **prepare-meeting-agenda** - Structured agenda document creation
- **capture-conversation** - Capture and structure pasted conversations
- **save-meeting** - Save and structure meeting notes
- **process-meetings** - Extract decisions/learnings to memory
- **sync** - Pull recent data from integrations
- **synthesize** - Extract themes from project inputs

### Operations
- **finalize-project** - Archive projects and update context
- **periodic-review** - Audit and refresh workspace
- **workspace-tour** - Orient to workspace capabilities
- **generate-prototype-prompt** - Create prototyping prompts

## Customizing Skills

### Override Default Skills

Protect your customized skills from being overwritten during updates:

1. Edit files in `.agents/skills/<name>/`
2. Add to `arete.yaml`:
   ```yaml
   skills:
     overrides:
       - daily-plan
       - create-prd
   ```
3. Run `arete update` - your customizations are preserved

**Important**:
- `skills.defaults` (from `arete skill set-default ... --for <role>`) affects routing preference only.
- It does **not** freeze native skill files.
- `arete update` still refreshes native core skills unless they are in `skills.overrides`.

### Reset to Default

1. Remove from `skills.overrides` in `arete.yaml`
2. Delete folder: `rm -rf .agents/skills/<name>`
3. Run `arete update` to restore default

### Install Third-Party Skills

From [skills.sh](https://skills.sh/) or local path:

```bash
# From skills.sh (owner/repo)
arete skill install owner/repo

# From local folder containing SKILL.md
arete skill install ./path/to/skill
```

### Set Role Defaults

Use a different skill when a role is matched:

> Note: Role defaults do not protect native skill files from updates. If you edited a native skill and want to keep those edits, add it to `skills.overrides`.

```bash
# Use this skill whenever "create-prd" role is matched
arete skill set-default my-prd-skill --for create-prd

# View current defaults
arete skill defaults

# Restore Areté default
arete skill unset-default create-prd
```

## Creating Your Own Skills

1. Create folder: `.agents/skills/my-skill/`
2. Add `SKILL.md` with standard skill format (see [Agent Skills](https://agentskills.io))
3. Optionally add `.arete-meta.yaml` with category, work_type, primitives

Run `arete skill list` to confirm it appears.
