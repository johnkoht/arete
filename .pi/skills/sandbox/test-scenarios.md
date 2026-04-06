# Test Scenarios by Domain

> Reference catalog for the `/sandbox` skill — Phase 4 maps changed files to domains, then pulls commands and quality checks from here.
>
> All commands assume:
> ```bash
> ARETE_BIN=~/code/arete.worktrees/sandbox/packages/cli/bin/arete.js
> cd ~/code/arete-reserv-test
> ```

---

## Meeting Extraction

**Triggered by**: `packages/core/src/services/meeting-*.ts`, `packages/core/src/integrations/*/meetings.ts`

### Commands
```bash
node $ARETE_BIN meeting extract --latest
node $ARETE_BIN meeting extract --file resources/meetings/{slug}.md
node $ARETE_BIN meeting list
```

### What to Observe

**Item count**
- 1:1 (30–60 min): expect 2–6 action items, 1–3 decisions, 0–2 learnings
- Team meeting (60 min): expect 3–8 action items, 2–5 decisions
- Large group / standup: expect 0–3 items total
- Flag: > 10 action items from a single meeting is almost always noise

**Duplicates**
- Same commitment under different phrasing (e.g., "follow up on X" and "send update on X")
- Same decision appearing in both decisions and learnings sections
- Jaccard similarity > 0.7 between any two action items = likely duplicate

**Owner attribution** (`i_owe_them` vs `they_owe_me`)
- "I'll send..." / "I need to..." → `i_owe_them` (you owe them the action)
- "They'll send..." / "[Person] will..." → `they_owe_me` (they owe you)
- Misattribution is a common failure mode — check 3–5 items manually

**Confidence distribution**
- Expected range: 0.5–0.95 across items
- All items at 1.0 = LLM isn't calibrating
- All items at 0.5–0.6 = extraction prompt may be confused by this meeting type

**Relevance**
- Items should relate to concrete next steps or commitments
- Flag: procedural filler ("we discussed X"), social niceties, meeting logistics extracted as action items
- Flag: items with no clear owner

---

## Intelligence / Briefing

**Triggered by**: `packages/core/src/services/intelligence*.ts`, any path containing `briefing`, `brief`

### Commands
```bash
node $ARETE_BIN brief --for "name of an upcoming meeting or person"
node $ARETE_BIN context --for "topic relevant to recent work"
```

### What to Observe
- Briefing completes without error and includes all expected sections (background, open items, talking points)
- Open commitments from recent meetings appear
- Person context (role, relationship, recent signals) is populated for 1:1 briefs
- No empty sections when data should exist
- Latency: brief should complete within 30s for normal complexity

---

## Search / Context Retrieval

**Triggered by**: `packages/core/src/search/`, `packages/core/src/services/context*.ts`

### Commands
```bash
node $ARETE_BIN context --for "a topic you know has context in this workspace"
node $ARETE_BIN memory search "a term you know appears in notes or decisions"
```

### What to Observe
- Results returned (not empty) when data exists
- Top results are relevant to the query
- No duplicate results in the same response
- `memory search` returns items from `.arete/memory/` only (not general context)
- `context --for` searches broadly: meetings, projects, people, conversations

---

## CLI Commands

**Triggered by**: `packages/cli/src/commands/{name}.ts`

Map each changed command file to its invocations:

| Command file | Test invocations |
|---|---|
| `meeting.ts` | `meeting list`, `meeting extract --latest`, `meeting extract --help` |
| `context.ts` | `context --for "test query"`, `context --help` |
| `brief.ts` | `brief --for "test"`, `brief --help` |
| `pull.ts` | `pull --help` (run `pull` only if you want live integration data) |
| `status.ts` | `status` |
| `memory.ts` | `memory search "test"`, `memory timeline "test"` |
| `people.ts` | `people list`, `people show {slug}` |
| `availability.ts` | `availability find --with {name}` |

### What to Observe
- `--help` renders without crash
- Flags are accepted and parsed correctly
- Error messages are clear when wrong args provided
- JSON output (`--json`) is valid and parseable: `node $ARETE_BIN {cmd} --json | python3 -m json.tool`

---

## GWS Integration

**Triggered by**: `packages/core/src/integrations/gws/`

### Commands
```bash
node $ARETE_BIN status                                  # check GWS shows as configured
node $ARETE_BIN context --for "person who emails you"  # GWS email signals in context
node $ARETE_BIN brief --for "meeting with GWS contact" # email signals in briefing
```

### What to Observe
- `status` shows GWS integration as active (not "not configured")
- Email summaries appear in `context --for` output for people you email regularly
- Drive docs referenced in meetings surface in context when relevant
- No auth errors (OAuth token still valid)

---

## Krisp Integration

**Triggered by**: `packages/core/src/integrations/krisp/`

### Commands
```bash
node $ARETE_BIN status                    # check Krisp shows as configured
node $ARETE_BIN pull                      # pull latest (will fetch from Krisp API)
node $ARETE_BIN meeting list              # verify pulled meetings appear
node $ARETE_BIN meeting extract --latest  # extract a Krisp-sourced meeting
```

### What to Observe
- Pull completes without auth errors
- Meetings appear in `meeting list` with correct dates
- Transcripts are present in pulled meetings (not empty)
- Extraction on a Krisp meeting produces reasonable output

---

## Fathom Integration

**Triggered by**: `packages/core/src/integrations/fathom/`

### Commands
```bash
node $ARETE_BIN status
node $ARETE_BIN pull --integration fathom
node $ARETE_BIN meeting list
```

### What to Observe
- Same as Krisp — auth, pull, meeting list, extraction quality

---

## Calendar Integration

**Triggered by**: `packages/core/src/integrations/calendar/`, `packages/core/src/integrations/google-calendar/`

### Commands
```bash
node $ARETE_BIN status                               # calendar shows as configured
node $ARETE_BIN brief --for "your next meeting"      # calendar events appear in briefing
node $ARETE_BIN availability find --with {name}      # free/busy lookup works
```

### What to Observe
- Calendar integration shows active in `status`
- Upcoming events appear in briefing context
- Availability check returns a result (not an auth error)
- Meeting importance inference is correct (1:1 → important, large group → light)
