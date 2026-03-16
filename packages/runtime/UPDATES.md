# What's New in Areté

Lightweight release notes for product builders using Areté. Most recent updates first.

---

## Week of March 16, 2026

**CLI and UI meeting workflows are now fully interchangeable.** You can process meetings from either the CLI or web dashboard and switch seamlessly between them:

- **`arete meeting extract --stage`** now writes the same metadata as the web UI — confidence scores, auto-approval status, and owner attribution all appear in the meeting file
- **`arete meeting approve`** lets you commit reviewed items to memory from the CLI — works just like clicking "Approve" in the web dashboard
- **Reprocessing support** — Use `--clear-approved` flag to clear previous approvals and reprocess a meeting fresh

This is especially useful if you use an agent skill (like daily-winddown) to bulk-process meetings. Items approved via CLI now show up correctly in the web dashboard, and vice versa.

**Example workflow:**
```bash
# Extract intelligence and stage for review
arete meeting extract resources/meetings/2026-03-15-standup.md --stage

# Approve specific items (or --all for everything)
arete meeting approve 2026-03-15-standup --items ai_001,de_002 --skip le_001

# Later, reprocess with fresh extraction
arete meeting extract resources/meetings/2026-03-15-standup.md --stage --clear-approved
```

---

## Week of March 9, 2026

**Smarter meeting intelligence with less noise.** Meeting extraction now produces fewer, higher-quality items:
- **Quality filters** — Vague intentions ("we should...") and trivial follow-ups ("schedule a meeting") are filtered out automatically
- **Confidence scoring** — Each extracted item has a confidence score; high-confidence items are pre-approved so you only review edge cases
- **"From your notes" detection** — If you already wrote something in your meeting notes, Areté recognizes it and auto-approves instead of asking you to approve a duplicate
- **Priority scoring for commitments** — Open commitments are now scored by staleness, relationship health, direction (what you owe vs. what they owe), and specificity. High-priority items surface first.
- **Commitment reconciliation** — Areté scans recent meetings for completion signals and suggests commitments that may already be done. One click to mark them resolved.

The goal: spend less time reviewing AI extractions and more time on the work that matters.

**Web dashboard polish.** Several UI improvements landed:
- **Category badges** — People and projects now show consistent category badges throughout the UI
- **Searchable dropdowns** — Long lists (like project pickers) now have search built in
- **Project linking in reviews** — When reviewing meeting items, you can now link them to projects directly
- **Person page improvements** — The Edit button is now in the page header for better discoverability

**Close-out checklist for your plans.** When you finish a plan and want to make sure all the documentation is up to date, run `/wrap` in plan mode. It checks:
- Memory entry exists for this plan
- MEMORY.md index is updated
- LEARNINGS.md files in changed directories
- Capability catalog freshness (if you added new commands)

Each item shows ✅ (done), ❌ (missing with what to do), or ⚠️ (suggested review). No more manually remembering what needs updating after a build.

---

## Week of March 8, 2026

Big week for visibility and AI configuration.

**Product Intelligence Dashboard is here.** Run `arete view` to open a full web dashboard in your browser. See your meetings, people, commitments, goals, and intelligence patterns all in one place. The dashboard includes:
- **Dashboard** — Today's meetings, commitment pulse, recent activity, signal patterns
- **Meeting Triage** — Review and process meetings with AI-assisted extraction
- **People Intelligence** — Sortable table with relationship health, stances, commitments
- **Goals Alignment** — Strategy → Quarter → Week → Commitments cascade
- **Commitments** — Full commitment management with mark-done and drop actions
- **Global Search** — Search across meetings, people, memory, and projects

The backend runs locally and the dashboard opens in your default browser. All your data stays on your machine.

**Morning intelligence brief.** Run `arete daily` each morning to see what's on your plate: today's calendar, overdue commitments, active projects, recent decisions, and cross-person signal patterns. It's a quick way to orient before diving into work.

**Momentum tracking.** `arete momentum` shows you commitment momentum (what's hot, stale, or critical) and relationship momentum (who you're actively meeting with vs. relationships that have gone quiet). Useful for weekly reviews and ensuring nothing slips through the cracks.

**AI configuration is simpler.** You can now configure AI providers without editing YAML files:
- `arete credentials login` — OAuth login for Claude, GitHub Copilot, or Google Gemini
- `arete credentials set <provider>` — Set an API key
- `arete credentials show` — See what's configured
- `arete config show ai` — View tier and task mappings
- `arete config set ai.tiers.fast <model>` — Customize which model handles which tasks

OAuth tokens refresh automatically, so once you're logged in, it just works.

---

## Wednesday, March 4, 2026

A lot of meeting intelligence improvements landed today.

**Meeting action items are now extracted from your meeting files directly — no separate command needed.** When you run the `process-meetings` skill, your agent reads the transcript and extracts action items inline. Previously this required a separate `arete meeting extract` command that needed an API key configured separately. It's simpler now and works the same way in every environment.

