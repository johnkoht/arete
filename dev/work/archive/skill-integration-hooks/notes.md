# Skill Integration Hooks — Planning Notes

## Resolved Decisions

### Injection mechanism → Bake into SKILL.md at deploy time (Option B)
- When a skill is installed (or `arete update` runs for native), read integration profile from `.arete-meta.yaml` and append a generated `## Areté Integration` section to the SKILL.md
- If user edits `.arete-meta.yaml` and runs `arete update`, the section gets regenerated
- No new agent behaviors, no extra CLI calls, no separate files to discover
- Works across all IDEs identically

### Install-time guidance → CLI prints guidance, no LLM inference
- After install, CLI prints: "✓ Installed. Edit `.arete-meta.yaml` to customize integration, or ask an agent to help you set it up."
- `.arete-meta.yaml` ships with commented-out integration fields showing what's possible
- Agent-assisted setup happens in conversation, not in CLI
- No LLM at install time

### Output path → Pattern declared in profile, agent fills in at runtime
- Integration profile declares pattern: `resources/competitive/{name}.md`
- Injected SKILL.md instructions tell agent: "Save output to `resources/competitive/{name}.md`"
- Agent fills `{name}` from conversation context

### Multiple output types → Array + separate context_updates
```yaml
integration:
  outputs:
    - type: project
      path: projects/active/{name}/
      template: analysis
      index: true
  context_updates:
    - context/competitive-landscape.md
```

### Indexing → Already whole-directory, hook just triggers re-scan
- `qmd` collection uses `--mask '**/*.md'` — indexes all .md files in workspace
- `arete index` = `qmd update` + `qmd embed` — full re-scan
- `index_after: true` in profile means: inject "run `arete index`" instruction
- Not changing indexing mechanics (out of scope)

## Future Tasks (scratchpad)
- "Build Areté Skill" skill — authoring workflow for creating skills
- Auto-run `arete index` after every skill execution (eliminates per-skill instruction)
