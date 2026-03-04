# What's New in Areté

Lightweight release notes for product builders using Areté. Most recent updates first.

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

**Notion integration.** You can now pull pages from Notion into your workspace as searchable markdown. Run `arete integration configure notion` once, then `arete pull notion` to sync. Pages land in your context and are indexed automatically — so `arete context --for "product strategy"` will find your Notion docs alongside your meeting notes and project files.

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

**Intelligence layer.** The core intelligence services — context gathering, briefing assembly, entity resolution, memory search — all stabilized during this period. These are the foundation that makes `arete brief`, `arete context`, and `arete memory search` work. Skills use them automatically.

**Plan mode.** The `/plan` system in pi (plan lifecycle, pre-mortem, PRD flow) was built and refined through this period. If you're using Areté for your own product development, this is the system that manages plans from idea → building → complete.

**Workspace installation.** `arete install` and `arete update` got significantly more reliable — correct file placement, proper tool copying, and consistent behavior across fresh installs and updates.
