---
name: capture-conversation
description: Capture a pasted conversation into a structured artifact with extracted insights. Use when the user pastes a conversation from Slack, Teams, email, or any source and wants to save it.
work_type: operations
category: essential
triggers:
  - capture this conversation
  - save this conversation
  - capture this slack thread
  - save this discussion
  - I have a conversation to capture
---

# Capture Conversation Skill

Capture pasted conversation text (from Slack, Teams, email, or any source) into a structured `resources/conversations/` artifact with extracted insights.

## When to Use

- User pastes a conversation and wants it captured
- "capture this conversation" / "save this conversation"
- "I have a Slack thread to save"
- User pastes text that looks like a conversation (speaker turns, timestamps)

## Workflow

### 1. Accept Pasted Text

The user will paste conversation text. This could be:
- **Timestamped**: `[10:30 AM] Alice: message` or `[2026-02-20 10:30] Alice: message`
- **Structured**: `Alice: message` (speaker turns without timestamps)
- **Unstructured**: Raw text, email body, meeting notes

If the user hasn't pasted text yet, ask them to paste the conversation they want to capture.

### 2. Parse the Conversation

Use the conversation parser (`parseConversation()` from `@arete/core`) to parse the pasted text.

The parser uses a fallback chain and never fails:
1. Try structured with timestamps → 2. Structured without timestamps → 3. Raw paragraph splitting

**What you get back:**
- `messages`: Array of parsed messages (speaker, text, optional timestamp)
- `participants`: List of detected speaker names (empty for raw format)
- `normalizedContent`: Formatted version of the conversation
- `format`: Which parser level succeeded (`timestamped`, `structured`, or `raw`)

### 3. Extract Insights

Use the insight extraction (`extractInsights()` from `@arete/core`) to analyze the normalized conversation content via LLM.

The extraction produces a structured JSON object with **optional** sections:
- `summary` — 2-3 sentence summary
- `decisions` — decisions made in the conversation
- `actionItems` — follow-ups and action items
- `openQuestions` — unresolved questions
- `stakeholders` — people or teams mentioned as involved
- `risks` — concerns or risks raised

Each section is only included when the conversation warrants it. Don't force sections that aren't there.

### 4. Present Results for Review

Present the extracted output to the user in a clear format:

```markdown
## Captured Conversation

**Title**: [suggested title based on content]
**Date**: [today or detected date]
**Source**: manual
**Participants**: [list from parser, or ask user]
**Format detected**: [timestamped/structured/raw]

### Summary
[extracted summary]

### Decisions
- [decision 1]
- [decision 2]

### Action Items
- [ ] [action 1]
- [ ] [action 2]

### Open Questions
- [question 1]

### Stakeholders
- [stakeholder 1]

### Risks
- [risk 1]
```

Only show sections that have content. Ask the user:

> "Does this look right? You can:
> - **Confirm** to save as-is
> - **Edit** the title, date, or any section
> - Ask me to **re-extract** with different focus
> - **Cancel** to discard"

### 5. Handle User Feedback

This is a conversational review flow — no custom UI or interactive prompts.

- **Title change**: User says "change the title to X" → update title
- **Date change**: User provides a different date → update date
- **Add/remove participants**: User modifies the list → update
- **Edit insights**: User says "remove that decision" or "add an action item for X" → update
- **Re-extract**: User wants a different focus → re-run extraction with guidance
- **Confirm**: User says "looks good", "save it", "confirm" → proceed to save

### 6. Save the Artifact

On confirmation, save the conversation using `saveConversationFile()` from `@arete/core`.

Build the `ConversationForSave` object:
```typescript
{
  title: "Suggested or user-edited title",
  date: "2026-02-20",  // today or user-provided
  source: "manual",
  participants: ["Alice", "Bob"],  // from parser or user
  rawTranscript: "<original pasted text>",
  normalizedContent: "<formatted version from parser>",
  insights: {
    summary: "...",
    decisions: ["..."],
    actionItems: ["..."],
    // only populated sections
  },
  provenance: {
    source: "manual",
    capturedAt: "<ISO timestamp>",
  }
}
```

The file is saved to `resources/conversations/{date}-{title-slug}.md`.

### 7. Confirm to User

Report the result:
- **Success**: "Saved to `resources/conversations/2026-02-20-sprint-planning.md`. The conversation is now discoverable via `arete context`."
- **Already exists**: "A conversation with this title and date already exists. Save with a different title, or use `--force` to overwrite?"
- **Error**: Share the error and suggest fixes.

## Example

**User pastes:**
```
[10:30 AM] Alice: Hey, did we decide on the API approach?
[10:31 AM] Bob: Yes, we're going with REST for now. GraphQL in Q3.
[10:32 AM] Alice: OK. Can you document the endpoints by Friday?
[10:32 AM] Bob: Sure. I'll also flag the auth question for Carol.
[10:33 AM] Alice: Perfect. Let's sync again Monday.
```

**Agent extracts and presents:**
```
Title: API Approach Discussion
Date: 2026-02-20
Participants: Alice, Bob

Summary: Alice and Bob confirmed the API approach — REST now, GraphQL in Q3. Bob will document endpoints by Friday and raise auth questions with Carol.

Decisions:
- Go with REST API, defer GraphQL to Q3

Action Items:
- [ ] Bob to document API endpoints by Friday
- [ ] Bob to flag auth question for Carol

Stakeholders:
- Carol (auth question)
```

**User**: "Looks good, save it."

**Agent**: "Saved to `resources/conversations/2026-02-20-api-approach-discussion.md`."

## Notes

- This skill handles the **conversational flow** (paste → review → save). The parsing and extraction are provided by `@arete/core` modules.
- Source-agnostic: works with Slack, Teams, email, or any text. No platform-specific behavior.
- The saved artifact is automatically discoverable by `arete context --for "query"` because conversations are stored in `resources/conversations/`.
