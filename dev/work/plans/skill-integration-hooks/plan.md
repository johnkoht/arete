---
title: Skill Integration Hooks
slug: skill-integration-hooks
status: building
size: large
tags: [platform, skills, intelligence-layer]
created: 2026-03-02T03:29:00Z
updated: 2026-03-02T05:42:43.745Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 0
---

# Skill Integration Hooks

**Problem**: Community skills (from skills.sh, GitHub, etc.) produce great output that becomes orphaned — invisible to Areté's intelligence layer (context queries, meeting prep, briefings, daily plans). The intelligence layer is only valuable if all work flows through it. Today, integration behaviors (indexing, context updates, project scaffolding) are embedded as prose in native SKILL.md files. Community skills get none of this.

**Goal**: Any installed skill automatically benefits from Areté's intelligence layer. Outputs are indexed, surfaced in relevant workflows, and organized in the workspace — without the skill author needing to know about Areté.

**Who**: Areté users who install community skills and expect their outputs to be as integrated as native skill outputs.

**Success criteria**:
1. A user installs a skills.sh skill and runs it; the output is searchable via `arete context --for`
2. The install experience guides the user through integration setup (templates, output location, indexing)
3. Native skills use the same hook system (no prose duplication of "run arete index")
4. Template resolution works: skill-bundled templates → user workspace overrides → Areté defaults

---

## Key Design Decisions (to resolve during planning)

### Where do outputs go?

Not everything is a project. Observed output patterns:

| Output Type | Examples | Likely Location |
|---|---|---|
| **Project** (multi-artifact) | Competitive analysis, discovery, PRD | `projects/active/[name]/` |
| **Resource** (single document) | Positioning statement, journey map, battlecard, press release | `resources/[category]/[name].md` |
| **Context update** | Competitive landscape summary, market trends | `context/[topic].md` |
| **Conversational** | Advisory, coaching, diagnostic | No persistent output |

The integration profile needs an `output_type` that determines behavior:
- `project` → scaffolds folder, uses template, indexes all artifacts
- `resource` → saves to resources/, indexes single file
- `context` → updates a context file, auto-indexed
- `none` → no persistent output, no indexing needed

**Open question**: Should the skill declare this, or should it be inferred at install? Probably inferred by the agent at install, stored in `.arete-meta.yaml`, editable by user.

### Template resolution order

1. **User workspace override**: `templates/outputs/[skill-id]/[variant].md` (already exists)
2. **Skill-bundled template**: `.agents/skills/[skill-id]/templates/[variant].md`
3. **Areté default template**: Falls back to generic project/resource template

When a community skill has templates, they're used as-is. If the user has workspace overrides, those win. The system should **notify** when a workspace override exists that supersedes the skill's template, so users don't wonder why their output looks different.

### Hook mechanism

Hooks aren't traditional post-process hooks — they're **behavioral context injection**. When a skill is loaded, Areté reads the integration profile and injects instructions:

```
## Areté Integration (auto-injected)
After completing this skill:
1. Save output to: resources/competitive/[name].md
2. Run `arete index` to make output searchable
3. Update context/competitive-landscape.md with key findings
```

This works for both native and community skills. Native skills can remove their current prose integration instructions.

---

## Plan

### Phase 1: Integration Profile & Context Injection

**1. Define the Skill Integration Profile schema**
- Add `integration` section to `.arete-meta.yaml` schema
- Fields: `output_type` (project | resource | context | none), `output_path` (pattern with [name] placeholder), `template` (variant name or path), `index_after` (boolean), `context_updates` (array of context file paths), `notify_on_override` (boolean, default true)
- Update `SkillDefinition` type to include integration fields
- AC: Schema defined, types updated, existing `.arete-meta.yaml` files still parse correctly

**2. Build integration context injection**
- When a skill is loaded (by agent or routing), read its integration profile
- Generate integration instructions and make them available as injectable context
- Create a `getSkillIntegrationContext(skillId)` service method
- For native skills: derive integration profile from existing frontmatter (`creates_project`, `project_template`, etc.)
- For community skills: read from `.arete-meta.yaml`
- AC: `getSkillIntegrationContext('competitive-analysis')` returns structured integration instructions; works for both native and community skills

**3. Template resolution with skill-bundled templates**
- Extend template resolution to check skill-bundled templates: workspace override → skill templates → Areté defaults
- Add notification when workspace override supersedes skill template
- Update `arete template resolve` to handle the new resolution order
- AC: A community skill with `templates/report.md` uses that template; if user has `templates/outputs/[skill-id]/report.md`, that wins and user is notified

### Phase 2: Enhanced Install Experience

