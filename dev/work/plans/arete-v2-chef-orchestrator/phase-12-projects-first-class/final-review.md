Let me do this analysis by reading the regex and the test carefully instead.

The regex in `parseSiblingSlugs` is: `/\]\(\.\.\/([\w-]+)[/)]/g`

The character class `[/)]` means the captured slug must be followed by either `/` or `)`. Let me check the test case for "bare dir":

The test body has: `'Bare dir: [bare](../bare-sibling)'` — note this has NO trailing `/` or `)`, the `)` is actually the closing of the markdown link. Wait, the full markdown is `[bare](../bare-sibling)` — the `)` IS the close of the link. So the regex matches `](../bare-sibling)` where `bare-sibling` is captured and the `)` satisfies `[/)]`. The test expects it to match and returns `bare-sibling`. That's correct.

And `](../../../areas/glance-2-mvp.md)` — here the regex wants exactly ONE `../`, but the input has THREE `../`. After `../` the regex expects `[\w-]+` which would try to match `..`, but `.` is not in `[\w-]`. So it correctly fails for deeper paths.

Good, the regex is sound.

Now I have enough information to write the review.

---

# Phase 12 — Projects as First-Class Citizens: Holistic Review

## 1. Plan + Amendment Alignment

**Scope match is clean.** The implementation covers exactly AC1, AC2, AC3, AC4, AC6, AC10, AC11, AC12 — the gated slices A+B+C per the 2026-06-10 amendment. Each AC maps to its planned slice:

- **AC1** (read path): `resolveProjectArea()` implements the 4-tier priority (fm.area → fm.areas[0] → prose line → unresolved). Both `readProjectBySlug` and `listActiveProjects` call the shared helper. `Project` entity type gains `area?` + `areaSetBy?`, no deferred fields.
- **AC2** (backfill CLI): `arete project backfill-area` with preview-default / `--apply` / `--reset`, confidence floor, provenance, `--json` in all exit paths.
- **AC3** (open flow): `arete project open <name>` — resolver disambiguation, archived note, brief + what's-new delta, zero-write guarantee.
- **AC4** (topic-aware brief): wiki query strengthened, commitment projectSlug-first union, sibling-project section.
- **AC6** (visible failure): `metadata.areaNote` with the exact message string, rendered as italic in the brief formatter.
- **AC10**: typecheck green, tests green (verified per task).
- **AC11**: hard gate passed against live workspace (2→5 sections, `metadata.area` resolved).
- **AC12**: rollback doc with commit SHAs, `--reset` path, and out-of-scope fields noted.
- **AC1 write path** (task-3): all three skill prose files carry the optional propose-an-area step with `area_set_by: creation`.

## 2. Pre-Mortem Mitigations

| Risk | Required mitigation | In code? | Assessment |
|------|-------------------|----------|------------|
| **R3** (mislabel) | Confidence floor 0.7, preview default, below-floor → propose nothing | `BACKFILL_CONFIDENCE_FLOOR = 0.7` in `project.ts:32`; `match.confidence >= BACKFILL_CONFIDENCE_FLOOR` gate at `:104` | **PRESENT.** Non-negotiable floor enforced. |
| **R5** (auto-load tie) | Never auto-load; top-N disambiguation | `DISAMBIGUATION_SCORE_RATIO = 0.8` at `:39`; `isTie` logic at `:230-234`; JSON `{ disambiguation: true, candidates }` | **PRESENT.** Exact-slug short-circuit + score-ratio tie detection. |
| **R6** (creation friction) | Optional with default + skip; never blocks | All three SKILL.md edits say "optional — never blocks creation", "On skip... proceed area-less" | **PRESENT.** Prose only; no code enforcement needed. |
| **R9** (fm/prose divergence) | Frontmatter wins; one-line warning | `resolveProjectArea` at `:968-973` sets `divergence`; `formatProjectBriefMarkdown` renders `areaWarning` with warning emoji | **PRESENT.** |
| **R4** (future plural) | Parser tolerates `areas:` list | `fm.areas` branch at `:954-958`, takes first entry | **PRESENT.** |
| **R1/R2** | Eliminated by scope cut (no readme writes except backfill --apply) | Zero-write counting adapter test + snapshotTree CLI test | **PRESENT.** Scope cut honored completely. |

## 3. Code Quality

**Strengths:**

- **Single shared helper**: `resolveProjectArea()` is the one area-resolution function, used by both `readProjectBySlug` and `listActiveProjects` AND by `listProjectsForBackfill` — no duplication.
- **StorageAdapter only**: `project-area.ts` and `brief-assemblers.ts` have zero `fs` imports. The `project-area.ts` module correctly uses `StorageAdapter` for all I/O.
- **`--json` coverage**: every exit path in `project.ts` (both subcommands) checks `opts.json` first — workspace-not-found, no-match, disambiguation, archived, success. Follows the CLI LEARNINGS invariant.
- **`findRoot()` guard**: present in both `backfill-area` and `open` actions, with JSON-aware error output.
- **Pure functions exported for testing**: `resolveProjectArea`, `buildProjectWikiQuery`, `unionProjectCommitments`, `parseSiblingSlugs` are all pure and unit-testable.
- **Frontmatter round-trip in `project-area.ts`**: uses `yaml` parse/stringify (the `meeting-lock.ts` pattern per PRD). Body preserved via regex split.
- **`qmdResult` placed before JSON return**: the `loadConfig` → `refreshQmdIndex` call runs before the `if (opts.json)` block (`:136-139`), consistent with the CLI LEARNINGS pattern.

