# AGENTS.md Source Files

This directory contains the modular source files used to build `AGENTS.md` — the primary index for AI agents working in Areté.

## What is this?

`AGENTS.md` is a compressed, pipe-delimited index that helps AI agents understand what skills, tools, and workflows are available. Instead of editing `AGENTS.md` directly, we maintain human-readable source files here and **compile** them into the final output.

This approach follows [Vercel's research](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) showing that compressed documentation in context achieves better results (100% pass rate) than active skill retrieval (79% pass rate).

## Directory Structure

```
.agents/sources/
├── README.md              # This file
├── shared/                # Content for BOTH build and guide
│   ├── vision.md          # Areté philosophy
│   ├── workspace-structure.md # Directory layout
│   └── cli-commands.md    # Essential CLI commands
├── builder/               # BUILD-specific (this repo)
│   ├── skills-index.md    # Build skills (.agents/skills/)
│   ├── rules-index.md     # Build rules (.cursor/rules/)
│   ├── conventions.md     # TypeScript, testing, commits
│   └── memory.md          # memory/MEMORY.md usage
└── guide/                 # GUIDE-specific (shipped to users)
    ├── skills-index.md    # Product skills (runtime/skills/)
    ├── tools-index.md     # Tools (runtime/tools/)
    ├── intelligence.md    # Context, memory, briefings
    └── workflows.md       # Common PM workflows
```

## Two Outputs

The build script generates **two versions** of AGENTS.md:

1. **BUILD** (`AGENTS.md` in root) — For agents building Areté
   - Includes: shared/ + builder/
   - Contains: build skills, dev conventions, memory system

2. **GUIDE** (`dist/AGENTS.md`) — For users of Areté
   - Includes: shared/ + guide/
   - Contains: product skills, tools, PM workflows

## How to Modify Content

### 1. Identify the Right File

Ask yourself:
- **Does this appear in both BUILD and GUIDE?** → Edit in `shared/`
- **Is this for building Areté?** → Edit in `builder/`
- **Is this for using Areté (PMs)?** → Edit in `guide/`

### 2. Edit the Source File

Edit the appropriate `.md` file in the subdirectory. Files are human-readable markdown with clear structure.

**Examples:**
- Adding a new build skill → Update `builder/skills-index.md`
- Adding a new product skill → Update `guide/skills-index.md`
- Changing CLI commands → Update `shared/cli-commands.md`
- Adding a workflow → Update `guide/workflows.md`

### 3. Rebuild AGENTS.md

After editing source files, regenerate the compiled output:

```bash
# For BUILD (this repo)
npm run build:agents:dev

# For GUIDE (npm package)
npm run build

# Both
npm run build:agents:dev && npm run build
```

The build script will:
- Read all relevant source files
- Concatenate them in order
- Apply pipe-delimited compression
- Add timestamp and "DO NOT EDIT" header
- Write to target location

### 4. Verify Output

Check that your changes appear correctly:

```bash
# View the generated file
cat AGENTS.md

# Check size (should be under 10KB)
wc -c AGENTS.md

# Verify timestamp
head -n 5 AGENTS.md
```

## File Format Expectations

Source files should be:

- **Human-readable markdown** — clear headings, paragraphs, lists
- **Concise but complete** — include essential context
- **Properly formatted** — consistent structure for tables/indices
- **Self-contained** — each file should make sense on its own

The build script handles compression, so write source files for **clarity** not brevity.

## Multi-IDE Consistency

When editing source files (especially `shared/` and `guide/` which ship to users), follow multi-IDE rules:

### Critical Rules

- ✅ **Use `.cursor/` paths only** — Never write `.cursor/ or .claude/`
- ✅ **Adapter transforms automatically** — `.cursor/` becomes `.claude/` in Claude installations
- ✅ **Don't hardcode IDE names** — Let the adapter handle IDE-specific paths
- ❌ **Never use "either/or" patterns** — `".cursor/ or .claude/"` breaks after transformation

### Why This Matters

Areté supports multiple IDEs (Cursor, Claude) via adapters. The canonical source uses `.cursor/` paths, and the Claude adapter transforms them to `.claude/` during installation. If you write "either/or" paths, the transformation produces broken output like `".claude/ or .claude/"`.

### Before Committing

Check for violations:
```bash
# Find multi-IDE violations in source files
rg "\.cursor.*or.*\.claude|\.claude.*or.*\.cursor" .agents/sources/ runtime/
```

### Reference

See `.cursor/rules/dev.mdc` § 8 for the full multi-IDE consistency checklist and `src/core/adapters/claude-adapter.ts` for transformation logic.

## When to Rebuild

Rebuild AGENTS.md whenever:

- ✅ You add/remove a skill or tool
- ✅ You change skill triggers or descriptions
- ✅ You update CLI commands or conventions
- ✅ You modify workspace structure
- ✅ You change any content in `.agents/sources/`

**Note:** `npm run build` automatically regenerates AGENTS.md, so if you're building the package, it's already included.

## Automated Checks

The build system includes safeguards:

1. **Timestamp** — Every generated file includes a timestamp showing when it was built
2. **"DO NOT EDIT" warning** — Header prevents direct manual editing
3. **Source file list** — Output includes which source files were used
4. **Size validation** — Build warns if output exceeds 10KB

## Troubleshooting

**Problem:** Changes don't appear in AGENTS.md
- **Solution:** Run `npm run build:agents:dev` to rebuild

**Problem:** AGENTS.md is too large (>10KB)
- **Solution:** Check which source files contribute most; consider splitting or condensing

**Problem:** Agent can't find a skill
- **Solution:** Verify the skill is listed in the appropriate `skills-index.md` with clear triggers

**Problem:** Content appears in wrong output (BUILD vs GUIDE)
- **Solution:** Check which subdirectory (`builder/` vs `guide/`) the source file is in

## Build Script Location

The compilation script is at `scripts/build-agents.ts`. It:
- Accepts target argument: `dev` (BUILD) or `prod` (GUIDE)
- Reads source files based on target
- Applies pipe-delimited compression
- Writes to appropriate location

## References

- **PRD:** `dev/prds/agents-md-compilation/prd.md`
- **Build script:** `scripts/build-agents.ts`
- **Vercel research:** https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
- **Dev conventions:** `.cursor/rules/dev.mdc`
