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
  # Additional phrasings that work with tokenizer (avoids stop-word stripping issues)
  - save slack thread
  - save slack
  - capture slack
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

On confirmation, **first check `settings.conversations.peopleProcessing`** in `arete.yaml` (read the file or use `arete context`). This determines what gets written to frontmatter:

- **`off`** (or key absent) → save with `participantIds: undefined` — no `participant_ids` field written
- **`ask` or `on`** → save with `participantIds: []` — writes `participant_ids: []` as a placeholder, ready to be patched after people mapping in Step 8

Then write the conversation file directly to the workspace.

**Directory**: Ensure `resources/conversations/` exists (create if needed).

**Filename**: `resources/conversations/{date}-{title-slug}.md`
- Date format: `YYYY-MM-DD`
- Title slug: lowercase, spaces→hyphens, remove special characters

**File format** — write this exact structure:

```markdown
---
title: "{title}"
date: "{date}"
source: "manual"
captured_at: "{ISO timestamp}"
---

# {title}
**Date**: {date}
**Source**: manual

## Participants
- {participant 1}
- {participant 2}

## Summary
{extracted summary}

## Decisions
- {decision 1}
- {decision 2}

## Action Items
- [ ] {action 1}
- [ ] {action 2}

## Open Questions
- {question 1}

## Stakeholders
- {stakeholder 1}

## Risks
- {risk 1}

## Conversation
{normalized content from parser}

## Raw Transcript
{original pasted text}
```

**Rules**:
- Only include insight sections (Summary, Decisions, Action Items, etc.) that have content — skip empty sections entirely
- Skip the Participants section if no participants were detected
- Escape double quotes in the title frontmatter with `\"`
- The `captured_at` field is the current ISO timestamp when saved

### 7. Confirm to User

Report the result:
- **Success (mode `off`)**: "Saved to `resources/conversations/2026-02-20-sprint-planning.md`. *(Tip: set `settings.conversations.peopleProcessing: on` in `arete.yaml` to map participants to your people directory.)*"
- **Success (mode `ask` or `on`)**: "Saved to `resources/conversations/2026-02-20-sprint-planning.md`. The conversation is now discoverable via `arete context`."
- **Already exists**: Check if the file already exists before writing. If so, ask: "A conversation with this title and date already exists. Save with a different title, or overwrite?"
- **Error**: Share the error and suggest fixes.

After saving, run `arete index` to make the conversation immediately searchable by other skills (brief, meeting-prep, context).

### 8. People Processing (if mode is `ask` or `on`)

After save confirmation, check `settings.conversations.peopleProcessing` in `arete.yaml` (use `arete context` or read the file directly).

**If mode is `off`** → done (tip already shown in the confirmation message above). Pass `participantIds: undefined` (not `[]`) to `saveConversationFile()` so no `participant_ids` field appears in frontmatter.

**If mode is `ask`** → Present the participants + stakeholders list and ask:
> "Map these people to your people directory? (yes/no)"

No "always/never remember" in v1 — yes/no per run only.

**If mode is `on`** (or `ask` + user said yes):

1. **Build candidates** from `participants` (speakers from parser) + `stakeholders` (from insights):
   - Normalize names: lowercase + trim for dedup comparison
   - If the same normalized name appears in both lists → keep one entry, prefer the `participants` version (they actually spoke)
   - `source` field: `"conversation:participant"` for speakers, `"conversation:stakeholder"` for mentioned-only
   - `text` field: for participants, include a sample of their spoken lines; for stakeholders, include the sentence where they were mentioned
   - `email`: omit (Slack display names won't have email — low confidence is correct and expected)

2. **Write candidates JSON** to a temp file (e.g. `/tmp/arete-candidates-{timestamp}.json`)

3. **Call** `arete people intelligence digest --input <path> --json`
   - On non-zero exit or malformed JSON response → warn user, skip `participant_ids` writeback, **do not fail the capture** (conversation file stays saved)

4. **Process digest results**: create/update person files, surface `unknown_queue` items for user review (same pattern as `process-meetings` skill)

5. **Patch `participant_ids`** in the saved conversation file using the write tool directly:
   - Read the saved file
   - In the YAML frontmatter block (between the opening `---` and closing `---`):
     - If a `participant_ids:` line already exists → replace it with `participant_ids: [slug1, slug2]`
     - If no `participant_ids:` line exists → insert `participant_ids: [slug1, slug2]` on the line immediately before the closing `---`
   - Use flow style: `participant_ids: [slug1, slug2]` (not block style with `-` bullets)
   - Write the file back
   - If the file can't be read or written → warn: *"⚠ Participants mapped but couldn't update participant_ids in {filename}."* Do not fail.

**Note on initial save**: When mode is `ask` or `on`, pass `participantIds: []` to `saveConversationFile()` so the `participant_ids: []` placeholder is written to frontmatter on initial save — ready for writeback after mapping.

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
