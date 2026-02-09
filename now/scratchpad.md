# Scratchpad

> Quick capture, parking lot, working notes. Items here get moved to proper homes during reviews.

---

## Backlog

### Calendar Integration Improvements

- [ ] **Calendar onboarding UX**: Improve the first-run experience for calendar integration. Guide user through `brew install ical-buddy`, selecting calendars, verifying setup. Consider a `arete setup calendar` wizard that detects installed providers, lists available calendars, and writes config. Currently the user has to manually edit `arete.yaml` — should be more guided.

- [ ] **Google Calendar provider**: Implement `GoogleCalendarProvider` behind the `CalendarProvider` interface. Requires Google OAuth2 (consent screen, token storage/refresh in `.credentials/`, scope `calendar.events.readonly`). Enables cross-platform support and direct API access without macOS Calendar.app sync dependency.

- [ ] **Microsoft Calendar provider**: Implement `MicrosoftCalendarProvider` via Microsoft Graph API. OAuth2 flow similar to Google. Important for enterprise PMs using Outlook/Teams. Same `CalendarProvider` interface — swap in without changing CLI or skills.

### Future Integrations (Priority Order)

- [ ] **Notion integration**: Read-only sync of Notion pages into workspace. Useful for PMs who keep context in Notion. Pull meeting notes, project docs, or decision logs. Consider mapping Notion databases to Areté's structured workspace.

- [ ] **Linear/Jira integration**: Pull project/issue data for delivery-phase context. Link active projects to tracking system. Surface blockers and sprint status in daily-plan.

- [ ] **Slack integration**: Pull relevant channel messages, thread summaries. Push daily plan or meeting prep to DM. Lower priority than calendar/Notion since meeting transcripts cover most context.

---

## Notes

### Intelligence & Calendar PRD - Enhancements
*(From Feb 9 review of completed search infrastructure)*

- **Search performance benchmarking**: Token-based fallback and QMD provider both look solid, but consider adding performance metrics/benchmarking for large workspaces (1000+ files, 100MB+ content). Could inform timeout tuning or pagination needs.

- **Search result caching**: Consider lightweight in-memory caching for repeated queries within same session. Would help meeting-prep and daily-plan workflows that may run similar queries multiple times.

- **QMD status awareness**: Currently we check `which qmd` for availability. Could enhance to check `qmd status` to surface QMD health (index outdated, embedding issues) and suggest `qmd update` when needed.

### Orchestration System - This Week
*(From Feb 9 post-mortem of intelligence-and-calendar PRD)*

- **Update AGENTS.md with Orchestration Pattern** — Add section "11. Autonomous PRD Execution" after section 10 (Calendar System). Content: Overview of execute-prd skill, orchestrator + subagent pattern, when to use vs manual development, link to builder-orchestration-learnings.md. Should be ~50-100 lines documenting the pattern we just proved works.

- **Validate execute-prd skill on second PRD** — Test the orchestration system on a different feature PRD (smaller, 2-5 tasks) to validate the pattern holds. Look for: Does pre-mortem catch different risks? Do mitigations from last session apply? Does agent follow the workflow without drift? Document any refinements needed to the skill.

- **Finalize dev.mdc update** — Either use the dev.mdc.new file I created (mv command) or manually paste the pre-mortem section. Verify it appears in Cursor's rules when building Areté. Test that agents reference it when starting complex work.

### Orchestration System - This Month
*(Future improvements to the orchestration pattern)*

- **Implement prd-task subagent type** — Currently execute-prd uses generalPurpose subagent (works fine). Create dedicated prd-task type that knows to: run tests after implementation, commit with conventional commits format, update prd.json and progress.txt automatically. Would reduce prompt boilerplate and make execution more consistent. Requires: Adding prd-task to Task tool enum in Cursor, testing on sample PRD.

- **Add automated code review checks** — Before orchestrator does manual review, run automated pattern checks: .js import extensions (NodeNext), no any types (strict TS), error handling present (try/catch), test coverage (new code has tests). Output: "✅ Patterns OK" or "⚠️ Missing error handling in line 45". Could be a simple script that scans changed files. Saves orchestrator time, catches obvious issues early.

- **Create progress dashboard command** — Add `arete prd status` CLI command that shows: Task X/Y complete, Z tests passing, N commits, estimated time remaining (based on task velocity). Useful for long-running PRDs (10+ tasks) to track progress without reading prd.json manually. Could also show: which task is currently in progress, last commit time, any failures.

<!-- Quick capture space for parking lot items -->
