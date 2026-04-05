---
name: doc-pull
description: Pull a Google Doc into the workspace as markdown
work_type: operations
category: default
triggers:
  - pull this doc
  - import from google docs
  - save doc from drive
  - pull google doc
---

# Doc Pull Skill

Pull a Google Doc into the workspace as a local markdown file with source-tracking frontmatter.

## When to Use

- "Pull this doc into the workspace" (with a Google Docs URL)
- "Import from Google Docs: https://docs.google.com/document/d/..."
- "Save doc from drive"
- "Pull google doc abc123"

**Not this skill**: Use **drive-search** to find docs first. Use **notion** for pulling Notion pages.

## Workflow

### 1. Check Integration

```bash
arete integration list --json
```

Look for `google-workspace` with `status: 'active'`. If not configured:

```
Google Workspace integration is not configured. Add google-workspace integration with status: active to arete.yaml, and ensure the gws CLI is installed and authenticated.
```

### 2. Extract Document ID

The user provides either:

- **Full URL**: `https://docs.google.com/document/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit` — extract the ID between `/d/` and the next `/`
- **Doc ID directly**: `1aBcDeFgHiJkLmNoPqRsTuVwXyZ`

Parse the doc ID using this regex pattern:
```
/document\/d\/([a-zA-Z0-9_-]+)/
```

If unclear, ask: "Please share the Google Doc URL or document ID."

### 3. Fetch Document Metadata

Get the doc metadata to determine the title for the filename:

```bash
# Use the gws CLI directly since there's no arete command for doc metadata yet
# The skill runner has access to the gws integration
```

Read the doc title from metadata. Generate a slug from the title:
- Lowercase
- Replace spaces and special characters with hyphens
- Remove consecutive hyphens
- Trim to reasonable length (max 60 chars)

### 4. Fetch Document Content

Fetch the document body as plain text. The content will be converted to markdown for local storage.

### 5. Save to Workspace

Save the document to `resources/docs/{slug}.md` with frontmatter:

```markdown
---
source: google-docs
source_url: https://docs.google.com/document/d/{docId}/edit
doc_id: {docId}
title: {Original Document Title}
pulled_at: {ISO 8601 timestamp}
---

{document content}
```

Create the `resources/docs/` directory if it doesn't exist.

### 6. Confirm to User

```markdown
Pulled "{Document Title}" from Google Docs.

Saved to: `resources/docs/{slug}.md`
Source: https://docs.google.com/document/d/{docId}/edit
Pulled at: {timestamp}
```

If the file already exists, inform the user: "This doc was previously pulled. Overwriting with the latest version."

## Error Handling

| Error | Resolution |
|-------|-----------|
| Integration not configured | Add google-workspace to arete.yaml with status: active |
| Invalid URL/ID | Ask user for a valid Google Docs URL or document ID |
| Document not found | Check the doc ID and sharing permissions |
| Permission denied | The doc may not be shared with the authenticated account |
| gws CLI not installed | Install the gws CLI binary |
| Authentication failed | Run `gws auth login` to re-authenticate |
