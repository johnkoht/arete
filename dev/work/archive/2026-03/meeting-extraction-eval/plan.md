---
title: "Meeting Extraction Eval Suite"
slug: meeting-extraction-eval
status: draft
size: medium
tags: [testing, eval, meeting-extraction]
created: "2026-03-27T04:00:44.038Z"
updated: "2026-03-27T05:30:00.000Z"
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

# Meeting Extraction Eval Suite

## Goal
Create a human-labeled evaluation dataset to validate and improve meeting extraction quality.

## Context
Current automated tests use minimal synthetic data created inline per test. Real bugs are found through daily usage of arete-reserv but can't be systematically reproduced. Meeting extraction (decisions, learnings, action items) has no ground-truth benchmark to measure quality against.

The approach: create an eval project at `~/code/arete-test-project/` (outside the public repo for privacy). Strip real meetings to just frontmatter + transcript, have the builder annotate 5 with expected outputs, then run the extraction and compare results.

## Plan

1. **Create eval project structure**
   - Initialize `~/code/arete-test-project/` with package.json, README
   - Create `evals/meeting-extraction/cases/` directory structure
   - AC: Project exists with documented structure and can run `npm install`

2. **Build meeting stripping script**
   - Create `scripts/strip-meeting.ts` that removes AI-extracted sections (Summary, Key Points, Action Items)
   - Keeps: frontmatter, agenda (if present), ## Transcript section
   - AC: Given a meeting file from reserv, outputs stripped version to stdout or file

3. **Strip 10-15 meetings from reserv**
   - Scan `~/code/arete-reserv/resources/meetings/` for meetings with "## Transcript" sections
   - Run strip script on each, output to `cases/NNN-slug/input.md`
   - AC: 10-15 stripped meetings in numbered case directories ready for annotation

4. **Build eval runner**
   - Create `evals/meeting-extraction/run.ts`
   - Runs arete meeting extraction service on each `input.md`
   - Compares output to `expected.yaml` (when present)
   - Outputs diff report: expected vs found, missing extractions, extra extractions
   - AC: Runner produces actionable report showing coverage and gaps

## Phases

**Phase 1 (Steps 1-4)**: Infrastructure + stripping — buildable  
**Phase 2 (Builder work)**: Annotate 5 meetings with `expected.yaml` (decisions, learnings, action items with "why" rationale)  
**Phase 3 (Together)**: Run eval, review gaps, iterate on extraction prompts

## Risks
- Transcripts contain real names/companies → Mitigated by keeping project outside public repo
- expected.yaml format unclear → Define clear schema upfront with `why` field for calibration
- Extraction service API changes → Keep runner loosely coupled, easy to update

## Out of Scope
- Improving extraction prompts (that's after we see gaps in Phase 3)
- Testing other skills (weekly plan, daily plan, meeting prep) — future eval suites
- CI integration — this is local-only for now
- Anonymizing/sanitizing meeting content — not needed since it's private
