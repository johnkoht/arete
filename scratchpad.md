# Scratchpad

Quick capture for build ideas, questions, and TODOs. Review periodically; move mature items to `dev/work/plans/` or turn into PRDs.

---

## Ideas & Raw Captures

<!-- Quick ideas — date them so you know when they came up -->

### [2026-04-23] Cross-meeting reconciliation should populate `staged_item_matched_text`

Surfaced while validating the `fewer-llm-calls-open-task-dedup` plan on `2026-04-22-john-lindsay-11.md`. The Jaccard paths (completed-task, open-task) set `stagedItemMatchedText[id]` so the web UI can show a tooltip like "Matched: 'xxx' from week.md". The cross-meeting reconciliation path in `packages/cli/src/commands/meeting.ts:914-921` (and the mirror in `packages/apps/backend/src/services/agent.ts` around the reconciliation merge block) only sets `stagedItemStatus` + `stagedItemSource`. So `reconciled`-sourced items from cross-meeting dedup show the "already done" badge with no explanation of *which* prior meeting they matched.

Fix: when `reconciledItem.status === 'duplicate'` or `'completed'`, also populate `stagedItemMatchedText[matchingItem.id]` with the canonical source meeting's text (truncated to 60 chars, same convention as completed-items path). Small change; pure observability win.

### [2026-04-23] Semantic task dedup (follow-on to fewer-llm-calls-open-task-dedup)

Rule-based Jaccard (0.7 + min-4-tokens) catches near-paraphrases but misses synonym-level semantic duplicates. Observed on 2026-04-22-john-lindsay-11: extracted `ai_002` "Create testing spreadsheet for LEAP templates and assign to LEAP manager for team testing" should dedup against `week.md:76` `- [ ] Update LEAP testing assignment sheet + confirm Elyse's tester list` — same underlying work, different verbs + nouns, Jaccard ≈ 0.17.

Two candidate implementations:
- **Embedding similarity** — cheap per-call (ms scale), cosine distance on candidate pairs. Needs an embedding endpoint (OpenAI/Anthropic/Voyage/local). Most PM-tooling solutions land here.
- **LLM-judge pass** — one batched `reconciliation`-tier call over unflagged action items. Natural extension of `batchLLMReview`. More accurate but costs one Sonnet call per extraction run.

Blocked on `fewer-llm-calls-open-task-dedup` landing (needs shared `ItemSource` type + post-filter seam). Natural fit inside `computed-topic-memory` if that plan activates first. Probably also the right mechanism for slack-digest dedup cases that aren't near-paraphrases.

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

### [2026-03-19] Brief feature needs better summaries
Currently `arete brief --for "topic"` returns relevance-ranked file pointers, but summaries are often just filenames or titles (e.g., "Project doc: account-rollout-analysis.md"). The agent still has to read files to understand them.

**Issues identified:**
- `extractSummary()` pulls first paragraph, but many files have minimal/unhelpful openings
- Project docs often show as just "Project doc: filename.md"
- Meetings show date/source metadata instead of what was discussed
- People files show role/company but not relationship context

**Improvement candidates:**
1. **Smarter extraction** — Pull first substantive paragraph (skip metadata, headers, HTML comments) + key bullet points
2. **Structured frontmatter** — Add optional `summary:` field that gets prioritized
3. **Pre-computed summaries** — Generate AI summaries at index time (cost vs. quality tradeoff)
4. **Entity-aware formatting** — Format people/meetings/projects differently with relevant fields
5. **Configurable depth** — `--brief` (pointers only) vs `--detailed` (include content snippets)

The value of good summaries: agent can answer simple questions without file reads, faster context assembly.

---

### [2026-03-19] Meeting Intelligence Improvements

