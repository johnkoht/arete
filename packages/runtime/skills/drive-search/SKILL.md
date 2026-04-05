---
name: drive-search
description: Search Google Drive for documents by topic, person, or type
work_type: operations
category: default
triggers:
  - find doc in drive
  - search drive
  - drive search
  - docs shared by
  - find the PRD
  - google drive
---

# Drive Search Skill

Search Google Drive for files matching a topic, person, or type. Returns matching files with name, type, modified date, and link.

## When to Use

- "Find docs in drive about the roadmap"
- "Search drive for budget spreadsheet"
- "Docs shared by jane@example.com"
- "Find the PRD in google drive"
- "Drive search for onboarding"

**Not this skill**: Use **doc-pull** when you want to import a specific Google Doc into the workspace. Use **email-search** for email threads.

## Workflow

### 1. Check Integration

```bash
arete integration list --json
```

Look for `google-workspace` with `status: 'active'`. If not configured:

```
Google Workspace integration is not configured. Add google-workspace integration with status: active to arete.yaml, and ensure the gws CLI is installed and authenticated.
```

### 2. Parse Search Intent

Extract from the user's query:

- **People**: Names or email addresses (e.g., "shared by jane", "owned by bob@example.com")
- **Topics/keywords**: File name or content terms (e.g., "about the roadmap", "budget spreadsheet")
- **File types**: Document type filters (e.g., "spreadsheet", "presentation", "doc")
- **Date ranges**: Temporal references (e.g., "last week", "since March")

### 3. Build Drive Query

Construct a Drive search query using standard operators:

| Intent | Drive syntax |
|--------|-------------|
| By owner | `owner:jane@example.com` |
| By name | `name contains 'roadmap'` |
| By type (doc) | `mimeType = 'application/vnd.google-apps.document'` |
| By type (sheet) | `mimeType = 'application/vnd.google-apps.spreadsheet'` |
| By type (slides) | `mimeType = 'application/vnd.google-apps.presentation'` |
| Recently modified | `modifiedTime > '2026-03-01T00:00:00'` |
| Combined | `owner:jane@example.com and name contains 'roadmap'` |

If the user mentions a person by name (not email), check `people/` for their email address first:

```bash
arete people show <slug> --json
```

Use the resolved email in the Drive query.

### 4. Execute Search

```bash
arete pull drive --query "<constructed query>" --json
```

If the user specified a date range, also pass `--days <N>`:

```bash
arete pull drive --query "<query>" --days 14 --json
```

### 5. Display Results

Format results as a readable list:

```markdown
## Drive Search: [query summary]

Found N files matching "[query]"

| Modified | Type | Name | Link |
|----------|------|------|------|
| 2026-04-02 | Doc | Q2 Roadmap Draft | [link](https://docs.google.com/...) |
| 2026-03-28 | Sheet | Budget 2026 | [link](https://docs.google.com/...) |
```

If no results found: "No files found matching that query. Try broadening your search terms or date range."

### 6. Offer Follow-Up Actions

After presenting results, suggest next steps:

- "Want me to pull the content of any of these docs?" — Route to **doc-pull** skill
- "Should I search with different terms?" — Refine and re-run
- "Want me to check email threads related to this?" — Route to **email-search** skill

## Error Handling

| Error | Resolution |
|-------|-----------|
| Integration not configured | Add google-workspace to arete.yaml with status: active |
| gws CLI not installed | Install the gws CLI binary |
| Authentication failed | Run `gws auth login` to re-authenticate |
| No results | Suggest broader search terms or wider date range |
