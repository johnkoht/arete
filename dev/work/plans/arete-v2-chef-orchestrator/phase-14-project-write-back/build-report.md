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

## AC4 — R10 grep artifact (task 7)

*(filled at task 7)*

## AC8 — gate result (wrap)

*(filled at wrap)*

## Net-LOC ledger (wrap)

*(filled at wrap)*
