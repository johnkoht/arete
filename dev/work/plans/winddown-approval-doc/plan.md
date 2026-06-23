# Winddown approval doc — checkbox review surface

Status: DRAFT (2026-06-12)
Mockup: `mockup.md` (same dir) — real 6/9 items recast into the format
Relationship: this is the **human-approval half** of `chef-holistic-reconcile`
(the engine computes decisions; this is the surface it writes them into). It is
NOT blocked by that engine — it works on today's staged items and the current
winddown immediately.

## Why now

John reviews/approves in the CLI/editor by reading the winddown doc; communicating
approvals back is "copy CT IDs / item text into chat" — the friction point
([[cli-review-surface]]). The doc is a *report*; approval is *conversational*.
Make the doc the interactive surface: the agent pre-fills its recommendation as
markdown checkboxes grouped by meeting + category with inline reasoning; John
toggles only the disagreements in his editor; `/winddown apply` reads the
checkbox state back and executes. The tier/⚠ work already shipped
([[extraction-simplification-benchmark]]) supplies the pre-fill defaults and the
reasoning; this plan is the surface + the round-trip.

## Decisions

- **D1 — The doc is the input, frontmatter stays the source of truth.** Checkboxes
  are an approval *signal*; `apply` is the single writer to meeting frontmatter /
  commitments. Never two writers.
- **D2 — Binary checkbox = final tracked state, pre-filled with agent judgment.**
  `[x]` keep/approve/track · `[ ]` drop/skip (reason shown). The third state
  (uncertain) is NOT a third glyph — it lives in a dedicated "Your call" block
  that is *not* pre-filled and forces a pick (or stays pending → re-asked next run).
- **D3 — Hidden stable ID anchors per line** (`<!-- ai_001@meeting-slug -->`,
  `<!-- act:resolve:<id> -->`, `<!-- choice:... -->`). The apply mapper keys on
  these, not on text — so editing an item's text doesn't break the round-trip and
  CAN be honored as an amendment (`staged_item_edits`).
- **D4 — Two approvable kinds, one consistent surface.** Per-meeting staged items
  (action/decision/learning) AND cross-cutting proposed actions (resolve/create
  commitment, DM, jira draft, inbox). Both are checkboxes; items grouped by
  meeting+category, actions in a "Proposed actions" block.
- **D5 — Tiers drive pre-fill + ordering.** `blocker`/`high` pre-checked and
  surfaced first (incl. pulled out of sidecar-deferred meetings); `normal`
  pre-checked, collapsible; ⚠/uncertain → "Your call", unchecked. Inline reason =
  the `skip_reason`/⚠-reason already generated.
- **D6 — Apply is explicit + confirmed, never watch-on-save.** Anything that
  mutates commitments shows a summary (counts + edited-item diffs) and waits for
  `y`. Idempotent re-apply (reuses the winddown R7 resolvedAt guard).
- **D7 — Legacy/back-compat.** Behind a winddown render flag; off = today's prose
  format. The web `/review` UI is unaffected (it reads the same frontmatter
  status this writes) — see backlog item.
- **D8 — Action bodies are editable in the doc.** Actions that carry a payload —
  Slack/DM drafts, email drafts, jira ticket title/description — render their
  body inline (indented fenced block under the checkbox), and `apply` reads the
  (possibly edited) body verbatim before sending/drafting. The anchor scopes the
  whole block, not just the checkbox line, so multi-line edits map cleanly. This
  is the action-payload case of D3's edit-honoring. The agent NEVER sends without
  the explicit-apply confirm (D6); for outbound messages the confirm summary
  echoes the final edited text so you see exactly what goes out.

## Work items

**W1 — Checkbox renderer.** Winddown Step 4 (curated view) emits staged items as
the mockup format: per-meeting `### Action items / Decisions / Learnings`,
checkbox pre-filled from tier+status, `[BLOCKER]`/`[high]`/⚠ markers, inline
reason, hidden anchor per line. Reuses the W1 frontmatter tier maps from
single-pass. A small core helper `renderStagedItemsAsChecklist(meeting)` keeps
SKILL.md thin and is unit-testable.

