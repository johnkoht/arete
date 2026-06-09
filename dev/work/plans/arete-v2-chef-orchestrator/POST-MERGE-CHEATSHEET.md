---
title: "Areté v2 chef-orchestrator — post-merge operator cheat sheet"
slug: arete-v2-post-merge-cheatsheet
created: "2026-06-08"
purpose: Quick reference for what to run (and what NOT to run) after the v2 chef-orchestrator branch lands on main. Read before touching the live arete-reserv workspace.
---

# Areté v2 — Post-Merge Cheat Sheet

> Scope: Phases 1–12 (Phase 0 already on main). Phase 12 is plan-only. Phase 11
> auto-resolve ships **dormant**. Read the "Don't touch yet" box before enabling anything.

---

## 1. After merge — what to run, in order

```
1. arete update                          # automatic, safe — do this first
2. arete commitments migrate             # DRY-RUN by default → read migration-diff.md
   (disambiguate ambiguous rows, wait 24h since last manual triage)
   arete commitments migrate --apply --owner-slug <you>
3. arete commitments backfill-area --json # PREVIEW by default → spot-check long-tail
   arete commitments backfill-area --apply
4. arete events backfill item-fates --since <date>   # OPTIONAL, idempotent
```

### `arete update` does (all safe / non-destructive):
- **Skill + template sync** — copies managed skills/tools/templates; **preserves your forks**. Phase 3/3.5 cleanups (stale `SKILL.legacy.md`, aux dedup, empty `.agents/skills/` dirs, auto-fork-base) run here.
- **Goal migration** — `goals/quarter.md` → individual goal files. Idempotent + self-backing-up (`.quarter.md.backup`). Likely a no-op if already migrated.
- **qmd index rebuild** — search index only; no source-data mutation.

> `arete update` does **NOT** migrate commitments, backfill areas, or run any winddown.
> Those are separate, explicit verbs below.

---

## 2. Manual migrations — defaults & guards

| Command | Default | Real write | Guards / notes |
|---|---|---|---|
| `arete commitments migrate` (v1→v2) | **dry-run** (writes `migration-diff.md`) | `--apply` + `--owner-slug` | 24h quiet-window (override `--force-after-triage`); refuses on ambiguous/malformed rows; writes `.arete/commitments.pre-phase-10.json` snapshot; runs under lock. ⚠️ **`--apply` has NEVER been exercised against real data — only synthetic fixtures. Highest-risk step. Read the diff carefully.** |
| `arete commitments backfill-area` | **preview** | `--apply` | Infers `area` @0.7 confidence, stamps `areaSetBy:'backfill'`. Dry-run matched ~42% (224/534) on arete-reserv. `--reset` clears ONLY backfill-marked areas. Spot-check `--json` long-tail before applying. |
| `arete events backfill item-fates --since <d>` | writes (idempotent) | on invoke | Append-only to instrumentation log. Does NOT touch commitments/tasks/wiki. Recovery primitive — low risk. |
| `arete commitments restore --from <path>` | — | on invoke | Roll back from a snapshot if a migration goes sideways. |

---

## 3. Gated / dormant code — leave OFF until validated

| Flag | Default | What it gates | Don't enable until… |
|---|---|---|---|
| `PHASE_11_AUTO_RESOLVE_ENABLED` | **false** | Gmail-evidence auto-resolution of commitments (`arete commitments resolve-from-gmail`) | (a) you relabel the 50-pair golden set (~45 min), (b) precision re-run ≥0.95 against real labels, (c) Phase 10 14-day soak retro closes **CLEAN PROCEED** (AC0 hard-gate — not yet confirmed). Even ON, the verb only *proposes*, never writes. |
| `COMMITMENTS_V2_ACTIVE` | **false** | v2 commitment read paths | No downstream readers yet — inert. Leave as-is. |

> ⚠️ **Don't touch yet:** Phase 11 auto-resolve. The golden-set precision=1.000 is a
> circular hand-written oracle, not a real model run. The chef winddown wire-in for it
> is **not built**. Keep the gate false.

---

## 4. Known issues to be aware of (live workspace)

| Issue | Impact | Severity |
|---|---|---|
| **`areas:` plural vs `area` singular** — slack-digest writes `areas: [...]`, reader reads `fm.area` singular | slack-digest area data **100% dropped** (silent) | **MED — top substantive bug** |
| **Phase 9 stance refresh cost-blocked** (~$27.63 vs $10 ceiling) | `--person` Memory Highlights ship thin until run. Path: incremental per-person ladder, start `lindsay-gray` (~$1.52) | MED (feature-gating) |
| **`getActiveTopics` truncation** (top-25 bias list) | mid-rank canonical slugs (e.g. `email-templates` #117) never reach extractor bias list → orphan topics under-tagged | LOW-MED |
| **`deferral_disagreement` events not firing** | 0 events logged; should fire from next winddown (path fixed) but unverified | LOW (instrumentation) |
| **No `arete topic add-aliases` verb** | orphan-topic alias backfill is hand-edit only; chef proposes via AC6 | LOW (cheap follow-up) |
| **`[[unmerge]]` 3+-source dupe** | resolver REFUSES (`ambiguous-dupe`) rather than peel wrong dupe — guarded, not solved | LOW |

---

## 5. Mental model reminders
- **What you see in `topics/` IS the wiki.** Everything else (meetings, slack, inbox) is raw resources that feed it. Only meeting transcripts + slack digests currently flow into the wiki.
- **`now/archive/<skill>/<file>`** = the chef's curated review surface. `resources/notes/` = the durable wiki source. Workspace root + `now/` root are user-facing only.
- **Chef proposes, never auto-executes** — every action is a numbered proposal you approve.
- **AC11 hard stop:** any single winddown >45 min = revert the relevant skill, don't iterate.

---

## 6. Bigger outstanding work (not in this merge)
- **Phase 12 — projects-first-class** (plan-only): derive project `area` so `arete brief --project` lights up; system-owned `topics:` cache; `/project` + `/update-project`. Cleanest next build.
- **Group C** — 7 PM-skill chef-rewrites (priority: `create-prd`, `discovery`, `synthesize`).
- **Phase 5** — `meeting extract` decomposition (fixes mirror-direction parser bug at source). Mostly absorbed; smaller than originally scoped.
- **Phase 6** — schema layer (events.jsonl + state.json). Conditional; may be obviated by chef pattern + item-fates.
- **Phase 11 c/audit** — unified approval surface (11c conditional, default NO-GO at day-28) + chef wire-in (not built).
