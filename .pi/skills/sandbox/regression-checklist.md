# Regression Checklist

> Always run before targeted tests. Verifies core pipelines haven't regressed.
> All 5 must pass. If any fail, compare against production `arete` on the same command to isolate the regression.

## Setup

```bash
ARETE_BIN=~/code/arete.worktrees/sandbox/packages/cli/bin/arete.js
cd ~/code/arete-reserv-test
```

---

## 1. Workspace Health

```bash
node $ARETE_BIN status
```

**Expected**: Workspace found, integrations listed (Krisp, Fathom, GWS, Calendar — whichever are configured), no stack traces.

**Failure signals**:
- "Workspace not found" or "Not in an Areté workspace"
- Crash / unhandled exception
- Integrations section missing entirely

---

## 2. Context Retrieval

```bash
node $ARETE_BIN context --for "a topic you know has context"
```

Use a topic you know exists in this workspace (a project name, a person, a recurring meeting).

**Expected**: Returns a context document with populated sections. At minimum: relevant files listed, some content returned.

**Failure signals**:
- Empty output when data should exist
- "No context found" for a well-known topic
- Crash or timeout

---

## 3. Briefing Pipeline

```bash
node $ARETE_BIN brief --for "name of an upcoming meeting or key person"
```

**Expected**: Full briefing with at least: background section, open items or commitments, suggested talking points or agenda. Completes within ~30s.

**Failure signals**:
- Empty briefing with no content
- Missing sections (e.g., no open items when meetings with that person exist)
- LLM error or timeout
- Crash

---

## 4. Meeting Extraction Pipeline

```bash
node $ARETE_BIN meeting extract --latest
```

**Expected**: Extraction runs, staged sections written to meeting file, action items and/or decisions shown. Item count reasonable for meeting type.

**Failure signals**:
- "No meetings found" when meetings exist
- Zero items extracted from a meeting with clear action items in the transcript
- Crash or LLM error
- Staged sections not written to file

---

## 5. Memory Search

```bash
node $ARETE_BIN memory search "a term you know appears in your notes"
```

Use a term from a known decision, learning, or observation in `.arete/memory/`.

**Expected**: Returns at least one result with a snippet. Results are relevant to the query.

**Failure signals**:
- Empty results for a known term
- Crash or timeout
- Results from wrong data source (memory search should only hit `.arete/memory/items/`)

---

## Pass / Fail Protocol

**All 5 pass** → proceed to targeted tests.

**Any fail**:
1. Run the same command with production `arete` (globally installed) against the same workspace:
   ```bash
   cd ~/code/arete-reserv-test && arete {same command}
   ```
2. If production passes and worktree fails → **regression in this branch**, stop and investigate.
3. If both fail → issue is in the test workspace or workspace state, not a code regression. Re-sync and retry:
   ```bash
   bash ~/code/arete/scripts/sandbox-sync.sh
   ```
