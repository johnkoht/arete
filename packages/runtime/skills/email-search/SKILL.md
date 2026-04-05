---
name: email-search
description: Search Gmail for threads by topic, person, or keyword
work_type: operations
category: default
triggers:
  - find emails about
  - search email
  - email from
  - what did they email
  - email thread about
  - gmail search
---

# Email Search Skill

Search Gmail for threads matching a topic, person, or keyword. Returns matching threads with subject, sender, date, and snippet.

## When to Use

- "Find emails about the roadmap"
- "Search email from jane@example.com"
- "What did they email about the contract?"
- "Email thread about onboarding"
- "Gmail search for budget approval"

**Not this skill**: Use **email-triage** when triaging the full inbox ("check my email", "inbox triage"). Use **meeting-prep** when preparing for a specific meeting.

## Workflow

### 1. Check Integration

```bash
arete integration list --json
```

Look for `google-workspace` with `status: 'active'`. If not configured:

```
Gmail integration is not configured. Add google-workspace integration with status: active to arete.yaml, and ensure the gws CLI is installed and authenticated.
```

### 2. Parse Search Intent

Extract from the user's query:

- **People**: Names or email addresses (e.g., "from jane", "email from jane@example.com")
- **Topics/keywords**: Subject or body terms (e.g., "about the roadmap", "budget approval")
- **Date ranges**: Temporal references (e.g., "last week", "since March", "in the past 2 weeks")

### 3. Build Gmail Query

Construct a Gmail search query using standard operators:

| Intent | Gmail syntax |
|--------|-------------|
| From a person | `from:jane@example.com` |
| To a person | `to:alex@example.com` |
| About a topic | `subject:roadmap` or just `roadmap` |
| Date range | `after:2026/03/01 before:2026/04/01` |
| Combined | `from:jane@example.com subject:roadmap after:2026/03/01` |

If the user mentions a person by name (not email), check `people/` for their email address first:

```bash
arete people show <slug> --json
```

Use the resolved email in the Gmail query.

### 4. Execute Search

```bash
arete pull gmail --query "<constructed query>" --json
```

If the user specified a date range, also pass `--days <N>`:

```bash
arete pull gmail --query "<query>" --days 14 --json
```

### 5. Display Results

Format results as a readable list:

```markdown
## Email Search: [query summary]

Found N threads matching "[query]"

| Date | From | Subject | Snippet |
|------|------|---------|---------|
| 2026-04-02 | jane@example.com | Roadmap Q2 | Here's the updated roadmap for... |
| 2026-03-28 | jane@example.com | Re: Roadmap Draft | Thanks for the feedback, I've... |
```

If no results found: "No email threads found matching that query. Try broadening your search terms or date range."

### 6. Offer Follow-Up Actions

After presenting results, suggest next steps:

- "Want me to save any of these as a conversation?" — Use `arete save conversation` to persist important threads
- "Should I prep for a meeting with [sender]?" — Route to **meeting-prep** skill
- "Want me to search with different terms?" — Refine and re-run

## Error Handling

| Error | Resolution |
|-------|-----------|
| Integration not configured | Add google-workspace to arete.yaml with status: active |
| gws CLI not installed | Install the gws CLI binary |
| Authentication failed | Run `gws auth login` to re-authenticate |
| No results | Suggest broader search terms or wider date range |
