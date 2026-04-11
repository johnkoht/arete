---
title: "Enhance `brief` with AI Synthesis"
slug: brief-ai-enhancement
status: prioritized
size: small
tags: [cli, intelligence, ai, brief]
created: "2026-03-10"
updated: "2026-03-10"
notes: "Make brief actually brief by adding AI synthesis with graceful fallback"
---

# Enhance `brief` with AI Synthesis

## Goal

Make `brief` actually useful by adding AI synthesis while keeping graceful fallback.

---

## Problem

Current `brief` command:
- Aggregates context + memory + entities + timeline
- Outputs a structured markdown dump
- **Does not synthesize or summarize anything**
- Users get a wall of text, not a briefing

The name "brief" implies synthesis ("brief me on X"), but it's just aggregation.

## Proposal

Enhance `brief` to use AI by default for synthesis:

```bash
# AI-powered briefing (default when AI configured)
arete brief --for "Glance email templates project"
# Output: "Here's what you need to know about the Glance email templates project:
#          - Current status: POP team rollout in progress...
#          - Key decisions: Templates go to Snapsheet first, then migrate...
#          - Key people: Jamie Burk (owner), Anthony Avina (eng)...
#          - Recent activity: 3 meetings this week discussing..."

# Force no AI (get raw aggregation)
arete brief --for "topic" --raw

# Still works without AI configured (graceful fallback)
# Shows current structured output + note about AI enhancement
```

## Semantic Difference from `search`

| Command | Intent | Output |
|---------|--------|--------|
| `search "question"` | Find answer to specific question | Direct answer + sources |
| `brief --for "topic"` | Brief me on this subject | Comprehensive overview organized by category |

**search**: "Why shouldn't we add templates directly to Glance?" → "Because Jamie said..."

**brief**: "Glance email templates" → "Here's the full picture: status, decisions, people, risks, recent activity..."

## Implementation Steps

### Phase 1: Design AI briefing prompt
1. Create prompt template that takes aggregated context and produces structured brief
2. Define output structure: Status, Key Decisions, Key People, Recent Activity, Risks/Gaps
3. Test prompt with various topics

### Phase 2: Wire AI into brief command
1. In `packages/cli/src/commands/intelligence.ts` `registerBriefCommand()`
2. After `assembleBriefing()`, check `services.ai.isConfigured()`
3. If configured: pass briefing markdown to AIService with synthesis prompt
4. If not configured: show current output + suggestion to configure AI
5. Add `--raw` flag to skip AI and show aggregation only

### Phase 3: Improve AIService prompt
1. Create `brief` task type in AIService task routing
2. Add prompt template for briefing synthesis
3. Consider structured output (JSON) vs. markdown

### Phase 4: Update IntelligenceService
1. Consider moving AI synthesis into `IntelligenceService.assembleBriefing()`
2. Or keep it CLI-only (simpler, AI is presentation layer)

### Phase 5: Documentation
1. Update GUIDE.md with new brief behavior
2. Update _authoring-guide.md
3. Note that `requires_briefing: true` now gets AI-enhanced brief

## AI Prompt Design

```
You are briefing a product manager on a topic. Based on the following context, 
create a concise briefing covering:

1. **Current Status**: What's the current state?
2. **Key Decisions**: What has been decided? By whom?
3. **Key People**: Who are the stakeholders?
4. **Recent Activity**: What happened recently (meetings, decisions)?
5. **Open Questions/Risks**: What's unresolved or risky?

Be concise. Use bullet points. Cite sources when possible.

Context:
{assembled_briefing_markdown}

Topic: {user_query}
```

## Fallback Behavior

When AI is not configured:
```
## Briefing: {topic}

ℹ️  AI synthesis not available. Showing raw context.
    Configure AI with `arete credentials set anthropic` for enhanced briefings.

### Context Files
[current output...]

### Memory
[current output...]
```

## Testing

- [ ] Brief with AI configured produces synthesized output
- [ ] Brief without AI configured shows fallback + suggestion
- [ ] `--raw` flag bypasses AI even when configured
- [ ] Brief handles topics with no results gracefully
- [ ] Brief handles large context (truncation/summarization)
- [ ] `--json` output works with both AI and raw modes

## Open Questions

1. Should AI brief be streamed or wait for complete response?
2. Max context size for AI input? (truncation strategy)
3. Should we cache AI briefs for repeated queries?
4. Should `requires_briefing: true` in skills get AI brief or raw?

## Success Criteria

- `brief` actually briefs (synthesizes, not just aggregates)
- Graceful fallback when AI not configured
- Clear value prop: "configure AI to unlock full intelligence"
- Compatible with existing `requires_briefing` skill mechanism

## Dependencies

- AIService (already exists)
- Consolidate search command (separate plan) — clarifies search vs brief distinction
