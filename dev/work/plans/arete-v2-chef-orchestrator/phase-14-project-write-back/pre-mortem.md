---
title: "Phase 14 — Project write-back — DELTA pre-mortem"
slug: phase-14-project-write-back-pre-mortem
created: "2026-06-11"
parent: phase-14-project-write-back
---

# Delta pre-mortem (post-approval, pre-build)

Per the approval note and review disposition: the phase-12 pre-mortem (R1/R2/R7/R10) is inherited whole and already discharged structurally in the plan. This delta covers ONLY the write-back-specific risks: the four seeds from the review disposition plus findings from build-time code recon. Question: if this ships and two weeks later John says "that was a mistake," what caused it?

## D1 (seeded) — Proposal-quality dead zone — **HIGH likelihood-of-mattering, unverifiable at merge by construction**

Too conservative → proposes nothing → John stops invoking it (the `synthesize` fate, already in MEMORY.md as a cautionary tale). Too chatty → approving items is slower than hand-editing → same fate via friction. CI cannot see this; AC3 is a substrate gate and the plan says so honestly.

**Mitigation (build-time, prose):** the skill's proposal menu carries explicit quota guidance — propose only items with a quoted source and a concrete edit; when the scan is empty, SAY "nothing new since <date>" with the date so an mtime artifact is distinguishable from a quiet project (see D3); never pad. The soak instruction in the skill prose tells the runner to record BOTH axes per run (items proposed; items approved; anything John edited by hand right after — i.e., a miss). **Mitigation (process):** MC3 3-run soak is the actual verification; ship report states the core value is soak-verified only. Nothing further is buildable here — this risk is why the phase is fixture-gated + soak-gated.

## D2 (seeded) — Confident-wrong proposal approved (mislabel compounding from phase-13) — **HIGH severity if it fires**

