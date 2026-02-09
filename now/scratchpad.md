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

<!-- Quick capture space for parking lot items -->