**Agendas are now linked to meetings automatically.** When you pull recordings from Fathom or Krisp, Areté now fuzzy-matches the recording to any agenda you prepared beforehand and links them together. When you process the meeting, your prepared agenda items are merged in alongside the extracted action items — so nothing from your prep gets lost. Recorder notes are also collapsed by default in the meeting file so the structured content is easier to read.

**`process-meetings` skill got smarter about action items.** The skill now parses action items from your meeting files in a consistent format, correctly identifying direction (what you owe them vs. what they owe you) with better heuristics. This feeds the commitments tracker more accurately.

---

## Week of March 3, 2026

Big week for relationship intelligence. A lot of the plumbing we've been building now surfaces in ways you can actually use day-to-day.

**Commitments tracking is here.** Areté now tracks what you owe people and what they owe you — extracted from your meeting notes automatically. Run `arete commitments list` to see open commitments across all your relationships, or `arete commitments list --person <name>` to focus on one person. If something's been resolved, `arete commitments resolve` marks it done. Your daily plans and meeting preps will now include a commitments section so you're never walking into a conversation having forgotten something.

**People intelligence got significantly smarter.** When you run meeting prep or look at a person's profile, you'll now see:
- **Stances** — what they've expressed opinions on (backed by actual quotes from meetings)
- **Action items** — what was committed to, in both directions, with sources
- **Relationship health** — a signal for when a relationship has gone quiet or needs attention

All of this is sourced from your meeting notes, so it improves as you pull more recordings.

---

## Week of February 24, 2026

A lot of calendar and integration work landed this week.

**Create calendar events from Areté.** You can now run `arete calendar create` to schedule events directly. The `schedule-meeting` skill also uses this — when you're prepping a meeting and need to actually book it, the skill can walk you through finding time and creating the event without leaving your workflow.

**Find mutual availability with anyone.** `arete availability find --with <name>` checks your calendar and theirs (if they're on your team and connected) and shows you open slots. Works with both macOS Calendar and Google Calendar.

**Google Calendar support.** If you prefer Google Calendar over the macOS Calendar app, run `arete integration configure google-calendar` to connect. Once configured, `arete pull calendar` works the same as before.

**Notion integration.** You can now pull pages from Notion into your workspace as searchable markdown. Run `arete integration configure notion` once, then `arete pull notion` to sync. Pages land in your context and are indexed automatically — so `arete search "product strategy"` will find your Notion docs alongside your meeting notes and project files.

**Project updates skill.** When you ask Areté to help you update a project or stakeholder doc, it now follows a consistent pattern: gather context first, then update. Less hallucination, more grounded updates from your actual meeting content.

---

## Week of February 19, 2026

**Krisp integration.** If you use Krisp for meeting recordings, you can now pull them directly into Areté. Run `arete integration configure krisp` (one-time OAuth flow in your browser), then `arete pull krisp` or `arete pull krisp --days 7` to pull recent meetings. Transcripts, summaries, and action items all flow into your workspace the same way Fathom recordings do.

**Conversation capture.** You can now save ad-hoc conversations (from Slack, email threads, or anywhere else) into your workspace so they're searchable and available for context. Useful for important async threads that don't have a formal meeting recording.

---

## Week of February 16, 2026

**Person memory.** Areté now auto-builds memory highlights for the people you work with. Run `arete people memory refresh` to scan your meeting history and generate a highlights section in each person's profile — recurring topics, concerns they've raised, how often you're meeting. Your meeting prep and agenda skills pull from this automatically, so you walk in with relevant context on each attendee.

The refresh is stale-aware: pass `--if-stale-days 3` and Areté skips anyone refreshed in the last 3 days. Skills use a 3-day default for meeting prep and a 7-day window for weekly planning.

**Meeting agenda skill.** When you say "prepare an agenda for my meeting with X," Areté now has a dedicated skill for this — separate from general meeting prep. It gathers attendee context, recent meeting history, open commitments, and any project context, then structures a focused agenda. Works best when you've pulled recent recordings.

**Calendar setup improvements.** Fixed a rough edge in the calendar configuration flow — it now uses the same checkbox-style selector as the rest of the setup experience. If you've been avoiding `arete integration configure calendar` because it felt clunky, it's much better now.

---

## Week of February 10, 2026

**Skills from the community.** You can now install skills from [skills.sh](https://skills.sh) and GitHub directly into your workspace with `arete skill install <url>`. Community skills now integrate with the intelligence layer — outputs get indexed and become searchable, same as native skills.

**Multi-IDE support.** Areté now works in both Cursor and Claude Code. Rules and tools install correctly regardless of which IDE you're using. If you've been using one and want to try the other, `arete update` handles the migration.

---

## Earlier (January–February 2026)

**Intelligence layer.** The core intelligence services — context gathering, briefing assembly, entity resolution, search — all stabilized during this period. These are the foundation that makes `arete brief`, `arete search`, and `arete route` work. Skills use them automatically.

**Plan mode.** The `/plan` system in pi (plan lifecycle, pre-mortem, PRD flow) was built and refined through this period. If you're using Areté for your own product development, this is the system that manages plans from idea → building → complete.

**Workspace installation.** `arete install` and `arete update` got significantly more reliable — correct file placement, proper tool copying, and consistent behavior across fresh installs and updates.
