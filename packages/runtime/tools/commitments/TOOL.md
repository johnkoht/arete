---
name: commitments
description: Track and resolve open commitments — what you owe people and what they owe you
triggers:
  - commitments
  - what I owe
  - what they owe
  - track commitment
  - resolve commitment
  - open commitments
  - action items
---

# Commitments Tool

Track and manage open commitments — both what you owe others and what others owe you.

## When to Use

- "Show me my open commitments"
- "What do I owe Dave?"
- "What are they waiting on from me?"
- "Mark commitment as resolved"
- "Drop this commitment"
- "List action items"

## Commands

### List open commitments

```
arete commitments list
arete commitments list --direction i_owe_them
arete commitments list --direction they_owe_me
arete commitments list --person <slug>
arete commitments list --json
```

### Resolve or drop a commitment

```
arete commitments resolve <id>
arete commitments resolve <id> --status dropped
arete commitments resolve <id> --yes
```

The `<id>` can be an 8-character prefix (shown in `commitments list`) or the full 64-character hash.

## How Commitments Are Created

Commitments are automatically extracted from meeting notes when you run `arete people memory refresh`. The extraction identifies:

- **I owe them** — things you committed to during a meeting
- **They owe me** — things others committed to you

Use `arete commitments list` to see all open items at a glance.
