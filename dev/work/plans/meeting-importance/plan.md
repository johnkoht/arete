---
title: Meeting Importance
slug: meeting-importance
status: planned
size: medium
tags: [meetings, extraction, calendar]
created: 2026-03-26T22:32:12.019Z
updated: 2026-03-26T23:30:00.000Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 7
---

# Meeting Importance

## Goal

Reduce meeting processing overhead from 7-9 meetings/day to <5 minutes total attention by auto-inferring importance and processing light meetings with minimal extraction.

## Problem

With 7-9 meetings/day, processing overhead is unsustainable:
- Observing-only meetings generate action items you don't care about
- Jira setup details get extracted as "decisions"
- 2-4 truly important meetings get the same treatment as background meetings

## Plan

1. **Extend CalendarEvent with organizer and recurrence data**
   - Add `organizer?: { name: string; email?: string; self?: boolean }` to CalendarEvent type
   - Add `recurringEventId?: string` for series tracking
   - Update Google Calendar provider to map from API response
   - Acceptance: `arete pull calendar` populates organizer/recurrence in events

2. **Add importance field and inference logic**
   - Add `importance?: 'skip' | 'light' | 'normal' | 'important'` to MeetingForSave
   - Create `inferMeetingImportance()` function with rules:
     - Organizer (`self: true`) → important
     - 2 attendees (1:1) → important
     - ≤3 attendees → normal
     - ≥5 attendees + not organizer → light
   - Acceptance: Synced meetings have `importance` field populated

3. **Create light extraction prompt and mode**
   - Add `buildLightExtractionPrompt()` — summary + 2 domain learnings only
   - Add `mode: 'light' | 'normal' | 'thorough'` parameter to extraction
   - Light mode: ~50% shorter prompt, no action items
   - Thorough mode: higher limits (10 AI, 7 DE, 7 LE)
   - Acceptance: Light extraction returns ≤2 learnings, no action items

4. **Speaking ratio analysis and importance upgrade**
   - Create `calculateSpeakingRatio()` to analyze transcript
   - At processing time: if ratio > 0.4 and importance === 'light', upgrade to 'normal'
   - Acceptance: High-engagement meetings auto-upgrade from light

5. **Auto-approve light meetings and add skipped status**
   - Update `processMeetingExtraction()` to check importance
   - Light → auto-approve all items
   - Skip → no extraction, set `status: skipped`
   - Acceptance: Light meetings appear in triage as approved

6. **Wire importance into calendar pull**
   - `pullCalendar()` calls `inferMeetingImportance()` for each event
   - Write importance to meeting frontmatter at sync time
   - Acceptance: Integration test passes

7. **Update documentation**
   - LEARNINGS.md for integrations and services
   - PROFILE.md for core package
   - CLI documentation for --importance flag
   - Acceptance: All docs updated

## Risks

See `pre-mortem.md` for full risk analysis (8 risks identified, all MEDIUM or LOW).

## Out of Scope

- ical-buddy organizer detection (Google Calendar only for V1)
- Agenda importance recommendations (separate skill enhancement)
- Recurring series dedup improvements (follow-on work)
- Triage UI badge styling (backend first)
- Configurable thresholds (start with defaults)
