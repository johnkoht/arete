---
title: "Phase 12 — Projects as first-class citizens — pre-mortem"
slug: phase-12-projects-first-class-pre-mortem
created: "2026-06-05"
parent: phase-12-projects-first-class
---

# Pre-mortem

If this phase ships and 2 weeks later John says "that was a mistake," what caused it? Each risk gets a concrete mitigation, not a wave-of-hand. Risks ordered by severity. Two of them (R1, R2) recommend amending the plan before build.

## R1 — `/project` open mutates the README (side-effect-on-read) — **HIGH; recommend plan amendment**

AC5 as written has the agent write `topics:`/`topics_refreshed:` to the README on **`/project` open**. Opening a project to *read* it should not mutate it. Consequences: (a) every `open` produces a git diff on a committed file (arete-reserv is a tracked repo — this is real noise, and dist/workspace files are committed per `feedback_commit_dist`); (b) opening in a read-only or detached context fails or surprises; (c) a user who just wanted to glance at a project now has uncommitted changes they didn't ask for.

| Severity | Likelihood |
|---|---|
| High (erodes trust — silent writes) | High (fires on the most common action) |

**Mitigation (plan amendment):** Split read from write cleanly.
- **`/project` open = pure read.** It *computes* the relevant topics for display but does NOT persist them.
- **AC5 persistence moves into `/update-project` only** (the explicit write flow) — and even there it is part of the approval-gated proposal, not an automatic side-effect. This matches the read-in / write-back split that is the whole point of the two-command design.
- If we still want the cache warm without an explicit update, gate the write behind staleness (`topics_refreshed` older than N days) AND only when the slug set actually changed (see R2) — but default to NOT writing on open.

**Action:** amend AC3 (open is read-only) and AC5 (writer belongs to `/update-project`, approval-gated).

## R2 — AC5 topics-cache churns git on every run — **HIGH; recommend plan amendment**

Even after R1, if `/update-project` bumps `topics_refreshed:` every run, the README diffs constantly even when nothing changed. Noisy history, meaningless diffs, and the cache *looks* freshly-validated when it's just date-stamped.

| Severity | Likelihood |
|---|---|
| High (poisons git history of a tracked workspace) | High (date changes every run by construction) |

**Mitigation (plan amendment):** Write the frontmatter **only when the topic slug set actually changes.** Do not bump `topics_refreshed` on a no-op. If we want "last checked" provenance without churn, keep it out of the committed file (e.g., an events log entry, not frontmatter). AC5 test must assert: same wiki state → zero file write on rerun (stronger than "identical content"; assert no write call at all).

## R3 — Area inference mislabels a project and silently poisons context — **HIGH**

AC2 infers an area for the 5 area-less projects. A wrong area is worse than none: the brief then pulls the wrong area's meetings + commitments + topics, and the error is invisible because the brief looks full and confident. E.g. `glance-comms` (comms across claims) mis-inferred to `glance-2-mvp` would surface unrelated MVP commitments as if they were comms work.

| Severity | Likelihood |
|---|---|
| High (confident-but-wrong context is the worst failure mode) | Medium (inference at 0.7 confidence; Phase 8 f8 saw 41.9% match — implying a long tail of weak/wrong matches) |

**Mitigation:**
- Preview-by-default + approval-gated + `area_set_by: backfill` provenance (already in AC2).
- **Confidence floor:** below threshold → propose *nothing*, leave the project area-less, let AC6 surface "no area" honestly. A wrong guess must never auto-fill.
- MC3 shadow: John reviews the full proposed-area + confidence table for all 8 projects before any `--apply`. Long-tail spot-check is an explicit handoff step (per Phase 8 f8 lesson).

## R4 — Projects that legitimately span multiple areas are forced into one — **MEDIUM**

The single `area` field assumes one area per project. `glance-comms` plausibly spans a comms area and a claims area; `product-analytics-playbook` may cut across areas. Forcing a primary area drops the others from the brief join.

