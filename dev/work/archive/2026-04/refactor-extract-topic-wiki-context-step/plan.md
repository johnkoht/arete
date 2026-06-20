---
title: "Refactor: extract buildTopicWikiContext helper from meeting-context.ts Step 7"
slug: refactor-extract-topic-wiki-context-step
status: idea
size: tiny
---

# Refactor: extract buildTopicWikiContext helper from meeting-context.ts Step 7

**Source**: PRD wiki-leaning-meeting-extraction, Task 5 reviewer feedback (2026-04-28)

## What

`buildMeetingContext` in `packages/core/src/services/meeting-context.ts` has Step 7 (topic-wiki context enrichment) inline at lines ~978–1025 (~47 lines). The block:

1. Calls `topicMemory.listAll(paths)` to fetch all topic identities
2. Runs `detectTopicsLexical` on the transcript
3. For each detected slug: builds a Map<slug, TopicPage>, renders sections via `renderForExtractionContext`, fetches L2 excerpts via `getMemoryItemsForTopics`
4. Wraps the whole thing in try/catch; pushes warnings on failure
5. Assigns to `bundle.topicWikiContext` if at least one topic detected

## Why

DRY / readability. The block is self-contained — pure inputs (transcript, topicMemory, paths) and one output (the topicWikiContext shape). Extracting to a standalone helper would:
- Make `buildMeetingContext` shorter and easier to scan
- Enable independent unit testing of the wiki-context assembly logic (currently tested via the full bundle)
- Make it easier to swap in alternative detection strategies (e.g., LLM-based detection per Decision #5 escape hatch)

## Suggested direction

```ts
// In meeting-context.ts (or a new file packages/core/src/services/topic-wiki-context.ts):
export async function buildTopicWikiContext(deps: {
  topicMemory: TopicMemoryService;
  paths: WorkspacePaths;
}, transcript: string): Promise<TopicWikiContext | undefined>
```

The helper returns `undefined` when no topics detected (preserves the optional-field contract on `MeetingContextBundle`). `buildMeetingContext` calls it inside the existing try/catch and assigns the result to the bundle.

## Out of scope

- No behavior changes — pure structural refactor
- No test changes beyond moving any existing wiki-context-specific tests to a new test file (if extracted)
