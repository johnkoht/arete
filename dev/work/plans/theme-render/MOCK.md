# Theme-render — concrete output mock (golden fixture: 6/18 status-letter day)

This is the **expected output** of `arete winddown render 2026-06-18` under `winddown_render: theme`
(v1 coarse). It is the Layer-2 golden fixture's expected doc — AC1 is a diff against this. Hidden
anchors (`<!-- de_001@... -->`) are meeting-scoped and **byte-identical** to checklist mode, so the
existing apply machinery diffs it unchanged (D4/AC6).

The 6/18 day: a morning Jamie 1:1 set status-letter decisions (single recipient, dynamic-only); the
afternoon Anthony spec-sync reversed them (multiple recipients, join table, renamed). Plus a "hold the
afternoon session" action that was moot (the session happened), and unrelated Genesys + a Lindsay 1:1.

The **mechanics** below (checkbox = elevate-on-approve, `[x]` = chef's conservative pre-elevation,
`[ ]` = your call, skip-reasons, anchors) are identical to checklist mode. The only thing that changed
is the **grouping**: `## <project/area>` instead of `## <meeting>`, with the supersession arc visible
inline.

---

## winddown — 2026-06-18 (theme view)

> Review: check items to commit, uncheck to drop, edit text freely, then `arete winddown apply
> 2026-06-18`. Pre-checked `[x]` = high-confidence keeps (the chef elevated them). `[ ]` = your call.
> Superseded items stay unchecked with the arc shown — re-check to rescue.

### 📋 status-letter-automation
*3 sessions today (Jamie 09:30 → Anthony 15:00). The afternoon spec-sync reversed the morning's
recipient model — latest wins; the morning decisions are shown superseded, not committed.*

**Decisions**
- [x] Status letters use a **join table** for recipients (multiple recipients per letter), not a
  single FK. *(15:00 Anthony spec-sync)* <!-- de_004@2026-06-18-anthony-spec-sync -->
  - ↩ **supersedes** the 09:30 call below — recipient model changed single → multiple.
- [ ] ~~Single recipient per status letter (recipient FK on the letter row).~~ *(09:30 Jamie 1:1)*
  ⤴ **superseded** by the 15:00 spec-sync (join table, multiple recipients). Kept visible — re-check
  only if you want the morning model back. <!-- de_001@2026-06-18-john-jamie-status-letter -->
- [ ] ~~Letters are dynamic-only (no static snapshot stored).~~ *(09:30 Jamie 1:1)*
  ⤴ **superseded** — Anthony's spec stores a rendered snapshot per send. <!-- de_002@2026-06-18-john-jamie-status-letter -->
- [x] Snapshot the rendered letter at send time (audit + resend fidelity). *(15:00 Anthony spec-sync)*
  <!-- de_005@2026-06-18-anthony-spec-sync -->
- [x] Rename the feature `status-letter` → **`status-report`** across schema + UI. *(15:00 Anthony
  spec-sync)* <!-- de_006@2026-06-18-anthony-spec-sync -->

**Action items**
- [x] Draft the join-table migration (recipients + per-send snapshot) (you→eng) *(15:00 spec-sync)*
  <!-- ai_005@2026-06-18-anthony-spec-sync -->
- [ ] ~~Hold an afternoon session to finalize the recipient model~~ — skip: **moot**, the 15:00
  Anthony spec-sync already happened and finalized it. <!-- ai_003@2026-06-18-john-jamie-status-letter -->
- [ ] Anthony to confirm the snapshot retention window (Anthony→you — FYI, waiting on him) *(15:00
  spec-sync)* <!-- ai_006@2026-06-18-anthony-spec-sync -->

**Learnings**
- [x] The recipient model was contested all day; the spec-sync is the source of truth, not the
  morning 1:1. *(arc)* <!-- ln_002@2026-06-18-anthony-spec-sync -->

---

### 📋 genesys-migration
*1 session (11:00 Genesys cutover sync). No supersession — straightforward.*