| Severity | Likelihood |
|---|---|
| Medium (under-includes, doesn't mislead) | Medium (at least 1–2 of 8 projects look multi-area) |

**Mitigation:** Ship single primary `area` this phase (it's the 80% case and the hub the brief needs). Note `areas:` plural as a known follow-on — it aligns with the already-parked `areas:`-plural schema migration from followup-5's parking lot (slack-digest already writes plural). Don't solve it here; don't let the single-field choice foreclose it (parser should tolerate a future `areas:` list).

## R5 — Resolver loads the *wrong* project and the user doesn't notice — **MEDIUM**

"let's work on status letter" could fuzzy-match `status-letter-automation`, a `claims-review-generator` doc that mentions status letters, or a person. A silent wrong-resolution wastes the session on the wrong context.

| Severity | Likelihood |
|---|---|
| Medium (recoverable once noticed) | Medium (overlapping vocab across projects) |

**Mitigation:** On any non-unique match, `/project` shows the top-N candidates with slugs + scores and asks which (one cheap line). Never auto-load a tie. The resolver already returns scored candidates (`entity.ts:361`) — surface them rather than silently taking the top.

## R6 — Creation-time area prompt adds friction the Harvester rejects — **MEDIUM**

AC1's "propose an area at creation" inserts a step into `general-project`/`create-prd`/`discovery`. The Harvester persona (hypothesis — not validated) abandons flows that prompt mid-creation.

| Severity | Likelihood |
|---|---|
| Medium (friction at a sensitive moment) | Low–Medium (creation is already a deliberate, multi-step flow) |

**Mitigation:** Propose a single best-guess area with a default and a skip — never a blocking required field. If skipped/ignored, the project is created area-less and degrades to the AC6 path (honest, recoverable via backfill). Creation is already multi-step (it captures `**Linked Goal**` today), so one more *optional* proposal is in-character for that flow, unlike a mid-capture interruption.

## R7 — AC8 area-page write corrupts the wiki round-trip — **MEDIUM (stretch/own-phase)**

`finalize-project` writing into an area page shares surface with the meeting-extraction wiki engine. A bad write (frontmatter clobber, section reorder) damages a live area page.

| Severity | Likelihood |
|---|---|
| High if it fires | Low (stretch; gated behind explicit archive) |

**Mitigation:** Reuse `parseTopicPage`/`renderTopicPage` round-trip (no bespoke string-splice). Idempotency test writes twice → identical. Keep AC8 stretch / candidate for its own phase with heavier review, exactly because it touches the wiki engine. Append to a change-log section only; never rewrite narrative.

## R8 — "It's just a bug fix" framing hides a medium-sized phase — **MEDIUM**

The plan leads with "latent bug," but the full scope is 8 ACs, 2 new skills, a CLI group, and a wiki-engine touch. Anchoring on "tiny fix" risks under-budgeting review and scope discipline.

| Severity | Likelihood |
|---|---|
| Medium (scope creep / rushed review) | Medium |

**Mitigation:** Slice A (AC1 + AC6) genuinely *is* the bug fix and is ~40 LOC. Ship it alone, verify the AC11 section-count gate, and treat Slices C–E as separately-justified. If Slice A doesn't visibly improve the brief, stop — the rest is predicated on it.

## R9 — Two-schema tolerance creates silent area disagreement — **LOW**

A project could carry both a `{project,type,area}` frontmatter area AND a prose `**Area**:` line that disagree (e.g., after a manual edit). Priority order picks one; the other is silently ignored.

| Severity | Likelihood |
|---|---|
| Low | Low |

**Mitigation:** Frontmatter wins (documented priority). When both are present and differ, log a one-line warning in the brief/build-report so the divergence is visible, not silent.

## R10 — Topics cache becomes a load-bearing dependency by accident — **LOW**

AC5 says "no consumer hard-depends on `topics:` this phase." If a later consumer quietly starts reading it, the removability guarantee (AC12) breaks and staleness becomes load-bearing.

| Severity | Likelihood |
|---|---|
| Low now, compounds later | Low |

**Mitigation:** Treat `topics:` as a display/convenience cache only this phase. Any future consumer that wants to depend on it must first make it authoritative (a separate decision with its own freshness contract). Note this constraint in the field's ownership comment.

---

## Pre-mortem verdict

Two amendments to make **before build**: **R1** (`/project` open must be read-only; topics persistence moves to the approval-gated `/update-project`) and **R2** (write frontmatter only when the slug set changes — no date-only churn). **R3** (mislabel) is the highest live risk and is contained by confidence-floor + preview + AC6, not eliminated — the confidence floor is non-negotiable. Everything else is mitigated within the current scope or correctly deferred.
