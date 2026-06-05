# Phase 9 — Brief Primitive: typed modes + wiki integration

**Status**: planning — v3 (post pre-mortem 2026-06-03)
**Revision history**:
- v1 (2026-06-03): initial plan
- v2 (2026-06-03): addressed eng-lead review concerns C1-C4 + MC1-MC6
- v3 (2026-06-03): incorporated pre-mortem F1-F4 + M1-M4 mitigations

**Authored**: 2026-06-03
**Parent**: arete-v2-chef-orchestrator
**Prior art**: `synthesizeBriefing` (deleted in `6328a846`, Phase 8 followup-2); `assembleBriefing` (still in `intelligence.ts`); old `arete brief --for <task>` CLI (still exists, free-text mode only)

---

## v2 → v3 pre-mortem mapping

Failure modes from pre-mortem (`pre-mortem.md`) addressed in this revision:

| ID | Title | Resolution |
|----|-------|------------|
| F1 | Hallucinated stances populate 124 person files | AC8a v3: stance-specific cost estimator + pre-refresh snapshot + post-refresh quality sample gate + tier-retry fallback path |
| F2 | Cost preview underestimates 5-10x | AC8a step 1 v3: per-person × per-meeting estimator, calibrate `COST_PER_STANCE_CALL` empirically, $10 ceiling requiring interactive confirm |
| F3 | Agent ignores brief, fills template anyway | AC10 v3 sharpened "themed" definition. AC10b: unsupervised second-run. SKILL.md refit v3: anti-pattern-fill prose + brief-headers-are-not-agenda-headers callout + concrete synthesis pattern |
| F4 | No observability that agent calls the new verb | AC10c: brief CLI emits invocation telemetry to `dev/diary/brief-invocations.log`. SKILL.md prose v3 strengthens "always invoke" gate. Build step 14b verifies log writes. |
| M1 | Slug-vs-title precedence picks wrong occurrence | AC4 v3: inputs not matching `^\d{4}-\d{2}-\d{2}-` regex skip slug-match entirely |
| M2 | 2K cap truncates Lindsay's highlights | Design Principle 6 v3: mini-brief composition order is highlights → recent → commitments → metadata (truncation drops tail, never highlights). Per-attendee override available. |
| M3 | AC8a contaminates Phase 8 soak signals | Build step 14a steps (iii) + (v): pre/post timing measurement of daily-winddown; report delta. |
| M4 | `--project` typo → silent empty section | AC4a v3: error with Levenshtein closest-match suggestion + exit 1 |

---

## v1 → v2 review mapping

Concerns from eng-lead review (`review.md`) addressed in this revision:

| ID | Title | Resolution |
|----|-------|------------|
| C1 | `TopicMemoryService.findTopics()` doesn't exist | §"Wiki integration" rewritten — `retrieveRelevant()` primary, `listAll() + tokenizeSlug()` fallback. Per-mode gather plans + AC5 updated. |
| C2 | `--meeting` project composition leans on 42%-accurate inference | `--meeting` mode adds optional `--project <slug>` override. Deterministic ladder: `--project` flag → explicit frontmatter `area:` → inference (best-effort). New ACs: AC4a, AC4b. |
| C3 | Memory Highlights empty (callLLM not wired) | New build step 12a wires callLLM into `arete people memory refresh`. New AC8a covers wiring + one-shot refresh against arete-reserv before AC10. AC1a covers graceful degradation when stances absent. |
| C4 | Mutual exclusion requires demoting `--for` | AC8 expanded with explicit zero-mode + two-mode error contracts. Build step 12 calls out the `requiredOption` → `option` demotion. |
| MC1 | Per-section caps unbounded | Design Principle 6 v2 adds per-section caps (2K/4K/3K/2K/2K/1K) + section-level + global truncation markers. AC11 updated. |
| MC2 | Unknown-attendee handling unspecified | AC4c added — surfaces as one-line stub, not silently dropped. |
| MC3 | qmd-noise SKILL prose is hopeful | SKILL.md update uses `--skip-qmd` flag (already exists at `people.ts:495`) instead of "ignore this output" prose. |
| MC4 | qmd-freshness fallback for cross-meeting overlap | `--meeting` step 5 documents SearchProvider → direct-scan fallback. Reuses `entity.ts:1281-1291` pattern. |
| MC5 | `--for` divergence creates dual aggregator paths | Added to Non-goals as accepted v1 divergence. |
| MC6 | O(attendees × meetings) scan | Architecture v2 calls out single-pass meetings-dir read with bucket-by-attendee. Adapts `entity.ts:1259-1262` cache pattern. |
| Q2 | `--meeting` precedence implicit | Pinned in AC4 input-handling block (slug → agenda → calendar → unresolved). |
| Q5 | "title only" semantics implicit | Sharpened in AC4d. |
| Q6 | Cap of 7 may crowd retrieveRelevant() top-3 | Build report must verify empirically; knock to 5 if quality fails. |

---

## Background

**Regression observed (2026-06-03)**: meeting agendas produced by `prepare-meeting-agenda` collapsed to bare template skeletons compared to late April (see `resources/meetings/2026-04-29-john-lindsay-11.md` — agenda merged at lines 88-158 with cross-source synthesis: prior-conversation references, commitment hashes, tracked recruitment status, phased project structure).

**Root cause**: Phase 4 (skills→CLI demotion) + Phase 7b (LLM block stripping from `search --answer`, `memory refresh`, area-memory) + Phase 8 followup-2 (`synthesizeBriefing` removal) collectively stripped LLM-synthesis primitives the agent relied on. The aggregator (`assembleBriefing`) survived but only as `--for <free-text>`; there are no typed modes for the common surfaces (person, project, area, meeting). Without rich structured context handed to it explicitly, the agent stops at "fill the template."

**v2-aligned fix**: restore the aggregator surface — but as **typed modes, pure-aggregator, no LLM inside the verb.** LLM synthesis happens in the agent's chat context (not in the CLI), using the structured output as input. This is what v2 was supposed to deliver; Phase 8 followup-2 over-shot by dropping the aggregator's user-facing surface.

---

## Goal

Ship `arete brief` extended with four typed modes — `--person`, `--project`, `--area`, `--meeting` — each producing structured markdown that pulls from meetings, commitments, area/topic wiki, person memory, and project files. Then refit `prepare-meeting-agenda` SKILL.md to call `arete brief --meeting "<title>"` as its primary gather step.