**W2 — "Your call" + actions blocks.** Uncertain items render as questions with
option-checkboxes (`choice:` anchors); proposed actions render as action-checkboxes
(`act:` anchors). Pre-fill: none for choices, agent-reco for actions.

**W3 — Apply mapper (`/winddown apply` + `arete winddown apply <date>`).** Parse
the saved doc → map each checkbox/choice to its anchor ID → diff against the
agent-written baseline (stored alongside the doc or re-derived) → classify each as
approve / skip / user-override / edited / choice-resolved → confirm summary →
execute via existing primitives (`meeting approve/skip`, `commitments
resolve/create`, action drafts). Idempotent.

**W4 — Round-trip safety.** Anchor stability tests; edit-detection (text changed
but anchor intact → amendment); unchecked-`[x]` → skip w/ "user-rejected" reason;
checked-`[ ]` → approve override; malformed/missing anchor → surfaced in summary,
never silently dropped; re-apply applies nothing new.

## Testing strategy

- **Deterministic (the bulk):** render → parse round-trips on fixtures; anchor
  stability under text edits; the full semantics table from the mockup (each row
  is a test); idempotent re-apply; "agree case = single apply, zero toggles"
  produces identical result to the pre-fill. No LLM needed — render + parse +
  apply are pure over staged-item state.
- **Confirm-summary correctness:** golden test that the summary counts + edited
  diffs match the executed mutations exactly (the safety contract).
- **Live dogfood:** the soak (single-pass A/B) runs on THIS format if D-soak-on-new
  is chosen below — John's nightly winddown is the real test rig.

## Acceptance criteria

- AC1 Round-trip: render → (no edits) → apply reproduces the agent's exact
  recommendation (zero drift on the agree path).
- AC2 Every checkbox/choice/action maps to a resolvable anchor; an unmappable
  line is reported in the summary, never silently skipped or mis-applied.
- AC3 Semantics table (mockup) fully covered: keep/skip/user-override/rescue/edit/
  choice — each verified.
- AC4 Apply is idempotent: immediate re-apply mutates nothing (R7 guard honored).
- AC5 Confirm summary counts + edited-item diffs exactly match executed mutations.
- AC5b Editing an action's draft body in the doc (DM/Slack/email/jira) → apply
  sends/drafts the edited text verbatim; the confirm summary echoes the final
  outbound text for any message-sending action before it fires.
- AC6 Flag off → byte-identical to today's prose winddown.
- AC7 Web `/review` UI still reads correct status after a CLI apply (no
  regression — same frontmatter contract).

## Sequencing

W1 → W2 → W3 → W4. Independent of the CHR engine (works on current staged items).
Open call (below) on whether it gates the soak.

## Open call for John

**Run the single-pass soak on this new format, or on today's prose format?**
- *On the new format:* you benchmark the experience you'll actually keep, and
  dogfood the apply round-trip on real days — but it adds W1–W3 before soak start.
- *On prose first:* soak starts immediately on what shipped; adopt checkboxes after.
Recommendation: build W1–W3 first (small, ~the size of the W4 view work already
done) and soak on the new format — the approval ergonomics are half of what you're
evaluating, and the raw snapshots make either choice replayable.

## Backlog (not this plan)

- **Web `/review` UI for winddown** (idea 2): a visual surface like the meeting
  review UI, rendering each meeting's recommended/skipped/uncertain items. Sits on
  the SAME approve-state model this plan defines (item ID → recommendation →
  decision → reason), so build it as a renderer over that model later. Gated
  separately on backend extraction migration ONLY if it ever re-processes; as a
  pure review/approve surface it reads staged items (the `review.ts` routes
  already do exactly this) and is unblocked. Logged here; revisit after the
  markdown surface proves the model.
