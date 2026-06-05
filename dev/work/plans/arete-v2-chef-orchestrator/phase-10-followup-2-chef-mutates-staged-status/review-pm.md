# Phase 10 Followup-2 Plan Review — PM Pass

**Reviewer**: senior PM (same lens as Phase 11 PM review)
**Reviewed**: 2026-06-05
**Plan**: phase-10-followup-2-chef-mutates-staged-status/plan.md (v1)
**Verdict**: APPROVE WITH ONE BLOCKING CHANGE — add `[[confirm]]`-per-skip for first 7 days

## Verdict reasoning

The split landed clean. This plan does exactly what the Phase 11 PM review asked for: extracted 11b, kept the structural CT2 fix, dropped the Gmail dependency, ships in 3-4 days on a fresh empirical signal. Architecture choices honor the eng-lead C3 finding (flat string `staged_item_status` preserved; new sibling `staged_item_skip_reason` carries the metadata). The CT2 walkthrough below shows the data path actually closes end-to-end. ACs are concrete and reproducible.

The one gap — and it is a real gap, not a nit — is that the first-week trust model here is weaker than what the Phase 11 PM review recommended for Gmail auto-resolve. Chef writing `'skipped'` silently into frontmatter is a *similar* trust-crater shape to Gmail auto-resolve writing `resolved` into commitments.json: in both cases the system is mutating a load-bearing field on the user's behalf, in both cases discovery requires the user to read a section they may skim, in both cases the recovery directive is real but requires noticing the wrong call first. Followup-2 deserves the same conservative first-week posture.

## What the plan gets right

- **Honors the split cleanly**. No Gmail dependency, no 14-day soak gate, no entanglement with Phase 11's higher-risk surface. Pre-condition 3 explicitly verifies `commitApprovedItems` already drops `'skipped'` — zero-LOC apply path is a real win.
- **Sibling field shape (C3)**. `staged_item_status` stays the existing flat union; `staged_item_skip_reason` mirrors `staged_item_owner` / `staged_item_confidence` exactly. Parser cost bounded, backward compat free.
- **Three visibility surfaces, not one** (HP2). Winddown curated section + body audit comment + frontmatter. The Phase 11 PM review's concern that "user has to audit to discover it" is partially mitigated by the body audit comment that survives frontmatter cleanup (architecture §"Skipped on Apply" emit).
- **Audit log + soak observability**. `dev/diary/chef-skip-log.md` mirrors Phase 9 invocation-log pattern; trigger thresholds in §Soak observability are concrete and parseable.
- **mtime guard at 60s**. Cheap atomicity backstop that works even if 10a-pre's `proper-lockfile` slips (R3).
- **Re-extract preservation (AC5)**. Async Fathom re-extract is exactly the scenario that would silently clobber chef writes; `--force-clear-skips` escape hatch is the right shape.

## Concerns

### C1 (BLOCKING) — First-week trust model is asymmetric to Phase 11

Phase 11 PM review §"First-week-auto-resolve-is-wrong UX" recommended that HIGH-confidence auto-resolves *stage* a resolve and require `[[confirm <id>]]` in the next winddown for the first 7 days. Followup-2 should apply the same posture: for the first 7 days post-ship, chef writes `staged_item_status[id] = 'pending'` (NOT `'skipped'`) plus `staged_item_skip_reason[id] = { ..., setBy: 'chef-proposed' }`, and surfaces a `[[confirm-skip <id>]]` requirement. User confirms next winddown → status flips to `'skipped'` then `commitApprovedItems` drops it. After 7d of zero false positives in the audit log → demote to direct-`'skipped'` write.

The current plan's defense is "user-visible BEFORE apply, with inline override hint" (line 29). That is true only if user reads the winddown carefully on the same day they approve — and on a heavy day with 3 skips, that's the exact "skim" failure mode the Phase 11 PM review called out. Apply can happen the next morning; banner + section is not as load-bearing as it should be for week 1.

