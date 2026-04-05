---
name: email-triage
description: Triage inbox — surface important threads, flag action items, suggest next steps
work_type: operations
category: default
triggers:
  - check my email
  - inbox triage
  - important emails
  - email summary
  - unread emails
---

# Email Triage Skill

Triage the user's Gmail inbox: surface important threads, flag action items, and suggest next steps.

## Workflow

### 1. Fetch Threads

```bash
arete pull gmail --json
```

If the command fails with "not configured", tell the user:

```
Gmail integration is not configured. Add google-workspace integration with status: active to arete.yaml, and ensure the gws CLI is installed and authenticated.
```

### 2. Evaluate Each Thread

For each thread, evaluate PM relevance using this rubric:

**High relevance (action needed):**
- Thread is from a known person — check if sender matches anyone in `people/` directory
- Thread contains action language: "please", "by Friday", "need from you", "can you", "action required", "ASAP", "deadline"
- Thread contains decision language: "decided", "agreed", "going with", "approved", "confirmed", "signed off"
- Thread is from someone who appeared in recent meetings (cross-reference with `now/agendas/` or recent meeting notes)

**Medium relevance (review):**
- Thread from a colleague but no clear action item
- FYI/informational threads from known contacts
- Threads with questions directed at the user

**Low relevance (skip):**
- Automated notifications without action items
- Newsletters or bulk sends that passed the Gmail filter
- Threads already replied to (not unread)

### 3. Take Action on Relevant Threads

For each relevant thread, choose one of three actions:

#### Save as conversation
If the thread contains decisions, context, or information worth preserving:

```bash
arete save conversation --title "[thread subject]" --source email --date [thread date]
```

Include the thread snippet as the conversation content. Tag with relevant area if identifiable.

#### Create task
If the thread contains a clear action item with a deadline or specific ask:

```bash
arete task add "[action item from thread]" --source "email:[thread id]"
```

#### Flag for user
If the thread is ambiguous or needs human judgment, include it in the triage summary with a note about why it needs attention.

### 4. Present Triage Summary

Format the output as:

```
## Inbox Triage

### Action Required (N threads)
- **[Subject]** from [sender] — [action needed]
  Created task: [task description]

### Saved as Context (N threads)
- **[Subject]** from [sender] — [why it was saved]

### Needs Your Review (N threads)
- **[Subject]** from [sender] — [why it needs review]
  [snippet preview]

### Skipped (N threads)
- [count] threads with no PM-relevant content
```

## Error Handling

| Error | Resolution |
|-------|-----------|
| Integration not configured | Add google-workspace to arete.yaml with status: active |
| gws CLI not installed | Install the gws CLI binary |
| Authentication failed | Run `gws auth login` to re-authenticate |
| No unread threads | Report "Inbox zero — no important unread threads" |