**Minor observations (not blockers):**

1. **Duplicated `displayTitle` / `projectDisplayName`**: `project-area.ts:61` has `displayTitle()` and `brief-assemblers.ts:985` has `projectDisplayName()` — identical logic, different names. Not a bug, but a DRY miss.
2. **Duplicated `extractSectionText` / `firstLineOfSection`**: `project-area.ts:55` extracts full section text; `brief-assemblers.ts:1054` extracts the first line. Similar but not identical — `firstLineOfSection` is specifically first-non-empty-line. Different enough to justify separate functions.
3. **`parseSiblingSlugs` regex correctness**: `[/)]` correctly catches `../slug/file.md` (via `/`) and `../slug)` (bare dir link closing paren). Rejects `../../../deeper` paths since the regex demands exactly one `../`. The comment ("Exactly ONE `../`") is accurate and helpful.
4. **The `FM_BLOCK` regex in `project-area.ts:40`** is duplicated from the standard `parseFrontmatter` utility. Since `project-area.ts` needs the raw YAML string for round-trip (parse → mutate → stringify), and `parseFrontmatter` returns a parsed object, the duplication has a structural reason.

**No invariant violations found:**
- No `fs` in services.
- No `--json` gaps.
- `findRoot()` guards present.
- No direct service construction.

## 4. Test Adequacy

**Test coverage is strong:**

- **Real fs, no mocks** for storage: `mkdtempSync` temp dirs with `FileStorageAdapter` throughout. Follows LEARNINGS.
- **Unit tests for AC1 priority order**: 11 test cases in `resolveProjectArea` suite — fm-only, prose-link, prose-plain-slug, colon-inside-bold, unbolded, different depth, fm+prose agree, fm+prose disagree (R9), areas-plural (R4), empty-string fm.area, unresolved. Comprehensive.
- **Zero-write assertions**: two layers:
  - `CountingAdapter` wrapping `FileStorageAdapter` asserting `{write: 0, append: 0, delete: 0}` after open+whatsNew (core test).
  - `snapshotTree` hash comparison in CLI test — entire workspace byte-identical before/after `project open`.
- **Integration tests**: prose-only-area project → brief populates sections 2-5; fixture workspace with meetings/commitments/decisions.
- **CLI subprocess tests**: real `runCli` with temp workspace install, testing preview/apply/reset/disambiguation/archived/no-match paths.
- **Skill prose tests**: `/project` block in `chef-orchestrator-skills.test.ts` asserts `READ-ONLY`, `NEVER writes`, `No LLM in the data path`, `Never auto-pick`, `disambiguation`, `arete project open`.
- **AC4 helpers**: `buildProjectWikiQuery`, `unionProjectCommitments`, `parseSiblingSlugs`, `meetingsForArea` (W6.2 topics-union) all have dedicated unit test suites.
- **Backfill helpers** (`project-area.test.ts`): inference text assembly, apply writes provenance + preserves nested frontmatter (notion block round-trip), idempotent rerun, reset-scoped-to-backfill.

**One gap worth noting**: the W6 live-format decisions/learnings test (`brief-project.test.ts:268`) is thorough and covers the tricky topics-union attribution chain. Good defense against the regression that Phase 9 surfaced.

## 5. Scope Creep Check

**No deferred AC scaffolding found:**

- `models/entities.ts` `Project` type has `area?` + `areaSetBy?` only — no `topics?`, `topicsRefreshed?` fields (AC5 deferred).
- No `update-project` skill directory exists.
- `finalize-project` skill is untouched by this build.
- No `topics_refreshed` or topic-cache write logic anywhere in the diff.
- The `/project` SKILL.md mentions `/update-project` once as "future phase" — appropriate forward reference, not scaffolding.
- The `ProjectBrief` metadata type has `areaNote?` and `areaWarning?` (needed for AC6/R9) but no `topics?` field.

**Clean scope boundary.**

## 6. Merge Gate Assessment

**Nothing embarrassing:**

- The implementation is well-structured, follows established patterns, and has comprehensive tests.
- The rollback doc is concrete with commit SHAs and clear reversal paths.
- `cli-commands.md` updated for discoverability.
- `AGENTS.md` rebuilt (dirty in working tree — presumably the wrap task).
- The two dirty files (`cli-commands.md` staged, `AGENTS.md` modified) are the expected wrap-task artifacts.

**One observation for the record** (not a blocker): the `bare-sibling` test case in `parseSiblingSlugs` tests `[bare](../bare-sibling)` where the closing `)` of the markdown link syntax doubles as the regex terminator. This is correct behavior — bare links like `[x](../slug)` DO occur in markdown and should be parsed as siblings. But if a README ever contains `](../slug.md)` (a file link without a subdirectory), the `.md` is not in `[\w-]+` so it won't match. This is fine — file links are not project references.

---

## VERDICT: READY

The implementation is faithful to the plan and amendment, all pre-mortem mitigations are present in code, test coverage is thorough with real-fs + zero-write + subprocess tests, no invariant violations detected, and no scope creep into deferred ACs. The `displayTitle`/`projectDisplayName` duplication is cosmetic and not worth delaying the merge for.
