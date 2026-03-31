# AGENTS.md Source Files

This directory contains the modular source files used to build `dist/AGENTS.md` — the GUIDE mode index for AI agents working in installed Areté workspaces.

## Architecture: Two AGENTS.md Files

Areté has **two** AGENTS.md files serving different purposes:

| File | Mode | Maintenance | Purpose |
|------|------|-------------|---------|
| `AGENTS.md` (root) | BUILD | **Hand-written** | Agents building Areté itself |
| `dist/AGENTS.md` | GUIDE | **Generated** from this directory | Agents helping users (PMs) |

**Important**: Only `dist/AGENTS.md` is generated from these source files. The root `AGENTS.md` is maintained manually.

## What is this?

`dist/AGENTS.md` is a compressed, pipe-delimited index that helps AI agents understand what skills, tools, and workflows are available in GUIDE mode (user workspaces).

This approach follows [Vercel's research](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) showing that compressed documentation in context achieves better results (100% pass rate) than active skill retrieval (79% pass rate).

## Directory Structure

```
.agents/sources/
├── README.md              # This file
├── shared/                # Shared context (vision, workspace, CLI)
│   ├── vision.md          # Areté philosophy
│   ├── workspace-structure.md # Directory layout
│   └── cli-commands.md    # Essential CLI commands
└── guide/                 # GUIDE-specific content
    ├── skills-index.md    # Product skills (runtime/skills/)
    ├── tools-index.md     # Tools (runtime/tools/)
    ├── intelligence.md    # Context, memory, briefings
    └── workflows.md       # Common PM workflows
```

## How to Modify

### For GUIDE mode (user-facing features)

1. Edit the appropriate file in `shared/` or `guide/`
2. Run `npm run build` to regenerate `dist/AGENTS.md`
3. Verify with `cat dist/AGENTS.md`

**Examples:**
- Adding a product skill → Update `guide/skills-index.md`
- Changing CLI commands → Update `shared/cli-commands.md`
- Adding a workflow → Update `guide/workflows.md`

### For BUILD mode (developing Areté)

Edit `AGENTS.md` at the repo root directly. It contains:
- `[Identity]` — Planner role and routing guidance
- `[Expertise]` — Domain profiles for subagents
- `[Roles]` — Subagent personas (orchestrator, reviewer, etc.)
- `[Skills]` — Build skills (execute-prd, hotfix, ship, etc.)
- `[Build Principles]` — Execution mindset
- `[Memory]` — Memory system usage
- `[CLI]` — Build-relevant commands

### Rebuild Command

```bash
# Regenerate dist/AGENTS.md
npm run build
```

### Verify Output

```bash
# View the generated file
cat dist/AGENTS.md

# Check size (should be under ~12KB)
wc -c dist/AGENTS.md
```

## File Format Expectations

Source files should be:

- **Human-readable markdown** — clear headings, paragraphs, lists
- **Concise but complete** — include essential context
- **Properly formatted** — consistent structure for tables/indices
- **Self-contained** — each file should make sense on its own

The build script handles compression, so write source files for **clarity** not brevity.

## Multi-IDE Consistency

When editing source files, follow multi-IDE rules:

- ✅ **Use `.cursor/` paths only** — Never write `.cursor/ or .claude/`
- ✅ **Adapter transforms automatically** — `.cursor/` becomes `.claude/` in Claude installations
- ❌ **Never use "either/or" patterns** — breaks after transformation

See `.pi/standards/build-standards.md` for details.

## Safeguards

The build system includes:

1. **Timestamp** — Every generated file includes when it was built
2. **"DO NOT EDIT" warning** — Header prevents direct manual editing
3. **Source file list** — Output includes which source files were used
4. **Integrity check** — Build fails if root AGENTS.md has been overwritten with generated content

## Troubleshooting

**Problem:** Changes don't appear in dist/AGENTS.md
- **Solution:** Run `npm run build` to regenerate

**Problem:** Build fails with "Root AGENTS.md contains GUIDE-mode content"
- **Solution:** Root AGENTS.md was accidentally overwritten. Restore with:
  ```bash
  git show cd640c4:AGENTS.md > AGENTS.md
  ```

**Problem:** Agent can't find a skill
- **Solution:** Verify the skill is listed in `guide/skills-index.md` with clear triggers

## References

- **Build script:** `scripts/build-agents.ts`
- **Vercel research:** https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
- **Dev conventions:** `.pi/standards/build-standards.md`
- **LEARNINGS:** `../.agents/LEARNINGS.md`
