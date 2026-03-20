# Calendar Event Filters

## Problem

Users have recurring calendar events that clutter their daily/weekly planning views:

1. **Personal blocks** — Events used to block time but irrelevant to planning (e.g., "Block: Kids Dropoff", "Block: Kids Pickup")
2. **Routine reminders** — Self-reminders for recurring tasks (e.g., "Daily Winddown", "Weekly Planning")
3. **Low-prep meetings** — Meetings that appear in schedule but never need agenda prep (e.g., standups)

Currently, these events:
- Show up in daily-plan output unnecessarily
- Trigger "Create agenda?" prompts the user always declines
- Add noise to meeting context gathering

## Proposed Solution

Add a filters section under integrations.calendar in arete.yaml:

```yaml
integrations:
  calendar:
    provider: google
    calendars:
      - user@company.com
    filters:
      ignore:
        - "Block: *"
        - "Daily Winddown"
        - "Weekly Planning"
        - "Weekly Winddown"
      no_prep:
        - "*Standup"
        - "Tech Standup"
```

## Filter Types

| Filter  | Behavior |
|---------|----------|
| ignore  | Event excluded from all skill outputs — daily-plan, weekly-plan, meeting lists, calendar views |
| no_prep | Event shown in schedule, but excluded from agenda creation prompts and meeting-prep suggestions |

## Pattern Matching

- **Exact match**: `"Daily Winddown"`
- **Prefix wildcard**: `"Block: *"`
- **Suffix wildcard**: `"*Standup"`
- **Both**: `"*Sync*"` (optional, may be overkill)

## Implementation Options

### Option A: Filter at CLI level
- `arete pull calendar` applies filters before returning events
- Skills receive pre-filtered list
- **Pro**: Single implementation point
- **Con**: Less flexibility for skills that might want raw data

### Option B: Filter metadata returned with events
- CLI returns all events with `{ ignore: boolean, no_prep: boolean }` flags
- Skills decide how to handle
- **Pro**: Skills have full context
- **Con**: Each skill must implement filtering

### Recommendation
Option A for `ignore` (always filter), Option B for `no_prep` (return flag, let skills decide).

## Affected Skills

- **daily-plan** — Step 3 (calendar pull), Step 5 (agenda offers)
- **meeting-prep** — Step 1 (meeting identification)
- **weekly-winddown** — Meeting processing
- **calendar** — Display filtering