Inspired by reviewing [skills.sh/meeting-minutes](https://skills.sh/github/awesome-copilot/meeting-minutes). That skill has a strict 12-section schema with acceptance criteria on action items, parking lot, risks/blockers, etc. We have better intelligence (memory integration, people entities, commitments) but their output quality for shareable notes is stronger.

**Three distinct improvements identified:**

#### 1. Better Overview/Summary
Current summary is 2-4 sentences, basic. Could be more structured:
```markdown
## Summary
**Outcome**: Aligned on Q2 API priorities; unblocked JWT auth decision.
**Key Topics**: API versioning (decided), JWT auth (decided), Pricing model (parked)
**Open Questions**: How does this affect mobile SDK timeline?
```
Scope: process-meetings extraction enhancement.

#### 2. Shareable Export (`arete meeting share`)
Pain point: processed meetings aren't easily shareable (Slack, email). 

Proposal: **New CLI command + UI action** (post-processing, not automatic)
- CLI: `arete meeting share <file>` or `arete meeting export <file> --format slack|email|markdown`
- UI: "Share" button in `arete view` on processed meetings

Output format — clean, portable:
```markdown
# Glance Email Sync — Mar 19, 2026
## Summary
Aligned on Q2 API priorities. Decided JWT for v2 auth.
## Decisions
| Decision | Approved By | Effective |
| Use JWT for v2 | Sarah, Mike | Q2 launch |
## Action Items
| Action | Owner | Due | Done When |
| Draft JWT RFC | @mike | Mar 22 | RFC reviewed by security |
## Parking Lot
- Pricing model → needs finance input
---
*Generated from [Meeting](link) via Areté*
```

#### 3. Recurring Meeting Continuity
Connect meetings in a series so meeting prep can pull parking lot, open items, etc.

**A. Meeting → Goal Linkage** (optional frontmatter)
```yaml
goal: q2-api-launch  # links to goals/q2-api-launch.md
```
- Set manually, inferred during processing, or via meeting-prep when creating agenda from goal
- Goals = stable anchor (Q1 roadmap), Projects = bounded work packages
- Default to goals for recurring syncs

**B. Parking Lot Extraction** (new staged section type)
```markdown
## Staged Parking Lot
- pk_001: Pricing model (needs finance input)
- pk_002: Mobile SDK timeline (discuss next sync)
```
On approval: if meeting has `goal:` → append to goal's open-questions. Else → stays in meeting file for next in series.

**C. Meeting Series** (inferred, not explicit)
Don't create "series" entity — use title similarity:
- `arete search "Glance Email Sync" --scope meetings --days 30`
- Pull parking lot + open action items from most recent match
- Include goal context if linked

**Meeting prep flow with continuity:**
```
User: "Prepare an agenda for Glance Email Sync"
Agent:
1. Search recent meetings with similar title
2. Extract parking lot + open action items
3. Include goal context if linked
4. Generate agenda with carryover items
```

**Implementation order (suggested):**
1. Parking lot extraction (unlocks #3) — Medium
2. Meeting → Goal linkage — Low  
3. `arete meeting share` CLI + UI — Medium (immediate pain point)
4. Meeting prep pulls prior meetings — Medium
5. Better summary extraction — Low (polish)

These are related but separate plans. Start with share command (user pain point) or parking lot (architectural foundation).

---

### [2026-03-19] Commitments Review Skill/UI

Review and organize commitments with agent assistance.

**Two-part experience:**

**A. Agent-Assisted Cleanup**
Agent reviews open commitments and recommends a few to drop:
- Likely completed (context suggests resolved)
- Stale (no activity, old creation date)
- Superseded (later commitment covers same thing)

Agent surfaces recommendations with reasoning; user approves/rejects each.

**B. Quick Priority Organize**
Let user quickly organize remaining commitments:
- Priority tiers (this week / soon / someday)
- Bulk actions (mark done, snooze, drop)
- Filter by person, project, or age

Could be CLI (`arete commitments review`) or UI tab in `arete view`.

---

### [2026-03-19] Meeting Review Skill

Pick a few meetings from the past week and have an agent review + provide feedback.

**Use cases:**
- Self-coaching: Did I run good meetings? What could improve?
- Pattern recognition: What themes/decisions are repeating?
- Meeting hygiene: Are outcomes clear? Action items actionable?

**Possible outputs:**
- Per-meeting feedback (structure, outcomes, what was effective/missing)
- Cross-meeting synthesis (themes, recurring topics, relationship health signals)
- Suggestions for follow-ups or prep improvements

Could tie into week-review skill or be standalone.
