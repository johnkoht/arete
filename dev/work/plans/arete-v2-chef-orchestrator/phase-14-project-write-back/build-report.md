# Build report — phase-14-project-write-back

> Written incrementally by the ship suborchestrator. Sections land as their tasks complete; the wrap fills in gates/ledger/suite.

## AC2 floor calibration (task 4) — `PROJECT_TOPICS_SCORE_FLOOR = 0.35`

**Method**: read-only script against the live arete-reserv workspace (cwd at workspace root so qmd's workspace-relative paths resolve — same trap services/LEARNINGS documents). For each of the 11 active projects: `buildProjectWikiQuery(name, area, body)` → `retrieveWiki(..., { area, limit: 10 })` (qmd backend; score = `qmd × 0.6 + recency(0/0.1/0.2) + area(0.1)`). Landing pads = the 23 W4 project-fed slugs from `wiki-repair-foundation/rescue-proposal-v2.md:510`.

**Read-only verified**: `git status --porcelain` in arete-reserv shows only pre-existing dirty state; every listed file's mtime predates the calibration run by hours-to-days.

**Full results** (every match retrieved, qmd-scale score):

| Project (area) | Matches ≥0.35 (cached at floor) | Below floor (excluded) |
|---|---|---|
| claims-review-generator (—) | claim-clear-pause 0.386 | |
| email-signatures (glance-communications) | glance-2-mvp 0.482, signature-logic 0.476, inactive-adjuster-signatures 0.476, email-signature-logic 0.470, email-signatures 0.470 (cap-5 cut: license-number-logic 0.464, inactive-adjusters 0.446, default-template 0.446, **declination-letters 0.376 [LANDING-PAD]**, signature-drops 0.352) | |
| email-template-rollout (glance-communications) | cover-whale-templates 0.476, copilot-rollout 0.452 | |
| glance-2-prototype (glance-2-mvp) | glance-2-mvp 0.464 | |
| glance-2-roadmap (glance-2-mvp) | | snapsheet-automation 0.316 |
| glance-2-runyon (glance-2-mvp) | glance-2-mvp 0.758, adjuster-shadowing 0.470, product-analytics-playbook 0.470, glance-notes-redesign 0.470, task-queue-cleanup 0.470 (cap-5 cut: rollout-strategy 0.464) | |
| inbound-emails-prd (glance-communications) | inbound-email-handling 0.416, dns-cutover-strategy 0.358, default-recipients 0.352 | **funds-diversion-risk 0.322 [LANDING-PAD]** |
| pop-belongings-estimate (glance-2-mvp) | *(nothing — caches empty)* | adjuster-notifications 0.292 |
| product-analytics-playbook-project (pm-operations) | product-analytics-playbook 0.458, glance-2-mvp 0.392 | |
| status-letter-automation (glance-communications) | default-email-template 0.758, glance-2-mvp 0.476, product-analytics-playbook 0.476, doi-fraud-language 0.476 | |
| task-management-v1 (glance-2-mvp) | snapsheet-migration 0.464, task-queue-cleanup 0.464, rollout-strategy 0.416, template-cleanup 0.392 | task-management 0.310 |

**Derivation**: clearly-relevant topics cluster at 0.41–0.76; the weak tail (coincidental matches on thin-corpus projects) at 0.29–0.32. **0.35** keeps every ≥0.41 relevant hit, keeps the stronger landing-pad hit (declination-letters 0.376), and gives thin-corpus projects an EMPTY cache instead of garbage (pop-belongings-estimate 0.292 → nothing) — the precision-over-recall posture review finding 3 demanded.

**Honest notes**:
1. Landing-pad recall at the floor is 1 of the 2 that surfaced at all (funds-diversion-risk 0.322 sits below; lowering to 0.30 would admit it AND two weak-tail rows — `task-management` 0.310, an actually-relevant-but-stale page, and `snapsheet-automation` 0.316). With false-cache being committed-file noise (R10-contained) and false-drop being invisible-until-next-refresh, precision wins. Only 2/23 landing pads surfaced for ANY current active project — most landing pads' feeding projects are archived or renamed; this is signal for the published-doc-sync prioritization, not a floor defect.
2. Fresh + area-matched bonuses sum to 0.3, so the floor's discriminating power over the qmd base score is real but modest (a fresh area-matched page needs base ≥ 0.083); rank order + cap-5 carry the rest of the precision. Both noted for soak: first-write topics diffs per project are the MC3 obligation.
3. Fallback-backend scale (no provider: alias-jaccard + area bonus): strong slug/alias overlap ≥ ~0.6, one-shared-token noise ≤ ~0.25 — the same 0.35 separates with ≥0.1 margin on both scales (pre-mortem D6), asserted by the unit fixture's margin assertions.

## AC4 — regression wall + R10 artifacts (task 7)

**Frozen-file proof**: `git diff 24b0f816..HEAD -- packages/core/test/services/project-area.test.ts packages/cli/test/commands/project.test.ts` → **0 lines** (byte-untouched). Both suites pass unmodified: project-area 6/6, cli project 9/9. `chef-orchestrator-skills.test.ts` change is append-only (+107/−0, verified in the task-5 commit).

**README-writers grep (verbatim, 2026-06-11)** — the only `storage.write` call sites in core services targeting a project README:

```
$ grep -rn "readmePath" packages/core/src/services/*.ts | grep -i "write"
packages/core/src/services/project-topics.ts:243:  await storage.write(refresh.readmePath, `---\n${fmText}\n---\n\n${normalizedBody}`);
packages/core/src/services/project-area.ts:123:  await storage.write(readmePath, `---\n${fmText}\n---\n\n${body.replace(/^\n+/, '')}`);
```

(project-area.ts:144 is `resetBackfilledProjectAreas` — the phase-12 `--reset` writer, also README-targeting, also preview/flag-gated. So three writer FUNCTIONS across two modules: `applyAreaToProjectReadme` + `resetBackfilledProjectAreas` (phase 12, both `backfill-area` verbs) and `applyProjectTopics` (this phase, `refresh-topics --apply`). No other core code writes a project README.)

**R10 automated guards (shipped in project-topics.test.ts)**:
1. *Behavioral*: `assembleBriefForProject` output (sections + metadata) is deep-equal for the same project with and without the `topics:` cache.
2. *Source tripwire*: brief-assemblers/brief-formatters contain no `project.topics` / `topicsRefreshed` reads — fails loudly when a future consumer appears without first making the cache authoritative.

## AC8 — gate result: **PASS**

Hard gate (plan AC8): on the fixture workspace, run the approved-update path twice with unchanged wiki state → README byte-identical after the first run; june-fixation green.

- **CLI level** (`project-refresh-topics.test.ts`, named `AC8 GATE`): first `--apply` writes `topics:` + `topics_refreshed:` + ownership comment (exactly once); second `--apply` with unchanged wiki → `changed:false`, `applied:false`, **entire workspace tree byte-identical** (snapshotTree over every file). PASS.
- **Core level** (`project-topics.test.ts`): the same rerun shape asserts **zero write CALLS** via counting adapter (stronger than identical content — R2's exact wording). PASS.
- **june-fixation** (`june-fixation.integration.test.ts`): all four substrate assertions green + the same-day-exclusion control test. PASS.

**Honest verification split (binding, from plan AC1/AC3)**: these gates certify the SUBSTRATE and the VERB write-safety. The acceptance *behavior* — the skill proposing the right edit and touching nothing else, and reject-leaves-untouched on the skill path — is LLM-mediated: prose-pinned (15 prose tests) + soak-verified (MC3, 3 John-observed runs), **not merge-verified**.

## Net-LOC ledger

Convention: logic lines (added, non-comment/non-blank), tests excluded; vs plan estimate ~+220 code / ~+310 md.

| Surface | Logic LOC | Raw |
|---|---|---|
| project-topics.ts (AC2 core) | 128 | 245 |
| CLI refresh-topics (AC2) | 103 | 117 |
| brief-assemblers (score + parseTopicsCache + population) | 27 | 50 |
| barrel + entities + project-area export | 23 | 40 |
| **Code total** | **281** | **452** |
| update-project SKILL.md (AC1) | — | 119 md |
| PATTERNS entry (AC6) | — | 31 md |
| finalize-project retro (AC5) | — | 20 md |
| docs (cli-commands, /project pointer) | — | 5 md |
| **Md total** | | **175 md** |
| Tests (excluded by convention) | | 1,271 |

**Code 281 vs ~220 est = 1.28×** (under the 1.5× tripwire; overrun concentrated in the CLI verb's display/error paths and the retrievalFailed safety branch the plan didn't budget). **Md 175 vs ~310 est = 0.56×** — prose ran UNDER again (same direction as phase-12), mostly because the skill leans on the PATTERNS entry instead of restating it.

## Deviations from plan (all flagged in diary/pre-mortem)

1. **AC5 mechanism correction (pre-mortem D5)**: `arete topic refresh` does not consume `items/decisions.md` (verified in code; the `relevantL2` channel has no production caller). Retro stays items/-mediated per OQ1, but the regen verb is `arete memory refresh` and the verified integration surfaces are briefs + area memory pointers, not topic pages. Needs John's eyes at review.
2. **`retrievalFailed` safety field** (unplanned, +~10 LOC): a wiki-retrieval ERROR forces `changed:false` so a transient failure can never empty a legitimate cache under `--apply`.
3. **`resetBackfilledProjectAreas` is a third README writer** — the plan's grep expectation named two ("applyAreaToProjectReadme + the topics writer"); the phase-12 `--reset` writer also targets READMEs. Recorded verbatim above; all three are flag-gated.