A meeting backfilled into the wrong area (phase-13 devil's-advocate: 0.8 bare name-substring matches) surfaces in the scan; source attribution makes the derived edit look authoritative; John approves a wrong README edit on a committed file. The seed asks: should proposals from `area_set_by: backfill` meetings carry a visible provenance hint?

**Decision: YES — cheap and implementable.** Recon confirmed meetings carry `area_set_by:` frontmatter (phase-13 `meeting-area.ts` writes it; `set-area` uses `approval`/`manual`, backfill uses `backfill`). The skill already reads the surfaced meeting files (AC1 data path), so the prose rule costs one line of reading it already does: any proposal whose source meeting has `area_set_by: backfill` is tagged `(area set by backfill — verify the meeting actually belongs to this project's area)` inline in the proposal. Prose-pinned in the skill-prose test. Residual: per-item approval + source quoting remain the structural mitigations; the soak reviews every item.

## D3 (seeded) — Same-day-mtime suppression makes the first live run look broken — **MEDIUM**

`assembleProjectWhatsNew` compares `m.date > sinceDay` (verified at brief-assemblers.ts:1545-1548) — a meeting on the SAME day the README was last touched is invisible to the scan. Worse combination: the legitimate contradiction is same-day-suppressed AND a spurious item survives, making the one surfaced edit disproportionately likely to be the wrong one (review DA).

**Mitigation (build):** the june-fixation fixture places the meeting strictly ≥1 day after the README mtime (day-granularity boundary documented in the fixture and asserted by construction). **Mitigation (prose):** the skill's empty-scan message includes the README-mtime date and a one-line note that same-day activity is invisible at day granularity — so a "nothing new" on a busy day reads as an artifact, not over-conservatism. **Parked (OQ5, unchanged):** timestamp granularity is a phase-12 function change; promote only if live runs trip it.

## D4 (seeded) — Decisions-stream dilution: the retro gets lost among ordinary decisions — **LOW-MEDIUM**

Retro entries formatted as standard memory items may be indistinguishable from day-to-day decisions in the area brief/wiki.

**Mitigation:** the entry's stable title key (`## Closed project: <name>`) is itself the visual differentiator and the idempotency key; `- **Project**:` provenance bullet carries the slug. Soak step 4 (first live finalize) explicitly checks findability in the area's brief after integration. If retros need more ceremony, the direct area-page writer remains a designed, deferred option at zero sunk code (plan decision 4's explicit fallback).

## D5 (NEW — recon) — AC5's stated integration mechanism doesn't exist in the code — **plan-premise correction, build-changing**

The plan (and John's OQ1 approval) say: append retro to `items/decisions.md`, "run `arete topic refresh`", the wiki engine integrates it into topic pages. **Recon refutes the verb**: `discoverTopicSources` (topic-memory.ts:1163) scans `resources/meetings/` + `resources/notes/*-slack-digest.md` ONLY; `items/` is not a topic source. The `relevantL2` prompt channel exists (`buildIntegratePrompt`) but **no production caller passes it** — it is dark. So `topic refresh` after appending the retro is a no-op with respect to the retro, and the planned AC5 substrate test ("running refresh integrates it into the named topic pages") would fail as specified. The dogfooding observation ("that pattern worked") most plausibly observed the items/ entries surfacing through the brief's Decisions & learnings section (`parseMemoryItemEntries`, Topics-bullet matched — deterministic) and/or `arete memory refresh` area-memory pointers, not topic-page integration.

**Mitigation (adaptation, spirit-preserving):** AC5 keeps everything John actually decided in OQ1 — items/-mediated, standard memory-item format, idempotency scan, ZERO new code paths, no bespoke wiki writer (R7 stays dissolved) — and corrects the integration claim to what the machinery does: (a) the retro surfaces in the area/project brief's Decisions & learnings section via Topics matching (this becomes the substrate test — deterministic, no LLM); (b) the skill prose runs `arete memory refresh` (mechanical area-memory regen whose Recent Decisions section points at items) instead of `arete topic refresh`; (c) the prose "report which topics integrated it" becomes "report where it now surfaces (area brief / area memory page)". Flagged prominently in the diary and ship report for John/prime review — if John wants true topic-page integration, that is the deferred direct-writer option (or wiring `relevantL2`), both out of scope.

**Severity: not CRITICAL** — AC5 is STRETCH/defer-not-cut, the adaptation shrinks claims rather than surface, and no approved behavior is lost (the retro still lands in items/ exactly as approved).

## D6 (NEW — recon) — Floor calibrated on one search backend, enforced on another — **MEDIUM**

AC2's absolute score floor rides `retrieveWiki` scores, but the score SCALE differs by backend: qmd path = `qmd_score × 0.6 + recency(0/0.1/0.2) + area(0.1)`; fallback path = `jaccard(0..1) + area(0.1)`. The 23-landing-pad calibration runs against live arete-reserv (qmd); CI fixtures run under `ARETE_SEARCH_FALLBACK` (token/jaccard). A single constant calibrated on qmd could be meaningless under fallback (e.g., jaccard 1.0 exact-alias matches sail over any qmd-calibrated floor; weak qmd matches at ~0.3×0.6 sit below jaccard partial matches).

**Mitigation (build):** calibrate and document the floor on the qmd scale (the production backend) AND design the below-floor exclusion fixture with wide margins on the fallback scale (strong match ≈ near-exact alias overlap, weak match ≈ one shared token, so the same constant separates them on both scales). Record both scales' behavior in the build-report calibration section. If the two scales cannot be separated by one constant with wide margins, surface per-backend floors as a build decision in the diary BEFORE shipping the verb (not after soak).

## D7 (NEW — recon) — Ownership-comment insertion corrupts a README whose body starts with structured content — **LOW**

The ownership comment is inserted "once, directly after frontmatter". A README whose body begins with another HTML comment, a badge line, or no blank line could get the comment glued to content, or duplicate detection could miss a hand-moved comment.

**Mitigation (build):** detection by stable substring (`topics: maintained by arete`) anywhere in the body → never insert twice, regardless of position; insertion always as its own line followed by a blank line; round-trip tests include a README whose body starts with an HTML comment and one with no leading blank line. (Same family as the phase-12 `body.replace(/^\n+/, '')` normalization already in `applyAreaToProjectReadme` — reuse, don't reinvent.)

---

## Verdict

**No CRITICAL risks — proceed to build.** D5 is the one finding that changes the build (AC5's substrate test + prose verb adapt to the real machinery; flagged for John), D2 and D3 land as prose rules with tests, D6 and D7 land as test-design constraints in Slice 1. D1 and D4 are soak-verified by design and the ship report must say so — same epistemics the plan already discloses for AC1/AC3.
