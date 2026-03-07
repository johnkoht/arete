---
name: notion
description: Pull pages from Notion and save to workspace
work_type: operations
category: essential
triggers:
  - pull from notion
  - import notion page
  - fetch notion
  - sync notion
---

# Notion Skill

Pull Notion pages into the workspace as markdown files.

## When to Use

- "Pull this Notion page into my workspace"
- "Import the PRD from Notion"
- "Fetch notion page <url>"
- "Sync this Notion doc"

## Workflow

### 1. Check Integration Status

```bash
arete integration list --json
```

Confirm `notion` shows `status: active`. If not active, tell the user:

```
Notion isn't connected yet. Run:
  arete integration configure notion

This will prompt for your Notion API token and default workspace settings.
```

Do not proceed if the integration is not active.

### 2. Get Page URL(s)

Ask the user for the Notion page URL(s) to import. Multiple URLs are supported.

### 3. Pull the Page

```bash
# Single page
arete pull notion --page <url> --json

# Multiple pages
arete pull notion --page <url1> --page <url2>

# Custom destination
arete pull notion --page <url> --destination projects/research/
```

Default destination: `resources/notes/`
Default naming: `{title_slug}.md`

### 4. Handle Errors

| Error | Cause | Resolution |
|-------|-------|-----------|
| `404 Not Found` | Page exists but isn't shared with your integration — Notion returns 404 (not 403) for unshared pages | Open the page in Notion → "..." menu → "Connect to" → select your integration, then retry |
| `401 Unauthorized` | API token expired or invalid | Run `arete integration configure notion` to re-enter your Notion API token |
| `429 Rate Limited` | Too many requests in a short window | Wait 30–60 seconds and retry; when pulling many pages at once, pull in smaller batches |
| Invalid URL format | URL doesn't match Notion's page URL pattern (`notion.so/...`) | Verify the URL from your browser; ensure it's a direct page link, not a workspace root |

### 5. Confirm Result

Report saved file path(s) and suggest next steps (e.g. reference in a project, run `arete index` if the content should be searchable).