**Quality bar**: an agenda the agent produces from `arete brief --meeting "John / Lindsay 1:1"` output should approximate the April 29 agenda's richness (themed sections, cross-source references, commitment IDs cited, prior-conversation callbacks).

---

## How it works (plain language)

### What `brief` is for

`brief` is "give me everything that matters about X." It's a primitive that you call when you want a one-page dump of structured context about a person, project, area, or upcoming meeting. The agent then uses it to write the actual deliverable (an agenda, a status update, a 1:1 talking-points list — whatever you asked for).

### What changes

Today, `arete brief --for "<some question>"` exists but only takes free text — it does a semantic search and dumps whatever it finds. After this phase, you also get four typed modes that know exactly what to pull for each kind of thing:

- **`arete brief --person lindsay-gray`** — Your manager Lindsay's brief: who she is, her last N meetings with you, all open action items between you two (both directions), what areas/projects you share, her stances/asks/concerns from prior meetings, and the relevant topic-wiki pages.

- **`arete brief --project glance-2-mvp`** — The Glance 2 MVP brief: the project README, recent meetings tagged to this area, all open commitments scoped to the project, decisions and learnings recorded for the area, blockers, and topic-wiki pages that overlap (e.g. "POP migration," "story mapping").

- **`arete brief --area claims-modernization`** — Broader than project: every meeting and topic touching this area, the area's curated memory page, all commitments, all decisions/learnings. Use this when you're thinking about a domain, not a single deliverable.

- **`arete brief --meeting "John / Lindsay 1:1"`** — A composite: it picks up the calendar event (or already-saved agenda), pulls a `--person` brief for each attendee, pulls a `--project` brief if the meeting is tagged to one, and adds the most recent N meetings with the same attendees. This is what `prepare-meeting-agenda` will call.

### What's inside each brief

A typed brief always returns the same structured sections, in stable order, so the agent can rely on them being there:

1. **Subject** — what this brief is about (the person/project/area/meeting name + key facts).
2. **Recent activity** — last N meetings + their key extracts (decisions, action items) — newest first.
3. **Open work** — every open commitment relevant to the subject (with hash IDs the agent can cite).
4. **Decisions & learnings** — the items already curated into `.arete/memory/items/` that touch the subject.
5. **Wiki pages** — relevant topic pages from `.arete/memory/topics/` (the wiki) by alias match.
6. **People** — attendees / stakeholders / shared collaborators, depending on mode.
7. **Sources** — every file path the brief read from, so the agent can deep-dive if needed.

