# Manual Test Cases: Monorepo + Intelligence Refactor

Post-refactor verification tests. Run these against a fresh workspace seeded with test data.

## Prerequisites

### Create and seed a test workspace

```bash
# 1. Install a new workspace
node packages/cli/bin/arete.js install ~/test-arete-workspace --ide cursor

# 2. Seed with test data (manual copy)
cp test-data/meetings/*.md ~/test-arete-workspace/resources/meetings/
mkdir -p ~/test-arete-workspace/people/internal ~/test-arete-workspace/people/customers
cp test-data/people/internal/*.md ~/test-arete-workspace/people/internal/
cp test-data/people/customers/*.md ~/test-arete-workspace/people/customers/
cp test-data/plans/quarter.md ~/test-arete-workspace/goals/quarter.md
mkdir -p ~/test-arete-workspace/now
cp test-data/plans/week.md ~/test-arete-workspace/now/week.md
mkdir -p ~/test-arete-workspace/projects/active
cp -r test-data/projects/onboarding-discovery/ ~/test-arete-workspace/projects/active/onboarding-discovery/
mkdir -p ~/test-arete-workspace/.arete/memory/items
cp test-data/memory/items/*.md ~/test-arete-workspace/.arete/memory/items/
cp test-data/context/goals-strategy.md ~/test-arete-workspace/goals/strategy.md
cp test-data/TEST-SCENARIOS.md ~/test-arete-workspace/

# 3. cd into the workspace for all subsequent tests
cd ~/test-arete-workspace
```

---

## Test 1: Workspace Installation

```bash
node packages/cli/bin/arete.js install ~/test-arete-workspace --ide cursor
```

**Expected**:
- Success message with skills and rules count
- Directory structure: `context/`, `goals/`, `projects/`, `people/`, `resources/`, `.arete/`, `.agents/skills/`, `.cursor/rules/`
- `arete.yaml` manifest exists
- Skills copied to `.agents/skills/`

**Verify**:
```bash
ls ~/test-arete-workspace/
ls ~/test-arete-workspace/.agents/skills/
cat ~/test-arete-workspace/arete.yaml | head -5
```

---

## Test 2: Status Check

```bash
cd ~/test-arete-workspace
arete status
arete status --json
```

**Expected**:
- Workspace recognized as valid
- Shows IDE target (cursor)
- Lists configured integrations
- JSON output includes `workspace`, `config`, `integrations` fields

---

## Test 3: Skill Routing

```bash
arete route "prep for my meeting with Jane Doe"
arete route "analyze the competitive landscape"
arete route "plan the week"
arete route "I need to understand user onboarding"
```

**Expected**:
- Each routes to appropriate skill (meeting-prep, competitive-analysis, planning, discovery)
- Shows skill name, reason for match, model tier suggestion
- Routing is fast (<1s)

---

## Test 4: Context Assembly

```bash
arete context --for "prep for meeting with Bob Buyer"
arete context --for "prep for meeting with Bob Buyer" --json
```

**Expected**:
- Context bundle with files from `context/`, `people/`, `projects/`
- Relevance scores per file
- Gap analysis (missing primitives)
- Confidence level (High/Medium/Low)
- Temporal signals (if memory items mention Bob)

---

## Test 5: Context Inventory (NEW)

```bash
arete context --inventory
arete context --inventory --json
arete context --inventory --stale-days 7
```

**Expected**:
- Freshness dashboard showing age of each context file
- Stale files flagged (default >30 days)
- Coverage gaps per ProductPrimitive (Problem, User, Solution, Market, Risk)
- `--stale-days 7` flags more files as stale

---

## Test 6: Memory Search

```bash
arete memory search "onboarding"
arete memory search "onboarding" --json
arete memory search "customer feedback"
```

**Expected**:
- Results from decisions.md and/or learnings.md
- Each result has: content excerpt, source file, type, date, relevance score
- Results ranked by relevance with recency boost

---

## Test 7: Memory Timeline (NEW)

```bash
arete memory timeline "onboarding"
arete memory timeline "onboarding" --json
arete memory timeline "onboarding" --days 30
```

**Expected**:
- Chronological view of entries mentioning "onboarding"
- Recurring themes extracted (common topics across entries)
- Date range shown
- `--days 30` limits to last 30 days
- Includes both memory items and meeting transcripts

---

## Test 8: Entity Resolution

```bash
arete resolve "Jane" --type person
arete resolve "Jane" --json
arete resolve "onboarding" --type project
arete resolve "Bob" --type person
```

**Expected**:
- Resolves "Jane" → jane-doe.md with path, name, metadata
- Resolves "onboarding" → onboarding-discovery project
- Resolves "Bob" → bob-buyer.md
- Confidence score shown
- JSON includes full metadata

---

## Test 9: Briefing Assembly (ENHANCED)

```bash
arete brief --for "prep for my 1:1 with Jane Doe"
arete brief --for "prep for my 1:1 with Jane Doe" --json
arete brief --for "review the onboarding project"
```

**Expected**:
- Full briefing with sections:
  - Context files (ranked by relevance)
  - Memory results (decisions, learnings)
  - Resolved entities (Jane Doe → person file)
  - Entity relationships (Jane works_on X, attended Y)
  - Temporal signals ("last discussed N days ago in ...")
- Formatted markdown output
- JSON includes all structured data

---

## Test 10: People Management

```bash
arete people list
arete people list --json
arete people list --category internal
arete people list --category customers
arete people show jane-doe
arete people show jane-doe --json
```

**Expected**:
- Lists people by category (internal, customers, users)
- `show` displays name, email, role, company, team
- JSON output is structured

---

## Test 11: Skills Management

```bash
arete skill list
arete skill list --json
```

**Expected**:
- Lists all installed skills with name and description
- Should show 20+ skills from the starter pack

---

## Test 12: Integration Status

```bash
arete integration list
```

**Expected**:
- Lists available integrations (fathom, calendar)
- Shows status (active/inactive/not configured)

---

## Test 13: CLI Help

```bash
arete --help
arete context --help
arete memory --help
arete brief --help
arete skill --help
```

**Expected**:
- All commands listed with descriptions
- Subcommands (memory search, memory timeline) documented
- New flags (--inventory, --stale-days) shown

---

## Test 14: Claude IDE Installation

```bash
node packages/cli/bin/arete.js install ~/test-arete-claude --ide claude
ls ~/test-arete-claude/.claude/
```

**Expected**:
- Workspace created with `.claude/` directory instead of `.cursor/`
- Rules in `.claude/rules/` format
- CLAUDE.md instead of AGENTS.md reference

---

## Cleanup

```bash
rm -rf ~/test-arete-workspace
rm -rf ~/test-arete-claude
```
