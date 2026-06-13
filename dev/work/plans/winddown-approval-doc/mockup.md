# Mockup — checkbox approval winddown (idea 1)

Reference: `arete-reserv/now/archive/daily-winddown/winddown-2026-06-09.md` (current
format) recast into the checkbox-approval format. Real 6/9 items used throughout.

---

## CURRENT (6/9, abridged) — what you review today

> Approval is prose + IDs. To act you tell the agent "approve CT1, CT3; skip CT5"
> or "approve all staged" — copy/paste IDs or text back into chat.

```
## Closed today (proposed)
[CT1] Karl-meeting ai_004 "Relay to eng/product that adjusters want emails..." — already done.
      Action if approved: nothing further (skip stands) · Override: [[unskip ai_004]]
[CT2] Anthony-1:1 ai_006 "Confirm consolidation rules universal..." — answered 3.5h later...
...
## Stage for approval
**Glance 2.0 Compliance Workshop (2:30p)** — 4 actions · 7 decisions · 6 learnings
- de_001 Cadence locked: day 15 first letter, then every 30d from due date
- ai_001 Kim drafts the Claude guardrails prompt...
...
## Proposed actions
[1] arete.commitments_resolve d9bee08c --reason "..."
[7] (draft) jira.create_ticket project=PLAT type=Bug summary="..."
```

---

## PROPOSED — the same day as a checkbox doc you mark and apply

> `[x]` = keep / approve / track it · `[ ]` = drop / skip (reason shown) ·
> edit the text to amend before applying · uncertain items are unchecked and
> ask you to pick. The agent **pre-fills** its recommendation; you only touch
> the disagreements, then run **`/winddown apply`**.

