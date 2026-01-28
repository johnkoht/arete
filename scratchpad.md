# Scratchpad

Quick capture space for notes, ideas, and TODOs. Review periodically and move items to appropriate places.

---

## Ideas
<!-- Quick ideas - date them so you know when they came up -->

- [2026-01-27] **Subagents for Competitive Research**: When analyzing 2+ competitors, spawn parallel subagents to research each competitor simultaneously. Each subagent gathers pricing, features, positioning, then main agent synthesizes into comparison matrix. Could extend to other parallel tasks (market research, multi-source discovery).

- [2026-01-27] **Mockup/Prototype Generation via Lovable MCP**: Create a skill that generates interactive prototypes from PRDs, discovery findings, or feature ideas. Use Lovable's MCP integration to build UI mockups directly from PM artifacts. Could also explore Vercel v0 as alternative.

---

## TODOs
<!-- Action items that don't belong to a specific project yet -->

- [ ] [TODO item]

---

## Notes
<!-- Quick notes, observations, things to remember -->

### YYYY-MM-DD
[Note content]

---

## Questions to Explore
<!-- Questions that came up that we should investigate -->

- [Question]

---

## Future Enhancements (to build later)

### Tools/Agents/Models Configuration
- Config file for AI model preferences per task type
- Recommendations for when to use Plan mode vs regular mode
- Options for deep research vs quick tasks
- Let user customize model selection for: discovery, synthesis, PRD writing, etc.

### People/Stakeholders Tracking
- Index of people involved (name, role, team, contact)
- Per-person memory: what they care about, common questions, pet peeves
- Auto-populate from meeting transcripts
- Agent uses this when preparing deliverables ("CEO always asks about ROI")
- Structure: `people/[name].md` with sections for role, preferences, notable quotes

### Package-Based Distribution (Shelved)
*Added: 2026-01-27*

Current approach: Fork + Upstream remote for updates. Works fine for single workspace.

**Future option:** Publish as npm package for cleaner distribution:
```
my-workspace/
├── node_modules/@arete/workspace/   # Framework as dependency
├── .cursor/rules/                   # Symlinked from package
├── context/                         # Your data
├── projects/                        # Your data
└── arete.config.js                  # Optional customization
```

**CLI commands:**
- `npx @arete/workspace init` - Scaffold workspace, copy rules
- `npx @arete/workspace update` - Update rules/templates
- `npx @arete/workspace sync` - Re-sync after package update

**Benefits:** Semantic versioning, `npm update` for upgrades, easy multi-workspace setup, simpler distribution.

**Trade-offs:** Adds Node.js dependency, more complex setup, symlink quirks.

**When to revisit:** If using across multiple clients/projects, or sharing with others.

---

### MCP Integrations
When MCP integrations are added, consider these use cases:

**Linear**
- Pull roadmap items and sync with `context/goals-strategy.md`
- Create issues from PRD requirements
- Track project status

**Notion**
- Pull/push documentation
- Sync meeting notes to project inputs
- Export PRDs to Notion pages

**Jira**
- Import tickets as inputs for discovery
- Create tickets from PRD requirements
- Track sprint progress

**Slack**
- Import meeting summaries as inputs
- Capture feedback from channels
- Post project updates

**Calendar**
- Pull meeting context before note-taking
- Suggest inputs to gather based on upcoming meetings
- Track stakeholder availability

**Figma**
- Pull design context for PRDs
- Reference designs in competitive analysis
- Link mockups to requirements

---

*Last cleaned: [Date]*