**4. Agent-assisted integration setup at install**
- After `arete skill install`, provide an integration profile suggestion
- Read the installed SKILL.md, infer: output type, likely output path, whether it needs indexing, what context files it might update
- Write inferred profile to `.arete-meta.yaml` integration section
- AC: Installing a competitive analysis skill from skills.sh results in `.arete-meta.yaml` with `output_type: project`, `index_after: true`, `context_updates: [context/competitive-landscape.md]`

**5. Install-time guidance document**
- Create a reference document that agents can read during skill installation
- Covers: what integration hooks are, what output types exist, how to suggest appropriate configuration
- Lives at: `packages/runtime/skills/README.md` or `.agents/skills/_install-guide.md`
- Includes examples of good integration profiles for different skill types
- AC: An agent helping a user install a skill can read this doc and make informed suggestions

### Phase 3: Native Skill Migration

**6. Migrate native skills to use integration profiles**
- For each native skill that has integration instructions in prose:
  - Extract integration behavior into frontmatter/meta fields
  - Remove duplicated prose instructions ("Run `arete index`", "Update context/")
  - Verify integration context injection produces equivalent instructions
- Skills to migrate: competitive-analysis, discovery, create-prd, construct-roadmap, general-project, capture-conversation, save-meeting, process-meetings, rapid-context-dump
- AC: Native skills produce the same integration behavior as before, but via the hook system instead of prose

**7. Update PATTERNS.md**
- Add "Skill Integration" pattern documenting how integration profiles work
- Update existing patterns that reference post-completion steps
- AC: PATTERNS.md accurately describes the integration hook system

### Phase 4: Indexing & Surfacing

**8. Auto-indexing for skill outputs**
- When `index_after: true`, the integration context injection includes explicit indexing instructions
- Consider: should `arete index` run automatically after skill completion, or remain agent-instructed?
- Document which output types should be indexed (project, resource, context) and which shouldn't (none, conversational)
- AC: Skill outputs with `index_after: true` are consistently indexed and appear in `arete context --for` queries

---

## Size Estimate

**Large** (8 steps across 4 phases). Phases are independently shippable:
- Phase 1 (steps 1-3): Core infrastructure. Must ship first.
- Phase 2 (steps 4-5): Install UX. Can ship independently after Phase 1.
- Phase 3 (steps 6-7): Migration. Can ship independently after Phase 1.
- Phase 4 (step 8): Polish. Can ship after Phase 1.

Recommend: `/pre-mortem` before building, `/prd` for autonomous execution.

---

## Out of Scope

- **Skill marketplace/discovery**: Not building a way to browse/search skills.sh from within Areté
- **Automatic skill composition**: Not building a system where skills chain into each other
- **Runtime hooks** (like rjs/shaping's PostToolUse hook): That's a Claude Code / IDE feature, not an Areté feature
- **Changing how `arete index` works**: Just ensuring skills declare whether to use it
- **Skill authoring tools**: Not building tools for creating skills (deanpeters has his own)

---

## Open Questions

1. **Should `output_type` support custom paths?** E.g., a GTM skill might want to output to `resources/marketing/` while a research skill outputs to `resources/research/`. Probably yes — `output_path` as a pattern like `resources/competitive/{name}.md`.

2. **How do we handle skills that produce multiple output types?** E.g., competitive analysis produces both a project AND updates context. Probably: primary output_type + optional context_updates array.

3. **Should the integration profile be part of the skill's SKILL.md frontmatter?** For community skills, `.arete-meta.yaml` makes sense (skill author doesn't need to know about Areté). For native skills, frontmatter is cleaner. Maybe: read from frontmatter first, fall back to sidecar.

4. **Persona Council check**: This feature involves user workflow (install UX, template selection, output location decisions). Should run persona council before finalizing the install conversation UX.

---

## References

- [Competitive Analysis Enhancement plan](../skills-enhancement/competitive-analysis.md) — related but separate skill content enhancement
- [Skills Enhancement backlog](../skills-enhancement/plan.md) — methodology improvements for native skills
- [skills.ts](../../../packages/core/src/services/skills.ts) — current install implementation
- [skill.ts CLI](../../../packages/cli/src/commands/skill.ts) — current install UX with overlap detection
- [PATTERNS.md](../../../packages/runtime/skills/PATTERNS.md) — shared skill patterns including template resolution
- External: [obra/superpowers](https://github.com/obra/superpowers), [deanpeters/Product-Manager-Skills](https://github.com/deanpeters/Product-Manager-Skills), [rjs/shaping-skills](https://github.com/rjs/shaping-skills) — community skill examples with varied output patterns