Each section is a markdown subsection with bullets + file paths. Empty sections are dropped (don't show "no decisions").

### Why this fixes the agenda regression

Today the agenda agent has to manually figure out: "OK, who are the attendees? Let me look up their files. Now let me find recent meetings — which directory? OK, now commitments — by what filter? Project context — does this meeting map to one?" Each step is brittle, the agent often skips or shortcuts.

After this phase, the agent runs ONE command (`arete brief --meeting "..."`) and gets a structured markdown dump with everything load-bearing already gathered. The agent's job is reduced to: read this brief, distill into themed agenda sections. That's the part LLMs are actually good at. The "find the relevant data" part — which they're bad at and which Claude consistently truncates — is handled by deterministic code.

### What's explicitly NOT happening

- **No LLM call inside `brief`.** The verb is pure file-system aggregation + structured-search retrieval. If you want a synthesized narrative, the agent does that in its own chat context after reading the brief output. This is the v2 contract.
- **No data invention.** Everything in the brief output has a file path next to it. Agent can verify.
- **No format negotiation.** Output is one markdown shape per mode. `--json` flag returns the same data as a structured object.

---

## Non-goals

- **Re-introducing `synthesizeBriefing`**: NO. v2's "no LLM hidden in CLI" principle stands. Agent does synthesis in its own context using the brief output as input.
- **Replacing free-text `--for`**: keep it. It's still useful for ad-hoc "what do we know about X" queries. Just add typed modes alongside.
- **Touching `IntelligenceService.routeToSkill`**: out of scope. Phase 7b removed the LLM branches; the keyword-routing remainder is fine.
- **Reviving `arete memory refresh` LLM synthesis or `search --answer`**: out of scope. Those served different purposes.
- **New commitments / decisions / learnings extraction**: pure read-only verb. No writes.
- **Replacing the existing `--for <free-text>` aggregator**: kept as-is for backward compat. Accepted v1 divergence: two aggregator paths (`assembleBriefing` for free-text, `assembleBriefFor*` for typed modes) coexist. Converge later only if we find ourselves maintaining the same fix in two places. (MC5)

---

## Design principles

1. **Pure aggregator.** No `aiService.call()` inside the verb code path. Only structured search + filesystem reads.
2. **Typed modes are first-class.** Each mode has a dedicated assembler with a deterministic gather plan. No fuzzy fallback to free-text search inside a typed mode.
3. **Wiki is part of every mode.** Topic pages (`.arete/memory/topics/`) are the highest-density signal source and must be queried by alias matching, not skipped.
4. **Stable markdown shape per mode.** Sections in a fixed order so downstream agents can read them reliably. Empty sections drop entirely (no "N/A" placeholders).
5. **Provenance everywhere.** Every fact has a source path next to it. Agent should never have to guess where a claim came from.
6. **Token-budget aware.** Total output capped at ~12K chars (matches the old `BRIEF_MAX_CONTEXT_CHARS`). **Per-section caps (v2, MC1)**: 2K per attendee mini-brief (`--meeting`), 4K for project context block, 3K for recent activity, 2K for commitments, 2K for wiki pages, 1K for area memory excerpt. When an individual section exceeds its cap, truncate-by-recency within that section and append a section-level marker (`[truncated: 3 commitments not shown]`). When global 12K is hit, truncate trailing sections wholesale with a `[truncated: section X dropped]` marker. Never silently drop.
   - **Mini-brief composition order (v3 — M2)**: per-attendee mini-brief sections ordered **highlights → recent meetings → commitments → metadata**. Truncation drops the tail (metadata/recent), never the load-bearing signal (stances/asks/concerns). Lindsay specifically: her 8.3KB person file + 15 meetings/90d will hit the 2K cap; with this ordering, her standing prompts survive. Build step prints her mini-brief size; if > 2K, raise her cap to 3K via per-attendee override (still under 12K total).
7. **`--json` parity.** Every markdown section has a structured equivalent in JSON output.

---

## Modes

### `arete brief --person <slug>`

**Gather plan:**
1. Read `people/**/<slug>.md` — frontmatter + body
2. List meetings where person appears in `attendee_ids` (frontmatter) OR `attendees` (legacy string list), ordered by date desc, limit 10
3. Pull commitments where person matches `from` or `to` direction, status=open
4. Read `## Memory Highlights (Auto)` from person file (asks/concerns/stances) — surfaced as-is
5. Resolve shared areas (intersect person's recent meeting areas)
6. Resolve shared projects (any active project whose area matches step 5)
7. Wiki match: `TopicMemoryService.retrieveRelevant(query, { limit: 7 })` with `query` = person name + key aliases from person body (fallback to `listAll() + tokenizeSlug()` when `searchBackend === 'none'`)

**Output sections** (markdown order):
- `# Brief: <Person Name>` + role/team metadata
- `## Recent meetings (N)` — title, date, link, 1-line excerpt of any approved decisions
- `## Open commitments (N)` — with hash IDs + direction arrows
- `## Memory highlights` — verbatim from person file (asks/concerns/stances)
- `## Shared areas & projects` — bulleted with links
- `## Related wiki pages (N)` — topic pages by alias match, with 1-line summary
- `## Sources` — all file paths read

### `arete brief --project <slug>`

**Gather plan:**
1. Read `projects/active/<slug>/README.md` — frontmatter + body
2. Resolve the project's `area` from frontmatter
3. List meetings where `area` matches, ordered by date desc, limit 10
4. Pull open commitments where commitment's `area` matches project area
5. Pull decisions + learnings from `.arete/memory/items/` filtered by area tag
6. Read area memory page (`.arete/memory/areas/<area>.md`) if exists
7. Wiki match: `TopicMemoryService.retrieveRelevant(query, { limit: 7 })` with `query` = project name + project's area tag (fallback to `listAll() + tokenizeSlug()` when `searchBackend === 'none'`)

**Output sections:**
- `# Brief: <Project Name>` + status/started/area metadata
- `## Project context` — excerpt from README's Background + Status Updates (latest 1-2)
- `## Recent activity` — meetings touching this project's area
- `## Open work` — commitments with hash IDs, grouped by direction
- `## Decisions & learnings` — area-tagged items from `.arete/memory/items/`
- `## Related wiki pages` — topic pages
- `## Sources`

### `arete brief --area <slug>`

**Gather plan:**
1. Read `.arete/memory/areas/<slug>.md` — area memory page
2. List meetings tagged with this area
3. Pull commitments tagged with this area
4. Pull decisions + learnings tagged with this area
5. List active projects in this area (project READMEs with matching `area` field)
6. Wiki match: `TopicMemoryService.retrieveRelevant(query, { limit: 7 })` with `query` = area name + area aliases (fallback to `listAll() + tokenizeSlug()` when `searchBackend === 'none'`)

**Output sections:**
- `# Brief: Area — <Area Name>`
- `## Area memory` — area page content (curated)
- `## Active projects in this area`
- `## Recent meetings`
- `## Open commitments`
- `## Decisions & learnings`
- `## Related wiki pages`
- `## Sources`

### `arete brief --meeting <slug-or-title> [--project <slug>]`

**Input handling (precedence — pinned per Q2):**
1. If input matches an existing meeting file slug → use that directly (deterministic)
2. If input matches a saved agenda file → use that
3. Otherwise treat as calendar event title; pull `arete pull calendar --today --json` (or `--days 7`) and find matching event; use its attendees + area-tag-inference
4. If none resolve → degrade gracefully (Q5 path — see below)

**`--project <slug>` override (v2, C2)**: optional flag pinning the project context. Use case: recurring 1:1s where the meeting frontmatter doesn't have an `area:` field but the caller knows which project it belongs to. When `--project` is passed, **skip area inference entirely** and use the named project for the "Meeting area & projects" section.

**Gather plan:**
1. Resolve attendees (calendar OR meeting file frontmatter). For each attendee, attempt person-file lookup by name → slug.
2. For each resolved attendee → call internal person-brief assembler (subset: recent 5 meetings, open commitments with this user, memory highlights).
3. For each UNRESOLVED attendee (calendar email with no person file) → emit a one-line stub: `Attendee: jane@acme.com — no person file (consider \`arete people add\`)`. Do NOT silently drop. (MC2)
4. Project context resolution (C2 — deterministic ladder):
   - If `--project <slug>` passed → use it. Skip steps 4b-4c.
   - Else if meeting frontmatter has explicit `area:` field → use that area; project = active project with matching area (max 2).
   - Else call `AreaParserService.suggestAreaForMeeting()` (best-effort — ~42% accuracy per Phase 8 followup-8). When inference triggers, surface confidence in the markdown so the agent can decide whether to lean on it. If no match → skip the project section entirely (do NOT silently attach wrong project).
5. Cross-meeting overlap (MC4 — qmd freshness fallback): try `SearchProvider.semanticSearch()` for attendees as a group; if SearchProvider returns 0 results OR fewer than the limit (incomplete index), **fall back to direct scan** of `resources/meetings/*.md` filtered by attendee_ids/attendees frontmatter overlap. Reuse the pattern in `EntityService.refreshPersonMemory` lines 1281-1291. Limit = 3 group-overlap meetings.
6. Wiki match: `TopicMemoryService.retrieveRelevant(query, { limit: 7 })` with `query` = meeting title (stripped of date prefix) + attendee names joined (fallback to `listAll() + tokenizeSlug()` when `searchBackend === 'none'`)

**Q5 path (`--meeting` resolution failure)**: when steps 1-3 of input handling all fail, return a "best-effort with title only" brief: title metadata + warning + wiki-match attempt against the title string + empty attendee/project sections explicitly marked `(unresolved — no calendar match, no saved file)`. Do NOT silently produce an empty brief.

**Output sections:**
- `# Brief: <Meeting Title>` + date/duration/attendees
- `## Attendees` — per attendee: 1-line role + recent meetings count + open commitments count + 2-3 standout memory highlights
- `## Meeting area & projects` — if matched, project status excerpt + open work for that project
- `## Recent meetings with this group` — last 3 meetings with overlapping attendees, key extracts
- `## Open commitments touching this group` — commitments any of these attendees are involved in
- `## Related wiki pages`
- `## Sources`

### Existing `arete brief --for <free-text>` (UNCHANGED)

Keep working as today (free-text semantic search aggregation). No behavior changes. Just documented as "ad-hoc mode" in updated `--help`.

---

## Wiki integration (how topic pages join)

The wiki = `.arete/memory/topics/<slug>.md`. The `TopicMemoryService` actual surface (corrected v2 — `findTopics()` does NOT exist):
- **`retrieveRelevant(query, opts)`** — semantic search via injected `SearchProvider` (qmd or fallback). Returns top-k topic pages with `bodyForContext` pre-truncated to a word budget, with recency-bonus and area-match-bonus rerank already built in. Returns `searchBackend: 'none'` when no provider is wired.
- **`listAll(paths)`** — returns all topic pages plus errors. Caller must filter by `frontmatter.aliases` / `frontmatter.area` / token-match against `topic_slug` (via the exported `tokenizeSlug()`).

**Decision (C1, v2)**: use `retrieveRelevant()` as **primary**; fall back to `listAll() + alias-jaccard` ONLY when `searchBackend === 'none'`.

**Rationale**:
- `retrieveRelevant()` already does the recency-bonus + area-match reranking the brief wants
- `limit` option maps directly to the cap-at-N contract
- `bodyForContext` truncation prevents per-topic over-budget
- Alias-jaccard via `listAll()` is the right fallback because deterministic-and-free beats no-wiki when SearchProvider is unavailable
- Tradeoff accepted: when qmd index is stale, semantic recall may miss topics with newer content. Mitigation: fallback isn't gated on staleness (no fresh-index detector), it's gated on availability — users with qmd configured pay the staleness risk for the recall win.

Per mode integration (v2 — uses `retrieveRelevant()`, falls back to `listAll() + tokenizeSlug()` when no SearchProvider):
- **`--person`**: query = person's display name + any name aliases from person frontmatter. Limit = 7.
- **`--project`**: query = project name + project's area tag. Limit = 7.
- **`--area`**: query = area name + any area aliases. Limit = 7.
- **`--meeting`**: query = meeting title (stripped of date prefix) + attendee names joined. Limit = 7.

Each match contributes a 1-line summary (use `bodyForContext` first non-frontmatter heading + first sentence) to the brief's `## Related wiki pages` section. Empty section dropped per AC.

**Q6 note (v2)**: cap of 7 may crowd `retrieveRelevant()`'s natural top-3 default. Build report must verify empirically — if quality fails (wiki section drowns higher-priority sections), knock to 5 and revisit.

This is the load-bearing change. The April 29 agenda's richness came from the agent weaving topic-page signal into themed sections. Today's regression includes "agent doesn't find the topic pages." Explicit wiki retrieval per mode closes that gap.

---

## Architecture

### Service layer (`packages/core/src/services/intelligence.ts`)

Add four new methods on `IntelligenceService` (keeping `assembleBriefing()` untouched):

```ts
async assembleBriefForPerson(slug: string, paths: WorkspacePaths): Promise<PersonBrief>
async assembleBriefForProject(slug: string, paths: WorkspacePaths): Promise<ProjectBrief>
async assembleBriefForArea(slug: string, paths: WorkspacePaths): Promise<AreaBrief>
async assembleBriefForMeeting(input: string, paths: WorkspacePaths): Promise<MeetingBrief>
```

Each returns a typed object: `{ subject, sections: BriefSection[], sources: string[], truncated: boolean, markdown: string }`.

Internally, each composes:
- `EntityService` (people/orgs resolution)
- `CommitmentsService` (open commitments by area/person)
- `TopicMemoryService` (wiki page lookup — `retrieveRelevant()` primary, `listAll()` fallback)
- `AreaMemoryService` (area pages)
- `AreaParserService` (area inference for --meeting when no explicit area + no `--project` override)
- `storage.read()` for direct file reads
- `searchProvider.semanticSearch()` only for cross-meeting overlap discovery in `--meeting` mode (with direct-scan fallback)

**No `AIService` injection. No `callLLM` parameter.** Verify this in code review.

**Performance note (MC6)**: `--meeting` and `--person` mode share a "list meetings filtered by attendee" inner loop. For `--meeting`, this runs once per attendee → naively O(attendees × meetings). For a 5-person leadership sync against the user's ~600-meeting workspace, that's 3000 file-frontmatter parses per brief. Optimization: read the meetings dir ONCE per assembler invocation and bucket-by-attendee in a single pass; persist the bucketed map for the duration of the brief assembly. Adapt the pattern from `EntityService.refreshPersonMemory`'s meeting cache (entity.ts:1259-1262).

### Markdown formatters

One formatter per mode in a new file `packages/core/src/services/brief-formatters.ts`:
```ts
export function formatPersonBriefMarkdown(brief: PersonBrief): string
export function formatProjectBriefMarkdown(brief: ProjectBrief): string
export function formatAreaBriefMarkdown(brief: AreaBrief): string
export function formatMeetingBriefMarkdown(brief: MeetingBrief): string
```

These produce the stable markdown shape (sections in fixed order, empty sections dropped, sources appended).

### CLI (`packages/cli/src/commands/intelligence.ts`)

Extend the existing `registerBriefCommand`:
- Add `--person <slug>`, `--project <slug>`, `--area <slug>`, `--meeting <slug-or-title>` options
- Validate mutually exclusive — only one of {--for, --person, --project, --area, --meeting}
- Route to the appropriate `assembleBriefFor*` method
- Format markdown to stdout (or structured JSON to stdout if `--json`)

Keep `--raw` no-op flag for backward compat (already there).

**Invocation telemetry (v3 — F4 mitigation, AC10c)**: every typed-mode invocation appends one line to `dev/diary/brief-invocations.log` (relative to workspace root). Format: `<ISO-8601 timestamp> <mode> <input>\n`. Example: `2026-06-04T09:32:11Z --meeting "John / Lindsay 1:1"`. Write is best-effort (failure does not block the command). Used in soak observability to detect SKILL.md prose drift (agent skipping the verb).

### Types (`packages/core/src/models/intelligence.ts`)

Add types: `PersonBrief`, `ProjectBrief`, `AreaBrief`, `MeetingBrief`, `BriefSection`. Each is a discriminated union over `mode`. Export from `models/index.ts`.

---

## prepare-meeting-agenda integration

After the brief verb ships, update `packages/runtime/skills/prepare-meeting-agenda/SKILL.md`:

**Step 4 (Gather Context) becomes (v3 — F3 + F4 hardening)**:

```
### 4. Gather Context (REQUIRED — verb invocation is the gate)

**Always invoke** `arete brief --meeting "<exact meeting title>"` as your first action. The brief verb is the single source of truth for context aggregation. Do NOT shortcut by reading person files directly with the Read tool — that path produces the regressed thin-template output and is what Phase 9 was built to replace.

Only fall back to per-attendee briefs (`arete brief --person <slug>` for each attendee) when `arete brief --meeting` returns the `(unresolved — no calendar match, no saved file)` AC4d path.

If you want richer person memory before composing, run `arete people memory refresh --person <slug> --if-stale-days 3 --skip-qmd` to refresh stale stances. The `--skip-qmd` flag prevents the auto-index output from being surfaced to the user as a status prompt.

**Critical: brief section names are NOT agenda section names.** The brief returns sections like `## Open commitments touching this group`, `## Related wiki pages`, `## Attendees`. These are organizational headers in the *input*, not headers for the *output*. **Synthesize themed agenda sections** named by topic (e.g., "Glance 2.0 Roadmap — Start the Conversation", "Discovery Process Update", "30/60/90 Surface", "Carries"). Each themed section should weave together signal from multiple brief sections.

**Concrete synthesis pattern**:
- Read the brief output top-to-bottom.
- Identify 3-6 themes the meeting needs to cover. Themes come from cross-source signal: an open commitment + a related decision + a wiki callback = one themed section.
- For each theme, draft a section with: short framing prose, 2-4 specific bullets citing commitment IDs/meeting dates/wiki pages, an "ask" or "decision needed" framing line where appropriate.
- Do not pattern-fill the template's generic sections (Priorities / Feedback / Next Steps) without synthesizing first. Those sections belong AT THE END after the themed sections.

Example agenda quality bar: `resources/meetings/2026-04-29-john-lindsay-11.md` lines 88-158. Themed sections ("Glance 2.0 Roadmap — Start the Conversation (20min)", "Discovery Process Update (10min)"), specific commitment IDs ("commitment 45ef9b64"), prior-conversation callbacks ("Per our 4/22 conversation, past misfires came from leadership defining the experience before adjuster-driven research"). That's the target shape.
```

**SKILL.md prose enforcement note**: the "always invoke" gate above is prose, not code-enforced. To detect SKILL.md drift (F4), the brief CLI emits one log line per invocation to `dev/diary/brief-invocations.log` (see AC10c). Daily soak check verifies the agent is actually calling the verb. Zero invocations on a day with a prepared agenda = the prose was ignored.

**qmd noise (MC3, v2 — flag not prose)**: when `prepare-meeting-agenda` SKILL.md invokes `arete people memory refresh --person <slug>` as part of its gather step (skill step 4 pre-brief), it MUST pass `--skip-qmd`. The `--skip-qmd` flag already exists (`people.ts:495`) and bypasses the auto-refresh + its stdout. SKILL.md update wording: "use `arete people memory refresh --person <slug> --if-stale-days 3 --skip-qmd` to refresh person memory; qmd indexing runs separately."

(Why a flag over prose: agents see stdout noise and sometimes interpret `[qmd: indexed N files]` as a status prompt to surface. Suppressing at the source is more robust than asking the agent to ignore it.)

---

## Acceptance criteria

**AC1 (`--person`)** — Returns markdown with: Subject metadata, Recent meetings (≥ 1 if any exist), Open commitments (both directions), Memory highlights (verbatim from person file), Shared areas+projects, Related wiki pages, Sources. Empty sections dropped. Cap output at ~12K chars.

**AC1a (`--person` Memory Highlights degradation, v2 — C3)** — When the target person file's `## Memory Highlights (Auto)` has empty Stances/Asks/Concerns sections, the brief's `## Memory highlights` section MUST: (a) surface the non-empty Action Items + Relationship Health subsections, (b) drop the empty subsections cleanly with NO "None detected yet" placeholders bleeding into the brief, (c) NOT fall back to action items inline as a fake-stance replacement. Verified via fixture test with a synthetic person file containing only Relationship Health.

**AC2 (`--project`)** — Returns markdown with: Project metadata + README excerpt, Recent activity (meetings touching area), Open work (commitments with hash IDs), Decisions & learnings, Related wiki pages, Sources.

**AC3 (`--area`)** — Returns markdown with: Area memory page content, Active projects, Recent meetings, Open commitments, Decisions & learnings, Related wiki pages, Sources.

**AC4 (`--meeting`)** — Accepts both slug and free-text title. Returns markdown with: Meeting metadata, Per-attendee mini-briefs, Meeting area & projects (if matched per the deterministic ladder), Recent meetings with this group, Open commitments touching this group, Related wiki pages, Sources.

**Input precedence (v3 — M1 sharpened)**: Inputs matching `^\d{4}-\d{2}-\d{2}-` regex (slug-shaped) are tried as slug match first → agenda match → calendar match. Inputs NOT matching that regex (free-text titles) skip the slug-match path entirely and go directly to calendar + agenda match. Rationale: prevents free-text "John / Lindsay 1:1" from accidentally matching a 6-month-old meeting file slug (arete-reserv has 10 such files verified). Verified via fixture test.

**AC4a (`--meeting --project` override, v2 — C2 + v3 — M4)** — When `--project <slug>` is passed alongside `--meeting`, the project section uses the named project unconditionally. `suggestAreaForMeeting()` is NOT called. Verified via test: passing a meeting with no `area:` frontmatter + `--project glance-2-mvp` produces a project section identical to what `arete brief --project glance-2-mvp` would emit.

**Unknown-project-slug handling (v3 — M4)**: If `--project <slug>` does not resolve to an active project file under `projects/active/<slug>/README.md`, error with `project '<slug>' not found; did you mean: <closest-match-via-levenshtein>?` and exit 1. Do NOT silently produce an empty project section. The closest-match suggestion uses simple Levenshtein against `projects/active/*/` slug list.

**AC4b (`--meeting` deterministic path, v2 — C2)** — When the meeting file has an explicit `area:` field in frontmatter, the brief composes the project section deterministically (no inference). Verified via test independent of `suggestAreaForMeeting` quality.

**AC4c (`--meeting` unknown-attendee handling, v2 — MC2)** — Attendees that resolve to a calendar email with no matching person file are surfaced as a one-line stub (`Attendee: <email> — no person file`) in the Attendees section. NOT silently dropped. NOT errored.

**AC4d (`--meeting` resolution failure, v2 — Q5 sharpened)** — When the input matches no meeting file slug, no agenda file, and no calendar event, the brief returns a "title-only" brief: title metadata block + warning + wiki-match against the title string + explicit `(unresolved — no calendar match, no saved file)` placeholder text in attendee/project sections. NOT silent empty. NOT exit 1.

**AC5 (wiki integration, v2 — C1)** — Every mode invokes `TopicMemoryService.retrieveRelevant(query, { limit: 7 })` with the documented per-mode query (see §"Wiki integration"). When `searchBackend === 'none'`, falls back to `listAll() + tokenizeSlug()` alias-jaccard. Verified via two fixture tests per mode: one with SearchProvider configured (exercises retrieveRelevant path), one without (exercises listAll fallback).

**AC6 (`--json`)** — All modes support `--json` flag; output is a structured object with `mode`, `subject`, `sections`, `sources`, `truncated`. Matches markdown's data content. NO `markdown` string field in JSON (Q4).

**AC7 (no LLM in verb)** — Grep confirms no `aiService.call`, `callLLM`, or `AIService` import in the new code paths. Dedicated test (`brief-no-llm.test.ts`) instantiates `IntelligenceService` with no AIService and exercises every new `assembleBriefFor*` method — must not throw.

**AC8 (mutual exclusion + zero-mode, v2 — C4)** — `arete brief` CLI requires exactly ONE of `{--for, --person, --project, --area, --meeting}`. Implementation requires demoting the existing `--for` from `.requiredOption(...)` to `.option(...)` in `packages/cli/src/commands/intelligence.ts:826` and adding mode-count validation. Error contract:
- Zero modes passed → exit 1 with message `exactly one of --for/--person/--project/--area/--meeting required`
- Two or more modes passed → exit 1 with message `exactly one of --for/--person/--project/--area/--meeting required (got: --X, --Y)`

Unit test asserts both paths (zero-mode + two-mode) including exit code and message substring.

**AC8a (Memory Highlights backfill, v3 — C3 + F1 + F2)** — As a Phase-9 build step (NOT a separate phase), wire `callLLM` into `arete people memory refresh`'s `refreshPersonMemory` call site (`packages/cli/src/commands/people.ts:519-525`). Pattern reference: `packages/cli/src/commands/meeting.ts:838` (`services.ai.callLLM('extraction', prompt)`). After wiring, run a one-shot refresh against the workspace before AC10 evaluation.

**Required gates (v3 — pre-mortem F1 + F2):**

1. **Stance-specific cost estimator** (F2 mitigation): topic.ts:415 pattern provides cost-preview *gating*, but its formula models per-topic-page (wrong unit). Stance extraction is **per-person × per-meeting-they-appear-in** (entity.ts:1354-1372). Build a dedicated estimator:
   ```
   count = Σ over people: count(meetings person appears in, last 90d)
   estimatedCost = count × COST_PER_STANCE_CALL
   ```
   Calibrate `COST_PER_STANCE_CALL` empirically by running 3 extractions and dividing actual spend by 3 (build step 12a). Borrow `seedMaxUsd` ceiling pattern from `topic.ts:963` — if estimated cost > $10, require interactive confirmation (not just `--yes`).

2. **Pre-refresh snapshot** (F1 rollback artifact): Before the one-shot refresh writes anything, snapshot every `<!-- AUTO_PERSON_MEMORY:START --> ... :END -->` block across all person files to `dev/work/plans/arete-v2-chef-orchestrator/phase-9-brief-primitive-restore/pre-refresh-memory-blocks.json`. This is the per-data-write rollback path the v2 plan lacked. Include a `restore-memory-blocks.sh` script that reads the JSON and writes blocks back.

3. **Post-refresh stance-quality sample gate** (F1 detection): After the one-shot refresh, sample 10 person files with newly-populated stances and present them inline in the build report. User confirms quality before AC10 evaluates. Specifically scan for:
   - Stances attributed to person X that originated from person Y's quoted speech in the source meeting (hallucination signal)
   - Stances that don't appear in the source meeting body at all (fabrication signal)
   - Stances that contradict the source meeting tone (extraction inversion)

   If sample turns up ≥1 hallucinated stance per 10 sampled, ABORT, restore from snapshot, retry stance extraction at `'standard'` tier and re-evaluate cost. Default tier is `'extraction'` per meeting.ts:838 pattern, but stance inference is harder than action-item extraction — tier choice is reviewable.

4. **Phase 8 soak entropy measurement** (M3 mitigation): Before the AC8a refresh, time a daily-winddown run; after the refresh, time another. Record delta in build report. If delta > 30s, surface so soak signals aren't misattributed.

**AC9 (prepare-meeting-agenda refit)** — `SKILL.md` step 4 updated to call `arete brief --meeting "<title>"` with fallback to `--person <slug>` per attendee. Example output quality bar referenced (April 29 file). Includes `--skip-qmd` flag on any `arete people memory refresh` invocations within the skill (MC3).

**AC10 (quality verification — manual, v3 — F3 sharpened)** — User generates a fresh agenda via `/prepare-meeting-agenda` for an upcoming 1:1, with brief verb + callLLM-wired refresh in place. Resulting agenda has:
- ≥ 3 themed sections, where "themed" = section header is NOT a verbatim template header AND NOT a verbatim brief section header. The header was synthesized from cross-source content (e.g., "Glance 2.0 Roadmap — Start the Conversation" — neither template nor brief gave that name).
- ≥ 2 cross-source references (prior meeting OR commitment ID OR topic page).
- ≥ 2 specific items per section.

Compared side-by-side with the April 29 agenda for quality match. Build report MUST include both agendas inline for review.

**AC10b (unsupervised second-run, v3 — F3)** — Run AC10 twice during build verification:
- **Supervised** (build-day, user watching): the build-agent invokes `/prepare-meeting-agenda` with full attention.
- **Unsupervised** (≥6 hours later, fresh session, no priming context): repeat the same meeting input, agent has no awareness it's being evaluated.

Compare both. If quality regresses unsupervised → F3 has materialized (agent ignores brief, fills template). Fix SKILL.md prompt structure before merge — likely strengthening the explicit anti-pattern-fill prose and clarifying that brief section names are NOT agenda section names.

**AC10c (soak observability emissions, v3 — F4)** — Brief CLI emits one line per typed-mode invocation to `dev/diary/brief-invocations.log`. Format: `<ISO timestamp> <mode> <input>`. Daily soak check `wc -l dev/diary/brief-invocations.log` + tail to verify the agent is actually invoking the verb (not shortcut-reading files like pre-Phase-9). Zero invocations on a day with a prepared agenda = F4 materialized = SKILL.md prose was ignored.

**AC11 (truncation markers — section + global, v2 — MC1)** — When a per-section cap is hit, that section ends with a section-level marker (e.g. `[truncated: 3 commitments not shown — older items dropped first]`). When the global 12K cap is hit, trailing sections drop wholesale with a global marker (`[truncated: 2 sections dropped — wiki, sources]`). Never silently drop. Both behaviors verified via fixture tests sized to trigger each path.

---

## Build steps (one commit per step)

Each step builds and tests in isolation. `tsx --test` per file as it changes (NEVER `npm test` at root).

1. **Plan** — this file. Commit.
2. **Review (gate)** — eng-lead review of plan + ACs. Address feedback. Plan v2 if needed.
3. **Pre-mortem** — explicit "what could go wrong" doc with mitigations.
4. **Pre-mortem review (gate)**.
5. **Types** — `models/intelligence.ts` types for `PersonBrief`/`ProjectBrief`/`AreaBrief`/`MeetingBrief`/`BriefSection`. Re-export in `models/index.ts`. Build + test.
6. **`assembleBriefForPerson`** — service method + unit test against fixture workspace.
7. **`assembleBriefForProject`** — same.
8. **`assembleBriefForArea`** — same.
9. **`assembleBriefForMeeting`** — compose person + project briefs; cross-meeting overlap via SearchProvider.
10. **Markdown formatters** — `brief-formatters.ts` + unit tests for stable shape.
11. **Wiki integration audit** — verify every mode invokes `TopicMemoryService.retrieveRelevant()` (with `listAll()` fallback when `searchBackend === 'none'`). Two fixture tests per mode (retrieveRelevant path + fallback path).
12. **CLI extension** — add typed mode options + `--meeting --project` override to `registerBriefCommand`. Demote `--for` from `requiredOption` to `option`. Mode-count validation (zero-mode + two-mode error paths per AC8). `--json` parity (structured-only, no markdown field per Q4).
12a. **people memory refresh callLLM wiring (C3 — AC8a)** — In `packages/cli/src/commands/people.ts:519-525`, add `callLLM` wrapper (`services.ai.callLLM('extraction', prompt)` pattern from `meeting.ts:838`). Add cost-preview gating before workspace-wide refresh (pattern from `topic.ts:415`). Add `--no-llm` opt-out flag. Per-person test exists; add CLI integration test confirming stances populate when callLLM wired.
13. **Build review (gate)** — eng-lead code review.
14. **prepare-meeting-agenda SKILL.md refit** — step 4 rewrite (call `arete brief --meeting`), per-attendee `arete brief --person` fallback, `arete people memory refresh --skip-qmd` for qmd-noise suppression (MC3), April 29 quality bar reference.
14a. **Workspace memory refresh (one-shot) — v3 gated** — Pre-refresh sequence:
   - **(i) Cost preview**: invoke the stance-specific cost estimator (per AC8a step 1) for a dry-run estimate. Surface in build report. If > $10, require interactive user confirmation (not just `--yes`).
   - **(ii) Pre-refresh snapshot**: write `pre-refresh-memory-blocks.json` snapshot of all AUTO_PERSON_MEMORY blocks. Write `restore-memory-blocks.sh` companion script.
   - **(iii) Phase 8 timing baseline**: time a daily-winddown run BEFORE the refresh. Record.
   - **(iv) Run the refresh**: `arete people memory refresh --if-stale-days 0` against arete-reserv.
   - **(v) Phase 8 timing post-measure**: time a daily-winddown run AFTER the refresh. Record delta. If > 30s, flag in build report so Phase 8 AC11 signals can be correctly attributed.
   - **(vi) Stance-quality sample gate** (per AC8a step 3): sample 10 person files; build agent presents inline in build report. User confirms quality before AC10.
14b. **Soak observability shim** — Verify `dev/diary/brief-invocations.log` is being written by running one CLI invocation of each typed mode and confirming the log file appears with the expected line count. This is the soak-time signal for F4.
15. **Manual verification (gate)** — user runs `/prepare-meeting-agenda` for a real meeting; AC10 evaluated. Build report includes both the April 29 agenda and the new agenda inline for side-by-side comparison.
16. **Build report** — commits, AC status, residuals, lessons learned.
17. **Diary entry** — phase 9 status + decisions log.
18. **Merge** — into parent branch only after manual verification passes.

---

## Tests

**Unit (`packages/core/test/services/`):**
- `brief-person.test.ts` — fixture: people/lindsay-gray.md + 3 fake meetings + 2 commitments + 1 topic alias. Assert all 7 sections present + sources cited + cap respected. ALSO assert AC1a (empty-stances degradation): synthetic person file with empty Stances/Asks/Concerns produces a brief that drops those subsections cleanly, surfaces Relationship Health + Action Items only, no "None detected yet" bleed.
- `brief-project.test.ts` — fixture: projects/active/glance-2-mvp/README.md + area + commitments. Assert structure.
- `brief-area.test.ts` — fixture: area memory + projects + meetings. Assert structure.
- `brief-meeting.test.ts` — fixture: 2 attendees + 1 area + 1 project. Assert composition correctness (each attendee gets a mini-brief; project section appears when area matches). PLUS new tests:
  - AC4a: passing `--project glance-2-mvp` to a meeting with no `area:` frontmatter produces project section identical to standalone `--project` brief
  - AC4b: meeting with explicit `area:` produces project section independently of `suggestAreaForMeeting`
  - AC4c: unknown-attendee surfaced as stub, not silently dropped
  - AC4d: unresolved `--meeting <random-string>` returns title-only brief with `(unresolved)` placeholders
- `brief-wiki-fallback.test.ts` — wiki integration AC5 paths: one fixture exercises `retrieveRelevant()` (SearchProvider configured), one fixture exercises `listAll() + tokenizeSlug()` fallback (no SearchProvider). Both assert wiki section appears with expected matches.
- `brief-formatters.test.ts` — empty section drop, per-section truncation marker (AC11), global truncation marker (AC11), markdown stability (snapshot).
- `brief-no-llm.test.ts` — invariant test: import `IntelligenceService`, instantiate without `AIService`, call each `assembleBriefFor*` method — must NOT throw. Grep guard for `aiService.call` / `callLLM` / `AIService` import in service file.

**Integration (`packages/cli/test/`):**
- `brief-cli.test.ts` — exec `arete brief --person <slug>` against fixture workspace; assert markdown structure + `--json` parity (structured-only). Mutual exclusion (AC8): assert exit codes + message substrings for both zero-mode and two-mode error paths.
- `people-callllm.test.ts` (AC8a) — assert `arete people memory refresh --person <slug>` populates `## Memory Highlights (Auto)` Stances/Asks/Concerns sections when callLLM wired. Negative test: `--no-llm` flag skips LLM and surfaces only signal-based sections.

**Manual:**
- `arete brief --meeting "John / Lindsay 1:1"` in arete-reserv → review markdown output
- `arete brief --meeting "..." --project glance-2-mvp` → verify `--project` override path
- One-shot `arete people memory refresh --if-stale-days 0` post-AC8a wiring → verify Stances populate for ≥ 5 sampled person files
- Run `/prepare-meeting-agenda` for upcoming 1:1 → compare against April 29 quality bar (AC10)

---

## Decisions (locked 2026-06-03)

- **Q1 — option shape**: separate options (`--person`, `--project`, `--area`, `--meeting`). Cleaner `--help`, autocompletes better.
- **Q2 — `--meeting` input**: accept both slug and free-text title. **Precedence (v2)**: try slug match first (deterministic), then saved-agenda match, then calendar event title. Pinned in AC4 input-handling block. Title for ad-hoc, slug for scripted use.
- **Q3 — per-mode limits**: ship with fixed defaults (10 meetings per `--person` / `--project`, 3 group-overlap meetings for `--meeting`). Expose `--limit` only if friction surfaces.
- **Q4 — `--json` shape**: structured-only. No markdown string field in JSON output. Agent consumes JSON for data, markdown for narrative.
- **Q5 — `--meeting` resolution failure**: degrade to "title-only brief" — title metadata block + warning + wiki-match against the title string + `(unresolved — no calendar match, no saved file)` placeholder text in attendee/project sections. Do NOT silently produce empty brief. Do NOT exit 1. Pinned in AC4d.
- **Q6 — wiki retrieval cap**: default N=7 per mode (bumped from initial proposal of 5). No tunable flag in v1. **v2 caveat (per reviewer push-back)**: cap of 7 may crowd `retrieveRelevant()`'s natural top-3. Build report MUST verify empirically — if wiki section drowns higher-priority sections, knock to 5 and revisit.

## Queued followups (post-core)

- **`--summarize` flag** — opt-in LLM synthesis on top of pure aggregation. Restores standalone CLI usability (terminal users wanting digestible prose) without hiding LLM cost in standard usage. Ship ONLY IF standalone use proves frictionful — agent-context synthesis covers the agenda regression on its own. Explicit user invocation honors the v2 "no LLM hidden in CLI" principle.

---

## Rollback plan

If quality bar fails (AC10) or regressions surface:
- The brief CLI extension is additive — `--for` keeps working. Revert the SKILL.md change to drop `arete brief --meeting` and fall back to manual gather steps.
- Service methods are additive — no existing methods modified.
- Types are additive — no breaking changes.

Single-commit revert of SKILL.md change unblocks immediate fallback while keeping the brief verb available for ad-hoc use.

---

## Soak observability + rollback (v3 — pre-mortem section)

**14-day Phase 9 soak signals to track daily:**

1. **Brief invocation count** — `wc -l dev/diary/brief-invocations.log` + spot-check modes. Trigger: zero invocations on a day with a prepared agenda = F4 materialized.
2. **Agenda quality sample** — One fresh agenda per 2 days; grep for themed-section count, commitment-hash citations, wiki-page references. Trigger: ≤1 themed section AND ≤0 commitment hashes for 2 consecutive agendas = quality regression (F3 or F1).
3. **Person-file diff drift** — `git diff people/internal/*.md` on day-3 / day-7 / day-14. Look for stance-block churn that isn't from a deliberate refresh. Trigger: unexpected stance churn = hallucinated stances re-extracting on staleness (F1 secondary).
4. **`--meeting` resolution log** — Brief CLI logs when it falls through to AC4d. Trigger: > 30% of `--meeting` invocations land on AC4d = calendar fetch broken or precedence ladder wrong (M1).
5. **Phase 8 winddown wall-time** — Compare pre-Phase-9 baseline (last 3 days of Phase 8 soak before merge) vs post-Phase-9 (first 3 days). If delta > 60s, attribute to AC8a impact (M3).

**Rollback triggers (priority order):**

- **F1 materializes** (≥ 2 hallucinated-stance reports from John during soak): revert AC8a wiring (callLLM unhooked), restore person files via `restore-memory-blocks.sh`, keep brief verb available.
- **F3 materializes** (5+ consecutive thin agendas): revert SKILL.md change (single-commit), keep brief verb available for ad-hoc use, queue followup phase to rethink agent-prompt structure.
- **AC11 (Phase 8) exceeds 45min hard-stop**: measure carefully before attributing to Phase 9 (per M3).
- **All other signals**: log + queue for post-soak retro; don't preemptively revert.

**Soak-success criteria (declare Phase 9 done at +14d):**

- ≥ 5 agendas produced via the new flow at-or-above April 29 quality bar (judged manually).
- Zero hallucinated-stance complaints from John.
- ≥ 80% of `--meeting` invocations resolve to a valid meeting (not AC4d).
- No Phase 8 AC11 false trips attributable to Phase 9.

---

## References

- `resources/meetings/2026-04-29-john-lindsay-11.md` lines 88-158 — quality bar exemplar
- `packages/core/src/services/intelligence.ts:467` (pre-deletion) — `synthesizeBriefing` shape for inspiration only (we are NOT restoring this)
- `packages/core/src/services/intelligence.ts:assembleBriefing` — existing free-text aggregator (do not modify, used by `--for`)
- `packages/cli/src/commands/intelligence.ts:registerBriefCommand` — CLI entry point being extended
- `packages/core/src/services/topic-memory.ts` — wiki access layer
- `packages/core/src/services/commitments.ts` — commitments by area + person
- `packages/core/src/services/area-parser.ts:suggestAreaForMeeting` — area inference for `--meeting` mode
- Phase 8 followup-2 commit `6328a846` — what we are partially undoing (only the user-facing surface, NOT the LLM synthesis path)