**Decisions**
- [x] Cut over the IVR flows the weekend of 6/27 (freeze window Fri 18:00). *(11:00 Genesys sync)*
  <!-- de_003@2026-06-18-genesys-sync -->

**Action items**
- [x] File the change-freeze ticket with infra (you→infra) *(11:00 Genesys sync)*
  <!-- ai_004@2026-06-18-genesys-sync -->
- [ ] Confirm the rollback runbook is current (you) — *not from a meeting; standing item, your call*
  <!-- ai_007@2026-06-18-genesys-sync -->

---

### 🗂 areas/engineering-management
*1 session (14:00 Lindsay 1:1). Coarse v1: the whole 1:1 lands here as its dominant theme even though
it also touched status-letters + Glance — item-level split is v2.*

**Decisions**
- [x] Lindsay owns the Glance-2 rollout comms going forward. *(14:00 Lindsay 1:1)*
  <!-- de_007@2026-06-18-lindsay-1-1 -->

**Action items**
- [x] Send Lindsay the Glance-2 timeline by Thursday (you→Lindsay) *(14:00 Lindsay 1:1)*
  <!-- ai_008@2026-06-18-lindsay-1-1 -->

> ⚠ This 1:1 also touched **status-letter-automation** (Lindsay asked about recipient scope) — in v1
> coarse those items stay here under the meeting's dominant theme. v2 item-level assignment would
> route them to the status-letter section.

---

## ⚠ Uncategorized
*Items whose meeting matched no active project/area. Visible by construction — never dropped.*

- [ ] Explore a shared "comms calendar" for cross-team launches *(14:00 Lindsay 1:1, tangent)* — looks
  like a possible new workstream; create a project? <!-- ai_009@2026-06-18-lindsay-1-1 -->

---

## Notes (chef reasoning — assignments & arc)
- **Assignments:** Jamie 1:1 + Anthony spec-sync → `status-letter-automation` (titles + recipient/
  schema content; the lexical detector missed "Status Letter" — title-aware fix caught it). Genesys
  sync → `genesys-migration`. Lindsay 1:1 → `areas/engineering-management` (dominant theme; mixed).
- **Supersession arc (status-letter):** walked the cluster oldest→newest. The 15:00 spec-sync revised
  the 09:30 recipient model (single→multiple) and storage model (dynamic→snapshot). Morning decisions
  marked superseded, NOT pre-elevated, anchors retained for rescue. Afternoon versions elevated.
- **Moot:** `ai_003` ("hold afternoon session") — the 15:00 meeting it proposed already occurred
  (attendees ⊇, topic overlap, `date:` < now). Skipped, not committed.
- **Count check:** 14 staged items in → 14 rendered (4 superseded/moot shown `[ ]`, 1 Uncategorized,
  9 live). None dropped, none duplicated. ✅

---

### Notes on the mock (for John — not part of the rendered doc)

Decisions baked in that I want your reaction to:

1. **Arc is INLINE, not a trailing "superseded" block.** The superseded morning decision sits right
   under the afternoon one that replaced it, struck-through, with `⤴ superseded by…`. You see the flip
   in context. (Alternative: a separate `### Changed today` block per theme. I think inline is
   better — the whole point of #22 is seeing the arc where the decision lives.)

2. **Superseded items render `[ ]` (unchecked) with the reason + anchor retained** — so they're never
   committed by default, but you can re-check to rescue if the chef got the direction wrong. This is
   the false-supersession safety valve (AC5).

3. **Coarse v1 limitation is shown honestly** — the Lindsay 1:1 `⚠` callout tells you "this also
   touched status-letters but coarse mode keeps it whole." That's the v1→v2 seam, surfaced not hidden.

4. **`## Uncategorized` always renders** (even with one item) as a structural guarantee, with the
   emergent-workstream nudge.

5. **Theme ordering:** active projects first (by item count / recency), then areas, then Uncategorized
   last. Open question — do you want a fixed priority order, or most-active-first?

6. **Emoji/heading style** (📋 project, 🗂 area) is cosmetic — easy to drop if you'd rather plain `##`.
