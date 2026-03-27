# PRD: Temporal + Person Memory v2 (Lean MVP)

## Problem
Temporal memory exists (`arete memory timeline`) but person-specific recurring context is not surfaced consistently. Builders need quick answers like: “What has Jane repeatedly asked about?”

## Goals
1. Add person-level memory highlights for repeated asks/concerns.
2. Keep highlights refreshable as new meeting transcripts arrive.
3. Surface highlights in prep/agenda workflows.
4. Preserve existing memory search/timeline behavior.

## Scope
- Core service: refresh person memory from meetings
- CLI: `arete people memory refresh`
- Skill/pattern docs: process-meetings + meeting-prep + prepare-meeting-agenda
- Tests for core + CLI

## Out of Scope
- Full topic graph (`topics.md`)
- Decision chain automation (`Supersedes`, `Led to`)
- Autonomous proactive workflow engine

## Acceptance Criteria
- Running `arete people memory refresh` updates person files with an auto-managed memory section.
- Repeated asks/concerns include count, last mention date, and source references.
- Running refresh twice does not duplicate sections.
- Existing `arete memory search` and `arete memory timeline` still pass tests.
