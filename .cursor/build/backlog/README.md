# Backlog - Areté Features & Improvements

Ideas for future PRDs. When ready to build, convert to PRD in `.cursor/build/prds/`.

---

## How to Use This

1. **Capture ideas here** (or start in scratchpad, move here when mature)
2. **Flesh out details** (what, why, effort, dependencies)
3. **When ready**: Convert to full PRD in `.cursor/build/prds/{feature-name}/prd.md`
4. **Execute**: Use `.cursor/build/skills/execute-prd/SKILL.md`

---

## High Priority

### Self-Guided Onboarding
**Status**: Blocked - needs infrastructure  
**File**: `features/self-guided-onboarding.md`  
**What**: `arete onboard` command that uses Areté itself to onboard users (creates personalized project, week/daily plans, adaptive paths)  
**Why**: Critical adoption blocker - users bounce when workspace is empty even though tools work. Need clear path from "empty" to "valuable" workspace  
**Effort**: Large (8-12 tasks: enhanced setup, path logic, plan generation, checkpoints, progress tracking)  
**Dependencies**: Enhanced `arete setup` (QMD automation), week/daily planning infrastructure, progress tracking system  

### Google Calendar Provider
**Status**: Ready for PRD  
**File**: `features/google-calendar-provider.md`  
**What**: Add GoogleCalendarProvider to calendar system (OAuth2, direct API access)  
**Why**: Cross-platform support (Windows, Linux), no ical-buddy dependency, direct API control  
**Effort**: Medium (4-6 tasks: OAuth flow, token storage, provider implementation, config, tests, docs)  
**Dependencies**: Calendar system complete ✅  

### Automated Code Review Checks
**Status**: Ready for PRD  
**File**: `improvements/automated-code-review.md`  
**What**: Pre-review pattern checks before manual orchestrator review  
**Why**: Catch issues early (.js imports, no any, error handling present), save orchestrator time  
**Effort**: Small (2-3 tasks: scanner script, integration with execute-prd, tests)  
**Dependencies**: None  

---

## Medium Priority

### Progress Dashboard (arete prd status)
**Status**: Needs design  
**File**: `features/progress-dashboard.md`  
**What**: CLI command showing PRD execution status (task X/Y, tests passing, commits, ETA)  
**Why**: Track long-running PRDs (10+ tasks), visibility into progress  
**Effort**: Small (2-3 tasks: command, status computation, formatting)  
**Dependencies**: prd.json schema stable ✅  

### prd-task Subagent Type
**Status**: Needs research  
**File**: `tech-debt/prd-task-subagent.md`  
**What**: Implement prd-task in Task tool enum (currently documented but not available)  
**Why**: Cleaner prompts, less boilerplate, optimized for PRD execution  
**Effort**: Unknown (depends on Cursor API - might need feature request to Cursor team)  
**Dependencies**: Understanding of Task tool internals  

### Microsoft Calendar Provider
**Status**: Idea stage  
**What**: MicrosoftCalendarProvider via Microsoft Graph API  
**Why**: Enterprise PMs using Outlook/Teams  
**Effort**: Medium (similar to Google Calendar - OAuth2, API integration)  
**Dependencies**: Calendar system complete ✅  

---

## Low Priority / Ideas

### Search Performance Benchmarking
**What**: Performance metrics/benchmarking for large workspaces (1000+ files, 100MB+)  
**Why**: Inform timeout tuning, pagination needs  
**Effort**: Small (add benchmarking suite)  
**Dependencies**: Search provider system stable ✅  

### Search Result Caching
**What**: Lightweight in-memory caching for repeated queries within same session  
**Why**: meeting-prep and daily-plan run similar queries multiple times  
**Effort**: Small (cache layer in search.ts)  
**Dependencies**: Search provider system stable ✅  

### QMD Status Awareness
**What**: Check `qmd status` in addition to `which qmd`, suggest `qmd update` when needed  
**Why**: Surface QMD health (index outdated, embedding issues)  
**Effort**: Tiny (enhance isAvailable() in qmd.ts)  
**Dependencies**: None  

### Notion Integration
**What**: Read-only sync of Notion pages into workspace  
**Why**: PMs keep context in Notion  
**Effort**: Large (8-10 tasks: OAuth, page sync, mapping to Areté structure, permissions)  
**Dependencies**: Research Notion API  

### Linear/Jira Integration
**What**: Pull project/issue data for delivery-phase context  
**Why**: Link active projects to tracking system, surface blockers in daily-plan  
**Effort**: Large (8-10 tasks per system)  
**Dependencies**: Integration framework stable ✅  

---

## Recently Completed

- ✅ **Intelligence & Calendar Integration** (2026-02-09) - SearchProvider abstraction, CalendarProvider, ical-buddy integration
- ✅ **Execute PRD Skill** (2026-02-09) - Orchestration system with pre-mortem

---

## Moving Items from Scratchpad

**Process**:
1. Quick idea → capture in `now/scratchpad.md`
2. Idea matures → create file in `backlog/` with details
3. Ready to build → convert to PRD in `prds/`
4. Execute → use execute-prd skill

**Scratchpad should contain**: Quick capture, active work, parking lot  
**Backlog should contain**: Mature ideas with enough detail to become PRDs