This is also internally consistent with how this plan thinks: HP3 already proposes a first-week banner. Add the `[[confirm-skip]]` gate underneath it (same pattern Phase 11 PM rec'd for HIGH auto-resolve). Cost: 1 extra winddown cycle of latency for the first 7 days. Benefit: false positive caught BEFORE commitment-creation, not in audit-after-the-fact.

### C2 — `[[unskip]]` discoverability (F3 from Phase 9 pre-mortem)

Same shape as Phase 9 F3: user sees a wrong skip, doesn't know the recovery directive. Plan's mitigation is "inline `[[unskip <id>]]` hints in curated 'I marked these' section" (Step 6) + first-week banner (HP3 / AC7). That is the right surface for in-the-moment recovery, but:

- The hint must appear **on every skip line**, not once per section. If chef marks 3 items, the user sees 3 skip lines, each with `[[unskip ai_0042]]` literally next to it. Plan reads this way but make it explicit in AC1 or Step 6.
- After day 7 the banner auto-removes. The `[[unskip <id>]]` hint per-line must NOT auto-remove with it — keep it on every skip line forever. The banner is a soft pointer; the per-line hint is the always-on recovery surface.
- If C1's `[[confirm-skip]]` lands, `[[unskip]]` becomes the override for *committed* skips (week 2+); `[[confirm-skip]]` covers week 1. Two directives, clean roles.

### C3 — Audit log is necessary but not sufficient on its own

`dev/diary/chef-skip-log.md` is good for soak observability (how often, what evidence, override rate). It is not a substitute for user-visible surfaces. The plan does not claim otherwise, but Q4's lean-YES for `APPLY-SKIP` log lines is correct and should be promoted to an AC, not stay open: closes the loop "chef wrote SKIP → apply honored SKIP" with no inference required from the soak reviewer.

### C4 — Q5 collision risk on `[[unskip <id>]]`

Plan leans id-alone v1. Reasonable for a single-user single-day workspace. But during a Monday batch winddown covering Fri+weekend (Phase 11 PM G3 scenario), the active winddown window covers multiple meetings; collision risk is non-zero. Cheap fix: parser accepts either `[[unskip ai_0042]]` (id-alone) or `[[unskip <slug>:ai_0042]]` (qualified) from day 1; no behavior change for the common case. Add to Step 6.

## Does this actually solve the CT2 problem? (walkthrough)

Day-of-week scenario based on the 6/04 winddown:

1. **6/04 ~11am**: John runs `arete meeting extract john-jamie-am-claim-review`. ai_0042 ("Share Notion doc with Jamie") gets staged with `staged_item_status[ai_0042] = 'pending'`.
2. **6/04 daytime**: John DMs Jamie the Notion link via Slack.
3. **6/04 ~6pm winddown**: Chef SKILL.md Rule 1/Rule 4 reconcile against Slack → produces "concrete match" skip-stage decision (the prose at line 13-15 of the 6/04 winddown).
4. **With this followup**: chef invokes `writeChefSkipToFile(storage, john-jamie-path, 'ai_0042', { reason: 'already fulfilled via slack-dm', evidence: 'Slack DM → Jamie Burk, 2026-06-04', setBy: 'chef' })`. Frontmatter `staged_item_status[ai_0042] = 'skipped'`; sibling `staged_item_skip_reason[ai_0042]` populated; body comment inserted; SKIP audit-log line appended. Winddown curated view shows "I marked these as skip-already-done: ai_0042 — already fulfilled via slack-dm [[unskip ai_0042]]".
5. **6/04 evening or 6/05 morning**: John clicks `approve all staged` → `commitApprovedItems` filter excludes ai_0042 (status !== 'approved'). No CT2 commitment created. `## Skipped on Apply` section emitted in body. Frontmatter cleanup clears sibling fields.

Closes the CT2 gap structurally. The data path holds.

**Edge case — chef wrong (R1)**: if John actually had NOT sent the DM and chef false-positives, today's plan surfaces it in the winddown curated section. He either notices BEFORE clicking approve (good — backs out via frontmatter edit or `[[unskip]]` next winddown), OR he doesn't notice and ai_0042 gets dropped silently. Recovery requires John to notice "wait, did I send that?" — exact failure mode C1 addresses by adding the `[[confirm-skip]]` gate for week 1.

## Scope

3-4 days is right. Seven half-day steps with concrete deliverables; Step 7 (tests) is bounded by synthetic fixtures (no LLM, no production-data writes). The narrow `withLock`-around-`MeetingService.updateFrontmatter` fallback (pre-condition 1) keeps followup-2 shippable even if 10a-pre slips. No scope creep visible.

The C1 first-week `[[confirm-skip]]` addition adds ~½ day (directive parser entry + status-flip-on-confirm + audit log CONFIRM line). New total: 3.5-4.5 days. Still right-sized for a followup.

## Final recommendation

**APPROVE — build after C1 lands in the plan.**

Specifically:
1. **(BLOCKING) Add C1**: first-7-day `[[confirm-skip <id>]]` gate. Chef writes `setBy: 'chef-proposed'` and leaves status `'pending'` during week 1; user confirms next winddown to flip to `'skipped'`. After 7d zero false-positives in audit log → demote to direct-`'skipped'` write. Add as AC7a alongside AC7's banner.
2. **(NIT) C2**: clarify that `[[unskip <id>]]` hint appears per-skip-line and persists past the 7d banner removal. Tighten Step 6 prose.
3. **(NIT) C3**: promote Q4 (APPLY-SKIP log line at commit) from lean-YES to an AC. Closes the data-path-honored loop observably.
4. **(NIT) C4**: parser accepts both `[[unskip ai_0042]]` and `[[unskip <slug>:ai_0042]]` from day 1. Trivial in Step 6.

With C1 added, this is a strong APPROVE and should be the next thing shipped after Phase 10 main scope stabilizes. The CT2 walkthrough confirms the gap closes; the trust model just needs the same conservative first-week posture Phase 11 will use for Gmail auto-resolve.
