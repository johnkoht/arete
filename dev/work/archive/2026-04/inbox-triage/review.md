## Review: Inbox Universal Content Ingest & Triage

**Type**: Plan
**Audience**: User (end-user functionality)
**Review Path**: Full
**Complexity**: Medium (4 steps, 8+ files, new workspace directory + search scope + CLI command + skill)
**Recommended Track**: standard — full /ship flow

### Expertise Profiles Loaded

- **Core** (`packages/core/`): workspace-structure.ts, search/qmd-setup.ts, models/workspace.ts, utils/context-dump-quality.ts
- **CLI** (`packages/cli/`): commands/inbox.ts (new), commands/status.ts, commands/pull.ts, commands/search.ts

### LEARNINGS.md Scanned

- `packages/core/src/search/LEARNINGS.md` — QMD setup patterns, `refreshQmdIndex()` vs `ensureQmdCollection()` distinction, `SCOPE_PATHS` structure
- `packages/cli/src/commands/LEARNINGS.md` — `--json` + `--skip-qmd` requirements for write commands, `refreshQmdIndex()` wiring, `registerXxxCommand` pattern, `displayQmdResult()` helper
- `packages/runtime/skills/LEARNINGS.md` — relative path requirement for cross-skill references, worked examples requirement for expert patterns

---

### Concerns

**1. Step 2: Missing CLI plumbing for `arete inbox add`** (LEARNINGS violation)

Per CLI LEARNINGS.md, any command that writes workspace files MUST:
- Call `refreshQmdIndex()` after writes (so new inbox items are immediately searchable)
- Support `--json` output for programmatic use
- Include `--skip-qmd` option for testability
- Use `displayQmdResult()` for QMD output formatting

The plan specifies none of these. Also missing: `registerInboxCommand(program)` wiring in `packages/cli/src/index.ts`.

- **Suggestion**: Add to Step 2 implementation:
  - `--json` flag on `arete inbox add` (output: `{ path, title, qmd }`)
  - `refreshQmdIndex()` after file write
  - `--skip-qmd` option
  - Registration in `packages/cli/src/index.ts`

---

**2. Step 2: Missing unit test expectations** (Test coverage gap)

Step 2 creates a new CLI command but has no test expectations beyond typecheck. Per review checklist, new functions/modules need "tests for happy path + edge cases + error handling."

- **Suggestion**: Add AC:
  - "Unit tests in `packages/cli/test/commands/inbox.test.ts` cover: `--title/--body` happy path, `--url` fetch + write, `--file` copy + companion .md creation, slug generation from title/URL, error when outside workspace, `--json` output format"

---

**3. Step 3 SKILL.md: Must use relative paths for pattern references** (LEARNINGS violation)

Skills LEARNINGS.md (2026-02-25): "All inter-file references must use relative paths." The inbox-triage SKILL.md must reference patterns as `../PATTERNS.md § significance_analyst`, not `PATTERNS.md:640` or `packages/runtime/skills/PATTERNS.md`.

- **Suggestion**: Add a note in Step 3: "All cross-references in SKILL.md use relative paths (e.g., `../PATTERNS.md § significance_analyst`). Never use absolute build-time paths."

---

**4. Step 4: `arete status` and `arete pull` implementation underspecified**

The plan says "add inbox count to status" and "add tip to pull output" but doesn't specify:
- Where the inbox counting logic lives (new service method? inline in status.ts?)
- How frontmatter is parsed for status counting (reuse existing frontmatter parser?)
- Which pull subcommands show the tip (all of them? just the top-level `arete pull`?)

- **Suggestion**: Add implementation notes:
  - Status: Read `inbox/` directory via `services.storage`, parse frontmatter of `.md` files, count by `status` field. Add to `getStatus()` return type or compute in `status.ts` directly.
  - Pull: Add inbox check after all pull operations complete (in the shared pull wrapper, not per-subcommand).

---

**5. Step 4: Missing unit test expectations for status + pull changes**

Both `status.ts` and `pull.ts` are being modified but no test expectations are specified.

- **Suggestion**: Add AC:
  - "Unit test: `arete status` with 0/1/N inbox items shows correct count"
  - "Unit test: `arete pull` shows inbox tip when items exist, omits when empty"

---

**6. Missing: AGENTS.md update**

AGENTS.md is the canonical CLI reference. The new `arete inbox add` command should be listed in the `[CLI]` section. Similarly, `inbox-triage` as a skill.

- **Suggestion**: Add to Step 4 (or Step 2): "Update AGENTS.md [CLI] section with `arete inbox add` command and its options."

---

**7. Missing: `dev/catalog/capabilities.json` entry**

