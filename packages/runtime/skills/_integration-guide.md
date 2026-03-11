# Skill Integration Guide

How to configure Areté integration hooks for installed community skills.

---

## What Are Integration Hooks?

When a skill produces output (a project, a saved resource, a context file), Areté can automatically tell the agent where to save it, whether to index it, and which template to use. This context appears in the skill's `## Areté Integration` section — injected at install time and regenerated on `arete update`.

The integration profile lives in `.agents/skills/<name>/.arete-meta.yaml`. You can edit it directly or ask an agent to help configure it.

---

## Output Types

| Type | When to use | Default path |
|------|-------------|--------------|
| `project` | Skill creates a long-lived project folder | `projects/active/{name}/` |
| `resource` | Skill saves a discrete file (meeting, conversation) | `resources/` |
| `context` | Skill saves standing context that informs future work | `context/` |
| `none` | Skill is conversational — no persistent output | *(no section generated)* |

The `{name}` placeholder is filled by the agent based on the user's topic (e.g., `projects/active/acme-competitive-analysis/`).

---

## Configuring Integration

Edit `.agents/skills/<skill-name>/.arete-meta.yaml` and add or update the `integration` block:

```yaml
# .agents/skills/my-skill/.arete-meta.yaml
category: community

integration:
  outputs:
    - type: project           # project | resource | context | none
      path: "projects/active/{name}-report/"   # optional: override default path
      template: report        # optional: variant name for arete template resolve
      index: true             # optional: whether to run arete index after saving
  contextUpdates:             # optional: standing files to update after each run
    - context/market-trends.md
```

After editing, run `arete update` to regenerate the `## Areté Integration` section in the skill's SKILL.md.

### Field reference

| Field | Type | Description |
|-------|------|-------------|
| `outputs[].type` | string | One of `project`, `resource`, `context`, `none` |
| `outputs[].path` | string | Workspace-relative path pattern. Use `{name}` for a user-supplied slug. Optional — defaults to type default. |
| `outputs[].template` | string | Template variant name. Agent will run `arete template resolve --skill <id> --variant <name>`. Optional. |
| `outputs[].index` | boolean | Run `arete index` after saving. Recommended for project, resource, context. Default: false. |
| `contextUpdates` | string[] | Standing workspace files the skill updates (e.g. `context/competitive-landscape.md`). |

---

## Examples

### Project-based skill (e.g., competitive analysis)

The skill creates a project folder per run. Content should be indexed and searchable.

```yaml
integration:
  outputs:
    - type: project
      path: "projects/active/{name}-competitive-analysis/"
      template: analysis
      index: true
  contextUpdates:
    - context/competitive-landscape.md
```

Generated section tells the agent: save to the project folder using the `analysis` template, then run `arete index`.

---

### Resource-based skill (e.g., save a meeting or conversation)

The skill saves a single file into a resources subfolder.

```yaml
integration:
  outputs:
    - type: resource
      path: "resources/meetings/{name}.md"
      index: true
```

Generated section tells the agent: save to `resources/meetings/`, then run `arete index`.

---

### Context-based skill (e.g., market trends briefing)

The skill writes or updates a standing context file used by other skills.

```yaml
integration:
  outputs:
    - type: context
      path: "context/market-trends.md"
      index: true
```

Generated section tells the agent: save to `context/market-trends.md`, then run `arete index`.

---

### Conversational skill (no persistent output)

The skill is a guided conversation or in-session tool with no file output.

```yaml
integration:
  outputs:
    - type: none
```

No `## Areté Integration` section is generated. The skill runs and finishes without touching the workspace.

---

## Template Resolution

When `template` is set, the generated section instructs the agent to run:

```
arete template resolve --skill <skill-id> --variant <template>
```

Resolution order (first match wins):

1. **Workspace override** — `templates/outputs/<skill-id>/<template>.md`
2. **Skill-bundled** — `.agents/skills/<skill-id>/templates/<template>.md`
3. **Areté default** — built-in fallback (if registered)

Community skills can ship their own templates in a `templates/` subfolder. Users can override them by dropping a file at the workspace override path — no reinstall required.

---

## Indexing

Set `index: true` when the skill's output should be findable by `arete search`, `arete brief`, or other skills.

| Output type | Use `index: true`? |
|-------------|-------------------|
| `project` | ✓ Yes |
| `resource` | ✓ Yes |
| `context` | ✓ Yes |
| `none` | ✗ No (nothing to index) |

**What `arete index` does**: Scans the workspace and rebuilds the search collection so new files are immediately findable by context retrieval, briefing, and other skills. Run it after any output is saved to disk.
