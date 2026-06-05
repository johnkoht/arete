# Phase 10 Golden Set — Triage 2026-06-03

**Source**: John's manual commitment triage of arete-reserv on 2026-06-03
**Purpose**: AC3a golden-pair ground truth for hybrid dedup pipeline validation
**Usage**: when 10b-min ships, run hybrid pipeline against these IDs; assert decisions match John's labels (DROP / RESOLVE / CONSOLIDATE / KEEP / FLAG)

---

## State at time of triage

- Total open commitments: 113
- Triage target: <40
- Projected after manual triage: ~72
- 28→113 balloon attributed to per-meeting double/triple-creation in past 24h

This 113-row dataset is what Phase 10 v2's reactive dedup + data model migration must HAVE PREVENTED in the first place. Use it as both:
- **Negative test**: do these 28+7+6 entries fail to be created when Phase 10 reactive dedup is in front of `arete meeting extract`?
- **Migration validation**: when 10a migration runs against this state, does it identify the same consolidations John found manually?

---

## DROP (28) — parser-bug mirrors

Each row: keep canonical (real-counterparty); drop the duplicate(s). These are owner-as-personSlug pattern — `personSlug="john-koht"` twins of bilateral commitments. Phase 10 v2's `extractCounterpartiesFromText` parser (with Step 0 self-pattern pre-check + arrow notation regex) should prevent these from being created going forward.

| Deliverable | Keep (real counterparty) | Drop (john-koht twins) |
|---|---|---|
| Deliver POP MVP plan | 0b3609e9 (lindsay) | 09e356d0, f851e9e9 |
| Create initial Jira tickets | 1fc6eb12 (lindsay) | 5c374571, e4fe61a7 |
| Write PRD task mgmt | 52f53ff2 (lindsay) | 97823901, aea66196 |
| One-pager tasks+Jira | a25e6a2f (philip) | 8495ba36, e9339397 |
| Draft roadmap | 515a92e4 (philip) | 576f5831, 6ba63256 |
| Ping Dave (3 eng) | 746eae28 (philip) | cfaf57eb, ed20d389 |
| Fri meeting w/ Philip | 24b25b89 (philip) | bf149140, 9fb573a9 |
| Coral Trucking exec summary | 3c9e417f (austin) | 2991a6ce |
| Send Austin AI prompts | b99d56e9 (austin) | 6175ac02 |
| Observe LLR creation | 9b75174c (austin) | 7c36f5c0 |
| Send John LLR collection | 1a2e0acb (ashley) | 5a52a6b4 |
| Finalize AI translations | 5805b1c8 (luke) | 8cfcd9e8 |
| Start TDD draft email | e141a29b (anthony) | e1c662ea |
| Update import script DOI | 08bc2f35 (anthony) | cb7ea616 |
| Review doc + write TDD | 9e0b1ad5 (anthony) | 59b5ba5c |
| Send Isaiah prototype | 265342b2 (isaiah) | b86ce713 |
| Test Copilot templates | ac5a2717 (self) | 4079de26 |
| Eng one-pager (→CJ) | f79e8201 (self) | 89bcc805 |
| Investigate Amazon morale | 1c287d67 (lindsay) | 45be2765 |
| Hackathon demos→Runyon | 667478c4 (lindsay) | 6e2f0eac |

---

## RESOLVE (6) — already done today

Marked `@completedAt 2026-06-03` in week.md, but commitments.json still shows open. Phase 11's external-source resolution should auto-resolve these. For now, manual `arete commitments resolve <id>` brings them current.

| Deliverable | Commitment IDs | Done-by |
|---|---|---|
| CoverWhale/Leap DOI feedback | 943b8893, 7d956c6e | 375e25fc |
| Update status-letter doc draft-only | 3e7ce8b6, fd6df5a9 | 64783ad3 |
| Overview session w/ new engineers | a0f20b6f, 3cf2d708 | a63c54d2 |

---

## CONSOLIDATE (4 groups, 7 eliminated)

Semantic dedup territory — Phase 10 10b-min's hybrid pipeline should catch these. Different wording, same intent.

| Theme | Keep (canonical) | Merge (drop, provenance preserved in source meetings) |
|---|---|---|
| CJ status-letter one-pager | f79e8201 | 34f4fa25 (Jamie), d8b2e3a7, 28db8695 |
| POP MVP roadmap | 0b3609e9 (Lindsay) | 515a92e4 (Philip), 136fe5c1 |
| Ping Dave re: engineers | 746eae28 (3-eng ask) | 03045d28 (status-letter alloc) |
| Task tickets | a25e6a2f | 1fc6eb12 (both = Jira tickets) — PRD 52f53ff2 stays separate |

---

## FLAGS (2) — user judgment, not auto-merge

These are NOT for automation. Phase 10 should NOT touch these without explicit user direction.

- `1c287d67` "Investigate whether status letters solve Amazon morale" — Lindsay owns root-cause validation separately; possibly redundant. **John's call to keep or drop.**
- `667478c4` hackathon demos→Runyon — low priority; **keep or someday?**

---

## Phase 10 validation cases (derived)

When 10b-min ships, run reactive dedup pipeline against each entry's source meeting and assert:

1. **Parser test**: for each DROP row, the parser MUST extract the real counterparty from the source text (Lindsay / Philip / Austin / etc.) and NOT default to `john-koht`. Specifically the Step 0 self-pattern pre-check catches "note to self" / "remember to" patterns.
2. **Migration test**: when arete-reserv commitments.json is migrated, the DROP entries collapse with their canonicals (28 rows → 0 net new groups; all merged into existing canonicals).
3. **Semantic dedup test**: the 7 CONSOLIDATE rows trigger hybrid pre-filter hits + LLM cross-check returns SAME for each → merged with canonicals.
4. **Resolution test (Phase 11)**: the 6 RESOLVE rows match the `@completedAt 2026-06-03` markers in week.md → auto-resolve at HIGH confidence.

---

## Implementation note

This dataset is the empirical anchor for Phase 10 v2's AC3a (precision/recall on hybrid + LLM tier choice). 30 hand-labeled SAME/DIFFERENT/UNCERTAIN pairs can be drawn from:
- SAME pairs: each (canonical, dupe) row in DROP table — 28+ obvious SAME cases
- SAME pairs (semantic): each (canonical, merge) row in CONSOLIDATE — 7 wording-different SAME cases
- DIFFERENT pairs: pair canonicals from different DROP rows (e.g., Send Austin AI prompts vs Send John LLR) — distinct actions

Plenty of ground truth for a 30-pair golden set drawn from real workspace data.
