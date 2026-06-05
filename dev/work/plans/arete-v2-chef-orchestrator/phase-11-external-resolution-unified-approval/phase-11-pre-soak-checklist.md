# Phase 11-pre — 1-Day Pre-Soak Checklist (AC1a)

**Phase**: 11-pre (F4 — pre-mortem mitigation)
**AC**: AC1a — "After 11-pre merges, 1 day of normal inbound usage
(`arete pull gmail` standard mode) must pass without regression in
(a) cache writes/reads, (b) inbound triage skill output, (c) any
`EmailThread`-consuming prompt template, (d) snapshot test parity,
before 11a build kickoff."

**Status**: Awaiting John's normal-day use of `arete pull gmail` for 24h
post-merge.

**This is a manual user step.** Do NOT gate code on it — Phase 11a
kickoff is gated, not 11-pre merge.

---

## Pre-flight (one-time, before soak day begins)

- [ ] **Merge Phase 11-pre** to main (`gitboss` review + ship).
- [ ] **Mark soak start time** in this doc (e.g. "Soak began: 2026-06-02 09:00").
- [ ] **Capture baseline `arete pull gmail` JSON output** for diffing
      after soak (`arete pull gmail --json > /tmp/pre-soak-baseline.json`).
- [ ] **Confirm dist is built**:
      `ls -la packages/core/dist/integrations/gws/gmail-sent-cache.js`
      should exist (Phase 11-pre Step 2 artifact).

## Day-of soak — do normal work

The soak is **passive observation**, not a checklist of actions. John
uses `arete` normally for a full work-day (≥ 4 inbound triage cycles,
≥ 1 daily winddown). After 24h, run the verification block below.

What to look for during the day:

- [ ] `arete pull gmail` runs without throwing.
- [ ] Inbound triage (`arete brief --for "..."` with email enrichment)
      surfaces email context as before — no missing thread fields, no
      "undefined" in summaries.
- [ ] Daily winddown (`arete winddown`) doesn't error on EmailThread-
      consuming code paths.
- [ ] No `[gmail-sent-cache]` warnings in console (these are F4
      cache-invalidation alerts — they're benign if you've manually
      touched the cache, but should NOT appear during normal use).

## Post-soak verification

After 24h of normal use:

### (a) Cache writes/reads

```bash
# Confirm cache file format is v2.
cat .arete/cache/gmail-sent-*.json 2>/dev/null | head -1 | grep '"version":2'
# Expected: match. (Skip if --sent was never run during soak.)
```

- [ ] Pass: any cache file written during soak has `"version": 2`.
- [ ] Pass: re-running `arete pull gmail --sent` does not throw "wrong
      version" warnings (cache is internally consistent).

### (b) Inbound triage skill output

```bash
arete brief --for "any task touching a person with email" --json \
  | jq '.context.files[] | select(.path | startswith("email:"))'
```

- [ ] Pass: returned email context files have non-empty `summary` field.
- [ ] Pass: summary format matches pre-11-pre: `"Email: <subject> — from <from> (<date>)"`.

### (c) Prompt-template parity

Per the inbound caller audit (phase-11-pre-emailthread-audit.md), no
prompt template currently consumes `EmailThread`. This bucket is a
no-op for 11-pre. Re-verify:

```bash
grep -rn "EmailThread" packages/core/src/ --include="*.ts" \
  | grep -i "prompt\|template"
# Expected: NO matches in src code (only in gmail-sent-cache.ts and gmail.ts
#           which own the shape — see audit doc).
```

- [ ] Pass: no new prompt template introduced behind our back.

### (d) Snapshot test parity

```bash
./node_modules/.bin/tsx --test \
  packages/core/test/integrations/gws/email-thread-shape.test.ts \
  packages/core/test/integrations/gws/gmail.test.ts \
  packages/core/test/services/intelligence-email.test.ts
```

- [ ] Pass: all snapshot + provider + intelligence-email tests pass.

## Sign-off

Once all four buckets pass:

- [ ] **Soak passed** — record date + brief notes in this doc.
- [ ] **Unblock Phase 11a** — orchestrator may schedule 11a build.

If ANY bucket fails:

- [ ] **Soak failed** — capture symptom in this doc.
- [ ] Open a Phase 11-pre fixup ticket BEFORE 11a kickoff.
- [ ] Re-run soak after fixup merges.

---

## Soak log

| Date | Activity | Outcome | Notes |
|------|----------|---------|-------|
| _TBD_ | Soak start | _pending_ | |
| _TBD_ | Soak end | _pending_ | |
| _TBD_ | Sign-off | _pending_ | |

---

## Rollback path (if soak fails catastrophically)

`EmailThread` extension is additive — all new fields are optional. To
roll back:

```bash
git revert <11-pre-commit-range>
./node_modules/.bin/tsc -b packages/core packages/cli  # rebuild dist
```

The cache file `.arete/cache/gmail-sent-*.json` is harmless if left in
place after revert (it's a leaf artifact, not referenced by any code
path outside 11-pre).