```markdown
# Daily Winddown — 2026-06-09 (Tue)   ·   review & apply

> ☑ leave checked to accept · ☐ uncheck to reject · edit text to amend ·
> `/winddown apply` when done (shows a summary, confirms, then executes).
> 6 meetings · 23 items proposed-keep · 6 proposed-skip · 7 your-call · 11 actions

---

## ⛔ Blockers & ⚠ Your call first   (decide these — not pre-filled)

⚠ **Recipient-table TDD** — Anthony ai_007 vs open commitment `acc2a220` (same
   workstream, recurring-meeting guard fired). Pick one:
   - [ ] collapse ai_007 into `acc2a220` (recommended — continuation_of)   <!-- choice:ai_007>acc2a220 -->
   - [ ] stage ai_007 as fresh                                            <!-- choice:ai_007:fresh -->

⚠ **Parser-bug suspect pair** `b0e57c25` (they_owe_me john) ↔ `ce091a38`
   (i_owe_them jamie) — identical text, inversion signature. Which is real?
   - [ ] `b0e57c25` real, drop `ce091a38`     <!-- choice:mirror:keep-b0e57c25 -->
   - [ ] `ce091a38` real, drop `b0e57c25`     <!-- choice:mirror:keep-ce091a38 -->
   - [ ] both real (not a mirror)             <!-- choice:mirror:both -->

⚠ **Jarrett Duke shadowing** accepted Tue 6/23 9-10a — inside your 6/17–24 PTO.
   - [ ] move it     - [ ] intentional, keep   <!-- choice:cal:jarrett -->

---

## Glance 2.0 Compliance Workshop (2:30p)   ·   the P2 gate, cleared

### Action items
- [x] **[BLOCKER]** Glance must auto-assign claims by license profile before
      Snapsheet sunset (interim: Snapsheet assigns, Glance overrides)  <!-- de→ai surfaced; ai_xx@compliance -->
- [x] Kim drafts the Claude guardrails prompt for multi-agent letter writing  <!-- ai_001@compliance -->
- [x] Jamie + Greg move attorney-rep data claim-level → exposure-level  <!-- ai_002@compliance -->
- [x] Jamie adds policy-state field  <!-- ai_004@compliance -->
- [x] You schedule the POP-lifecycle compliance-gate walkthrough next month  <!-- ai_003@compliance -->

### Decisions
- [x] **[BLOCKER]** Cadence: day 15 first letter, then every 30d **from due
      date** (not send date)  <!-- de_001@compliance -->
- [x] V1 = multi-agent drafts → adjuster review/send; **no auto-send**  <!-- de_002@compliance -->
- [x] Attorney-rep: V1 flags + adjuster handles manually; future = BI→attorney  <!-- de_003@compliance -->
- [x] Per-exposure grouped by adjuster — one letter per unique adjuster/claim  <!-- de_004@compliance -->
- [x] Note soft-delete w/ required reason (TL+ permission); no hidden notes  <!-- de_006@compliance -->
- [x] Liability draft→final workflow w/ audit trail (CA adverse-letter trigger)  <!-- de_008@compliance NEW: was capped overflow -->
- [x] Subro / adverse-carrier exposures excluded from status letters  <!-- de_009@compliance NEW -->

### Learnings
- [x] Insured compliance follows **policy state**, claimant follows **loss
      state** — Reserv applies loss state for both today  <!-- le_001@compliance -->
- [x] Zero status-letter complaints in 2.5y, but DOI exams reach back 3 years  <!-- le_002@compliance -->
- [ ] Kim's team building AI state-reg wiki (20 agents/category)  — skip: org
      FYI, not your workstream  <!-- le_006@compliance -->

---

## Anthony / John Weekly (11a)

### Action items
- [x] Set up tech spike w/ Nick + James — recipient-table population (Kafka)  <!-- ai_004@anthony -->
- [x] Review status-letter user stories, add UX feedback/mockups  <!-- ai_002@anthony -->
- [x] Talk to Phil about Anthony's scope for rest of year  <!-- ai_005@anthony -->
- [ ] DM Nikki + Jenny the shadowing doc — skip: **moved to action below**
      (de-duped with Karl ai_001)  <!-- ai_xx@anthony dup -->
- [ ] "Confirm consolidation rules universal across carriers" — skip: **answered
      3.5h later at the 2:30p workshop** (de_001/de_004)  <!-- ai_006@anthony -->

### Decisions
- [x] PRDs get a UX section going forward  <!-- de_001@anthony -->
- [ ] V1 may default to one letter per exposure, no consolidation — skip:
      **superseded same-day** by workshop de_004 (per-adjuster grouping)  <!-- de_002@anthony -->

### Learnings
- [x] Anthony's isolation (no peer reviewers) costs velocity + morale  <!-- le_003@anthony -->
- [x] Kafka consumers process serially — one failure blocks the queue  <!-- le_002@anthony -->

---

## Email Templates Weekly (4p)   ·   3 normal items collapsed — expand in file
### Action items
- [x] You reach out to the 5 Amazon pilot users for feedback  <!-- ai_005@email -->
- [x] **[high]** PR bilingual translations prioritized over July-1 Glance target  <!-- de_001@email -->
- [ ] … 3 more (Anthony imports, bilingual var, staging flag) — keep all?
      [ ] expand   <!-- collapse:email -->

## Claim Portal + Comms (12:15p)   ·   deferred to sidecar (no items yours)
## Monthly All Hands (10a)   ·   deferred to sidecar — but 1 pulled up:
- [x] **Desk Agent hackathon win** (Copilot across all claims at once) — roadmap
      signal, worth tracking  <!-- le_xx@allhands pulled from sidecar -->

---

## Proposed actions   (cross-cutting — same check-to-do)

- [x] Resolve `d9bee08c` "Draft status-letter skill output" — done 6/9 per week.md  <!-- act:resolve:d9bee08c -->
- [x] Resolve `6d0ff6df` Josiah keywords list — done 6/9  <!-- act:resolve:6d0ff6df -->
- [x] DM @nikki + @jenny the shadowing doc (completes Karl ai_001)  <!-- act:dm:shadowing -->
      > _edit this message before apply — sent verbatim:_
      > ```
      > Great session today — here's the adjuster shadowing doc I mentioned: <link>.
      > Add your name, dates, and expertise (Nikki — property + specialty!) and DM me
      > your action-plan/note templates when you get a sec.
      > ```
- [x] **File PLAT bug**: policy docs mis-associated to wrong claims in AI context
      (9/12 in the 6/9 LLR batch)  <!-- act:jira:policy-contamination -->
- [ ] Resolve `959208f4` + `4ad041b9` as dropped (stale >4wk) — skip: let me
      look first  <!-- act:resolve:batch-stale -->
- [x] inbox_add — STS Blue $100K demand expires ~6/20, confirm owner before PTO  <!-- act:inbox:sts-blue -->

---

## FYI (no action) — threads moved, tomorrow preview, pruning candidates
<details><summary>expand</summary>
… (unchanged from today's narrative sections — read-only context) …
</details>
```

---

## What "apply" does

You run `/winddown apply`. The agent:
1. reads the saved doc, maps every checkbox to its hidden anchor ID,
2. diffs against what it wrote (what you flipped, what text you edited),
3. prints a confirm summary:
   ```
   Apply winddown 2026-06-09?
     ✔ 23 items → staged/approved      ✗ 6 items → skipped (reasons kept)
     7 your-call → resolved as marked  11 actions: 4 resolves, 1 jira draft,
     2 DMs, 1 inbox, 3 you deferred
     ⚠ 1 edited: compliance ai_003 due date "next month" → "2026-07-15"
   Proceed? [y/N]
   ```
4. on `y`: executes (meeting approve/skip writes, commitment resolve/create,
   action drafts), idempotent — re-running applies nothing new.

## Checkbox semantics summary

| You see | Means | On apply |
|---|---|---|
| `- [x]` item | agent recommends keep, you confirm | stage `approved` / create commitment |
| `- [ ]` item + reason | agent recommends skip | `skipped`, reason → `skip_reason` |
| `- [ ]` you unchecked an `[x]` | you reject the keep | `skipped`, reason "user-rejected" |
| `- [x]` you checked a `[ ]` | you rescue a proposed-skip | `approved` (overrides agent) |
| edited line text | amend before commit | text → `staged_item_edits` |
| `your-call` one option checked | your decision | that branch executes |
| `your-call` none checked | undecided | stays pending → next winddown re-asks |
```
```