The review checklist requires checking capabilities.json for new tooling. `arete inbox add` is a new CLI command and `inbox-triage` is a new skill — both need catalog entries.

- **Suggestion**: Add to Step 4: "Add `inbox-cli` and `inbox-triage-skill` entries to `dev/catalog/capabilities.json`."

---

### AC Validation Issues

| Step | AC | Issue | Suggested Fix |
|------|-----|-------|---------------|
| 2 | "Command appears in `arete tool list` / help" | `arete inbox add` is a CLI command, not a tool. Tool list shows `.agents/tools/` entries. | Change to "Command appears in `arete --help` and `arete inbox --help`" |
| 2 | (missing) | No unit test AC | Add: "Unit tests cover happy path, error cases, slug generation, --json output" |
| 3 | "Routing decisions are grounded in actual workspace context" | Vague — how to verify "grounded"? | "Triage plan table includes a 'Why' column citing specific workspace entities (project names, area names, goal text)" |
| 4 | (missing) | No test ACs for status/pull changes | Add unit test ACs per Concern #5 |

### Test Coverage Gaps

- **Step 2**: New CLI command `inbox.ts` has no test file specified. Need `packages/cli/test/commands/inbox.test.ts`.
- **Step 4**: `status.ts` and `pull.ts` modifications have no test expectations.
- **Step 1**: `workspace-structure.ts` changes should be covered by existing `install-update.integration.test.ts` — confirm this test checks for `inbox/` directory creation.

### Strengths

- **Design decisions are well-grounded**: The destination-first philosophy, interactive triage, and significance-analyst composition are all thoughtful choices that build on existing patterns rather than reinventing.
- **Pre-mortem is thorough**: 8 risks identified and mitigated, MVP layering for Step 3 is smart risk management.
- **Pattern references are excellent**: The LLM Pattern References table gives implementers a clear reading list. This is better context assembly than most plans.
- **Companion .md resolution is clean**: Binary files get searchable companions that move with them. Simple, consistent.
- **Migration scope is disciplined**: Only replacing top-level `inputs/`, leaving `templates/inputs/` and project-level `inputs/` untouched.

### Devil's Advocate

**If this fails, it will be because...** Step 3's triage skill tries to be too smart too fast. The 6-phase workflow with context bundle assembly, significance analysis, entity resolution, and approval gates is the most ambitious skill definition in the system. Even with MVP layering, the skill has to correctly read diverse file formats, match entities against workspace data, decide routing with confidence scores, and present an interactive approval flow — all via SKILL.md instructions to an LLM agent. The gap between "what the plan describes" and "what an LLM agent reliably does when following markdown instructions" is the primary risk.

**The worst outcome would be...** The triage skill routes content to the wrong places with high confidence, and the user trusts the approval table without scrutinizing each item. Misfiled content is harder to find than unfiled content. The approval gate mitigates this, but only if the user actually reviews each routing decision rather than hitting "Apply all."

### Verdict

- [x] **Approve with suggestions** — 7 concerns, all addressable without restructuring. Core design is solid.

### Suggested Changes

**Change 1**: CLI plumbing (Concern 1)
- **What's wrong**: `arete inbox add` missing `--json`, `--skip-qmd`, `refreshQmdIndex()`, and index.ts registration
- **What to do**: Add these to Step 2 implementation section and ACs
- **Where to fix**: Step 2, Implementation section + ACs

**Change 2**: Unit test expectations (Concerns 2, 5)
- **What's wrong**: Steps 2 and 4 modify/create CLI code without test ACs
- **What to do**: Add explicit test file paths and test case expectations
- **Where to fix**: Step 2 ACs, Step 4 ACs

**Change 3**: Relative paths in SKILL.md (Concern 3)
- **What's wrong**: LEARNINGS.md requires relative paths; plan doesn't mention this
- **What to do**: Add note to Step 3 about relative path requirement
- **Where to fix**: Step 3, before "Skill definition" section

**Change 4**: Status/Pull implementation detail (Concern 4)
- **What's wrong**: "Add inbox count" and "add tip" lack implementation specifics
- **What to do**: Specify where the logic lives and which service methods to use
- **Where to fix**: Step 4, Changes section

**Change 5**: Documentation updates (Concerns 6, 7)
- **What's wrong**: AGENTS.md and capabilities.json not mentioned
- **What to do**: Add both to Step 4
- **Where to fix**: Step 4, Changes section

**Change 6**: AC fix (AC Validation table)
- **What's wrong**: "arete tool list" won't show a CLI command
- **What to do**: Change to "arete --help" and "arete inbox --help"
- **Where to fix**: Step 2, ACs
