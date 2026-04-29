---
title: "Refactor: STOP_TOKENS tunable per workspace"
slug: refactor-stop-tokens-tunable-per-workspace
status: idea
size: small
tags: [core, topic-detection, configurability, follow-up]
---

# Refactor: STOP_TOKENS tunable per workspace

**Source**: pre-merge review of wiki-leaning-meeting-extraction PR (2026-04-29)

## What

`STOP_TOKENS` is hardcoded as a top-level `const` in `packages/core/src/services/topic-detection.ts:43-55`:

```ts
export const STOP_TOKENS = new Set<string>([
  'planning', 'review', 'sync', 'discussion', 'meeting',
  'update', 'status', 'team', 'weekly', 'daily',
]);
```

These are the words that don't contribute to slug-token scoring (so `weekly-sync` doesn't fire on every status meeting). The list is tuned for a specific operating context (PM-style meetings, English).

## Why

For solo use today this is fine. But:

1. The Areté workspace abstraction is increasingly shared — different workspaces have different vocabularies. An engineering team's "sync" might be load-bearing in slug names; a sales team's "review" might be a real category.
2. Tuning thresholds based on `--dry-run-topics` output reveals the inverse: a real workspace might want to *add* terms like `1on1`, `standup`, `retro` — currently impossible without code edits.
3. The list-as-code constraint hides the actual surface (non-stop slug tokens) from the workspace owner, who is the only person who can judge what's generic.

## Suggested direction

Source the stop-tokens list from the workspace's topic catalog rather than the binary:

1. Read from `arete.yaml` under a new `topic_detection.stop_tokens: [...]` key. Default to the current 10 if absent.
2. Plumb through `detectTopicsLexical(transcript, identities, options)` — `options.stopTokens?: Set<string>` overrides the default. Caller (meeting-context) reads from workspace config.
3. Optional: derive an *additional* per-workspace stop list from the topic catalog itself (tokens that appear in ≥80% of slugs are de-facto generic).

## Size

Small. ~30 lines core change + 1 config key + a couple of tests + docs in `--dry-run-topics` output explaining where stop-tokens come from.

## Out of scope

- Promoting stop-tokens to a separate file (`stop-tokens.yaml`) — overkill for ~10 entries.
- Multi-language support (the list is English-only by assumption). File a separate i18n plan if it becomes relevant.
