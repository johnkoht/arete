---
name: prd-to-json
description: Convert markdown PRD to JSON task list for autonomous execution. INTERNAL TOOL for Areté development only.
---

# PRD to JSON Skill

Convert a markdown PRD into structured JSON format (`prd.json`) for use with the autonomous execution system.

⚠️ **INTERNAL TOOLING** - This is for developing Areté itself, not for end users.

## When to Use

- "Convert this PRD to JSON"
- "Create prd.json from [PRD file]"
- "Prepare PRD for autonomous execution"
- After creating a PRD for an Areté feature you want to build autonomously

## Prerequisites

- A markdown PRD exists (prefer `dev/prds/{name}/prd.md`; legacy: `projects/active/{name}/outputs/prd-*.md`)
- PRD has clear tasks/user stories with acceptance criteria

## Workflow

### 1. Read Build Memory (Context)

**Before converting**, read `dev/MEMORY.md` and optionally the most recent entry files in `dev/entries/`. This provides:

- Recent architectural decisions and refactors
- Established patterns (e.g. integration structure, workspace backfill)
- Gotchas and migrations (e.g. Node migration, URL fixes)
- What to avoid (e.g. don't add Python scripts if we're migrating to Node)

Use this context to ensure tasks align with the codebase's current state and don't conflict with recent decisions.

### 2. Locate the PRD

Ask the user for the PRD file path, or search for recent PRDs:

```bash
# Find PRDs (preferred location)
ls -la dev/prds/*/prd.md

# Legacy: projects/active
find projects/active -name "prd-*.md" -type f 2>/dev/null
```

### 3. Read and Parse the PRD

Read the markdown PRD and extract:

**Required fields:**
- Feature name (derive from PRD title or filename)
- Goal/objective statement
- User stories or tasks

**For each task, extract:**
- Title (from heading or story title)
- Description (story details)
- Acceptance criteria (look for "Acceptance Criteria", "Definition of Done", or bullet lists)

### 4. Generate Task IDs

Create unique IDs for each task:
- Use kebab-case format: `task-1`, `task-2`, etc.
- Or derive from task titles: `add-utility-function`, `write-tests`, etc.
- Ensure IDs are unique within the PRD

### 5. Derive Branch Name

Suggest a branch name based on the feature:
- Format: `feature/{name}` or `refactor/{name}`
- Use kebab-case
- Example: `feature/slack-integration`

Ask user to confirm or customize.

### 6. Build PRD Object

Create the JSON structure following the schema in `dev/autonomous/schema.ts`:

```typescript
{
  name: "feature-name",
  branchName: "feature/feature-name",
  goal: "High-level goal from PRD",
  userStories: [
    {
      id: "task-1",
      title: "Task title",
      description: "Detailed description",
      acceptanceCriteria: [
        "Criterion 1",
        "Criterion 2"
      ],
      status: "pending",
      passes: false,
      attemptCount: 0
    }
  ],
  metadata: {
    createdAt: new Date().toISOString(),
    totalTasks: 3,
    completedTasks: 0,
    failedTasks: 0
  }
}
```

### 7. Validate

Ensure:
- Each task has at least one acceptance criterion
- All required fields present
- Task IDs are unique
- Status is "pending" for all tasks
- attemptCount is 0 for all tasks

Reference `dev/autonomous/schema.ts` for validation functions.

### 8. Write prd.json

Write the JSON to `dev/autonomous/prd.json`:

```typescript
import fs from 'fs';
import path from 'path';

const outputPath = 'dev/autonomous/prd.json';
fs.writeFileSync(outputPath, JSON.stringify(prd, null, 2));
```

### 9. Initialize progress.txt

Create or clear the progress log:

```bash
# Copy template if it doesn't exist
cp dev/autonomous/progress.txt.template dev/autonomous/progress.txt

# Or create empty with header
echo "# Progress Log - $(date)" > dev/autonomous/progress.txt
echo "" >> dev/autonomous/progress.txt
```

### 10. Confirm with User

Present summary:
```
✅ PRD converted to JSON

Feature: {name}
Branch: {branchName}
Total tasks: {totalTasks}

Tasks:
1. {task-1-title}
2. {task-2-title}
...

Output: dev/autonomous/prd.json

Ready to execute? Say: "Execute the PRD"
```

## Parsing Tips

### Finding Acceptance Criteria

Look for these patterns in markdown:
- Headings: "Acceptance Criteria", "Definition of Done", "Success Criteria"
- Lists after "MUST", "SHOULD", "WHEN"
- Checkboxes: `- [ ] ...`
- Numbered lists after task descriptions

### Extracting Tasks

Common structures:
- H2/H3 headings as task titles
- "User Story" or "Task" prefixes
- Numbered lists: "1. Task name"
- Markdown sections separated by horizontal rules

### Handling Ambiguity

If acceptance criteria are unclear:
- Derive from task description (look for "should", "must", "will")
- Add minimum criteria: "Implementation complete", "Tests pass", "Typecheck passes"
- Flag to user: "⚠️ Task X has no explicit acceptance criteria, derived from description"

## Quality Checks

Before writing prd.json:

- [ ] All tasks have unique IDs
- [ ] All tasks have at least one acceptance criterion
- [ ] Goal is clear and specific
- [ ] Branch name follows convention
- [ ] All tasks set to "pending" status
- [ ] metadata.totalTasks matches array length

## Example Conversion

**Input (markdown PRD):**
```markdown
# Feature: Slack Integration

## Goal
Enable Areté to send notifications to Slack channels.

## User Stories

### Task 1: Create Slack Client
Build a Slack API client that can send messages to channels.

Acceptance Criteria:
- Client can authenticate with Slack API
- Client can post messages to a channel
- Client handles rate limiting

### Task 2: Add CLI Command
Add `arete slack send` command.

Must:
- Accept channel and message arguments
- Use Slack client to send message
- Return success/error status
```

**Output (prd.json):**
```json
{
  "name": "slack-integration",
  "branchName": "feature/slack-integration",
  "goal": "Enable Areté to send notifications to Slack channels",
  "userStories": [
    {
      "id": "task-1",
      "title": "Create Slack Client",
      "description": "Build a Slack API client that can send messages to channels.",
      "acceptanceCriteria": [
        "Client can authenticate with Slack API",
        "Client can post messages to a channel",
        "Client handles rate limiting"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0
    },
    {
      "id": "task-2",
      "title": "Add CLI Command",
      "description": "Add `arete slack send` command.",
      "acceptanceCriteria": [
        "Accept channel and message arguments",
        "Use Slack client to send message",
        "Return success/error status"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0
    }
  ],
  "metadata": {
    "createdAt": "2026-02-06T15:30:00Z",
    "totalTasks": 2,
    "completedTasks": 0,
    "failedTasks": 0
  }
}
```

## Error Handling

If PRD is malformed:
- Identify what's missing (tasks, acceptance criteria, etc.)
- Provide specific guidance on what to fix
- Offer to help restructure the PRD

If no acceptance criteria found:
- Warn the user
- Derive minimal criteria from description
- Suggest improving the PRD before execution

## Next Step

After successful conversion, user can:
1. Review/edit `dev/autonomous/prd.json` manually if needed
2. Invoke the execute-prd skill to begin autonomous execution
