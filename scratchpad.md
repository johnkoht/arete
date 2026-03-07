# Scratchpad

Quick capture for build ideas, questions, and TODOs. Review periodically; move mature items to `dev/work/plans/` or turn into PRDs.

---

## Ideas & Raw Captures

<!-- Quick ideas — date them so you know when they came up -->

### [2026-03-05] `profile.md` as silent hard dependency for CommitmentsService
Discovered during smoke test: if `context/profile.md` doesn't exist, `ownerSlug` is undefined in `entity.ts`, and `parseActionItemsFromMeeting` is silently skipped — meaning `arete commitments list` always returns empty with no warning. The entire CommitmentsService producer path is gated on this file. Fresh workspaces that skip profile setup will have broken commitments silently.

**Fix candidates:**
- Prompt for profile during `arete install` / `arete setup` (name, role, email)
- Add a guard in `arete people memory refresh` that warns when profile.md is missing
- Add `arete status` check for missing profile.md

Small plan. Add to `dev/work/plans/` when ready to scope.

---

### [2026-02-12] User voice / writing style from uploads
User said: "I'd like the user to be able to upload emails, PRDs, documents, etc. to help define and shape their voice for the agent." Explore: let users upload sample artifacts so the agent can learn and mirror their tone, structure, and style. Could be a "voice" context folder, a briefing step that injects style cues, or an onboarding flow. Needs product exploration.

### [2026-02-12] Meeting agendas shouldn't be so robust
Simplify prepare-meeting-agenda output; avoid over-engineered or overly detailed agendas.

### Skills discovery on no-match
When the router returns no match, Areté could run `npx skills find <query>` and suggest installable skills from skills.sh. Explore: integrate into the "no match" path or add a "suggest skills" step in GUIDE mode.
