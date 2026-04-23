# Manual QA — fewer-llm-calls-open-task-dedup

> Step 8c from plan.md. Fill this in while running; the checklist doubles as
> a record of what was validated on what workspace.

## Environment

- Worktree: `.claude/worktrees/fewer-llm-calls-open-task-dedup` (branch `worktree-fewer-llm-calls-open-task-dedup`)
- Build: `cd packages/core && npx tsc`
- Install: link CLI to this branch (`npm link` from `packages/cli/` or run directly via `npx tsx packages/cli/src/index.ts ...`)

## Test workspace

**IMPORTANT**: use `arete-reserv-test`, NOT `arete-reserv`. The latter has real
approvals we don't want to overwrite.

```bash
cd /Users/john/code/arete-reserv-test
```

## QA 1 — existing-task dedup on a known duplicate

**Target**: verify `ai_002`-equivalent (LEAP testing spreadsheet) in
`2026-04-22-john-lindsay-11.md` now flags as `existing-task` when the action
item text closely matches an open task in `week.md`.

**Pre-flight**: the plan documents a known rule-based-matching limitation.
The real LEAP duplicate ("Create testing spreadsheet for LEAP templates" vs
"Update LEAP testing assignment sheet") has Jaccard ≈ 0.17 — below any
reasonable threshold. So **this QA validates near-paraphrase matching**,
not the hard semantic-synonym case the user originally complained about.
If you want to verify the semantic case: note it as a "known limitation"
observation, and consider the computed-topic-memory / embedding follow-ups.

**Commands**:

```bash
# Set up
export ARETE=/Users/john/code/arete/.claude/worktrees/fewer-llm-calls-open-task-dedup/packages/cli/src/index.ts
cd /Users/john/code/arete-reserv-test

# Run extract with --stage --reconcile --clear-approved
npx tsx $ARETE meeting extract \
  resources/meetings/2026-04-22-john-lindsay-11.md \
  --stage --reconcile --clear-approved --json \
  > /tmp/extract-out.json

# Observations
jq '.skipped' /tmp/extract-out.json
# Expected shape: { "reconciled": N, "existingTask": M, "slackResolved": 0 }

grep -A 8 "staged_item_source:" resources/meetings/2026-04-22-john-lindsay-11.md
# Expected: at least one ai_XXX: existing-task (any paraphrase-level match)

grep -A 3 "staged_item_matched_text:" resources/meetings/2026-04-22-john-lindsay-11.md | head -10
# Expected: matched text for any existing-task entry
```

**Record observations**:

- [ ] `jq '.skipped'` output shape is `{ reconciled, existingTask, slackResolved }`: YES / NO
- [ ] Number of `existing-task` skips: ___
- [ ] Number of `reconciled` skips: ___
- [ ] Total action items extracted: ___
- [ ] **Matched tasks** (list the matched text for each existing-task skip):
  - ___
- [ ] **False positives** (if any existing-task skip is WRONG — item shouldn't have been skipped):
  - ___

## QA 2 — spot-check 5 real meetings for false positives

**Target**: ensure the 0.7 + min-4-tokens threshold doesn't produce noisy
false positives at real 145-open-task scale. Uses the READ-ONLY real
workspace (`arete-reserv`) with `--dry-run` so no files are modified.

```bash
cd /Users/john/code/arete-reserv

# Pick 5 recent meetings — adjust slugs for real dates
for slug in \
  resources/meetings/2026-04-21-anthony-john-weekly.md \
  resources/meetings/2026-04-21-am-team-ai-workflow.md \
  resources/meetings/2026-04-21-email-templates-weekly.md \
  resources/meetings/2026-04-20-product-managers-internal-bi-weekly.md \
  resources/meetings/2026-04-20-data-eng-product-sync.md ; do
    echo "=== $slug ==="
    npx tsx $ARETE meeting extract "$slug" \
      --stage --dry-run --reconcile --json \
      | jq '{ file: .file, skipped: .skipped }'
done
```

**Record observations** (per meeting):

| meeting | reconciled | existing-task | notes / false positives |
|---------|-----------|---------------|-------------------------|
| anthony-john-weekly | | | |
| am-team-ai-workflow | | | |
| email-templates-weekly | | | |
| pm-internal-biweekly | | | |
| data-eng-product-sync | | | |

**Criterion**: ≤ 1 false positive across 5 meetings = acceptable. ≥ 2
triggers threshold re-tuning (raise to 0.75 or tighten min-token guard).

## QA 3 — cost/routing sanity check

**Target**: confirm Step 1's tier routing: main extraction calls Opus
(`extraction` → `frontier`), batch LLM review calls Sonnet
(`reconciliation` → `standard`).

```bash
# Check John's arete.yaml
grep -A 10 "^ai:" /Users/john/code/arete-reserv/arete.yaml

# Expected in config:
#   extraction: frontier
#   tiers.frontier: claude-opus-4-X
#   (reconciliation: standard OR unset; defaults to 'standard' → sonnet)
```

**Record**:

- [ ] `extraction` tier resolved to: ___ (e.g. `claude-opus-4-6`)
- [ ] `reconciliation` tier resolved to: ___ (e.g. `claude-sonnet-4-6`)
- [ ] During QA 1, two LLM calls should be made:
  - [ ] One `extraction` call (main flow)
  - [ ] One `reconciliation` call (batchLLMReview via `--reconcile`)
- [ ] (Optional) spot-check via pi-ai usage log if available

## QA 4 — fail-fast on missing `standard` tier

**Target**: confirm Step 2's fail-fast. Create a temp workspace without
`ai.tiers.standard` and run with `--reconcile`.

```bash
# In a scratch dir:
mkdir -p /tmp/arete-no-standard/resources/meetings
cat > /tmp/arete-no-standard/arete.yaml <<EOF
ai:
  tiers:
    fast: anthropic/claude-3-haiku
    frontier: anthropic/claude-opus-4-6
  tasks:
    extraction: frontier
EOF
cp /Users/john/code/arete-reserv-test/resources/meetings/2026-04-22-john-lindsay-11.md /tmp/arete-no-standard/resources/meetings/
# (plus minimal skeleton for workspace detection if needed)

cd /tmp/arete-no-standard
ANTHROPIC_API_KEY=test npx tsx $ARETE meeting extract \
  resources/meetings/2026-04-22-john-lindsay-11.md \
  --reconcile --json
```

**Expected**: exit code 1, error JSON mentions "standard" and "--reconcile",
NO LLM calls made (no Opus charge).

- [ ] Exit code: ___ (expected 1)
- [ ] Error message includes "standard": YES / NO
- [ ] Error message references --reconcile: YES / NO
- [ ] Verified no billable LLM call was made: ___

## Summary

| QA block | Pass / Fail / Limitation | Notes |
|----------|--------------------------|-------|
| QA 1: existing-task dedup | | |
| QA 2: 5-meeting spot-check | | |
| QA 3: cost routing | | |
| QA 4: fail-fast | | |

## Known limitations surfaced during QA

- Synonym-level semantic duplicates (e.g. "Create testing spreadsheet"
  vs "Update … assignment sheet") are NOT caught by rule-based Jaccard.
  Documented in plan + tests. Potential follow-up: embedding similarity
  or LLM-judge pass in the computed-topic-memory plan.
- [Add any others discovered during QA]
