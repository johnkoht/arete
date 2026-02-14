# Tools

Tools are **lifecycle-based, stateful capabilities** that complement Skills. While Skills are stateless procedures you invoke anytime, Tools have phases, track progress, and eventually complete.

## Skills vs Tools

| Aspect | Skills | Tools |
|--------|--------|-------|
| **State** | Stateless | Stateful |
| **Availability** | Always available | Lifecycle-bound |
| **Invocation** | Invoke anytime | Activate → progress → complete |
| **Examples** | Discovery, PRD, meeting prep | Onboarding, seed context |

**Use a Skill when**: You need a repeatable workflow
**Use a Tool when**: You need sustained support over time with progress tracking

## Available Tools

| Tool | Path | Description | Lifecycle |
|------|------|-------------|-----------|
| **onboarding** | `runtime/tools/onboarding/TOOL.md` | 30/60/90 day plan for thriving at a new job—learn, contribute, lead | 90-150 days |
| **seed-context** | `runtime/tools/seed-context/TOOL.md` | Bootstrap workspace context by importing historical data from integrations | One-time (minutes to hours) |

## Using a Tool

Tools are discoverable via routing. Just describe what you want:

- "I'm starting a new job"
- "Help me onboard at my new role"
- "Seed my context from Fathom"
- "Import my meeting history"

The assistant will:
1. Route to the appropriate tool
2. Read the tool definition
3. Ask about scope preference (if applicable)
4. Create project in `projects/active/[tool-name]/`
5. Guide you through phases

## Tool Lifecycle

```
Available → Activate → In Progress → Complete → Archived
```

Tools don't expire—they **graduate**. Each tool defines clear criteria for completion.

### Onboarding Tool Details

**Purpose**: Structured 30/60/90 day plan for new job success

**Triggers**:
- "I'm starting a new job"
- "onboarding"
- "30/60/90"
- "new role"
- "ramp up"

**Scope Options**:
- **Comprehensive** (default): Full 90-day plan, weekly check-ins, full context population, stakeholder mapping, 1:1 tracking
- **Streamlined**: 30-day focused plan, bi-weekly check-ins, core context only, key stakeholders

**Phases**:
1. **Phase 1 (Days 1-30): Learn** - Absorb context, build relationships, gather knowledge
2. **Phase 2 (Days 31-60): Contribute** - Deliver first value, establish credibility, deepen expertise
3. **Phase 3 (Days 61-90): Lead** - Own outcomes, influence decisions, expand impact

### Seed Context Tool Details

**Purpose**: Bootstrap workspace from historical data

**Triggers**:
- "seed my context"
- "backfill"
- "import history"
- "bootstrap context"

**Scope Options**:
- **Quick Seed** (30 days): Fast bootstrap, ~15-50 items, completes in minutes
- **Standard Seed** (60 days): Balanced coverage, ~30-100 items, 5-15 minutes
- **Deep Seed** (90+ days): Comprehensive history, 50-200+ items, 15-30+ minutes

**Review Model**: Queue-based review—extracted decisions and learnings saved to `memory/pending-review.md` for later processing (appropriate for bulk imports).

**When NOT to Use**:
- Syncing recent/new data → Use `sync` skill instead
- Daily/weekly sync → Configure integration for scheduled sync
- Single item import → Use `sync` skill

## CLI Commands

```bash
arete tool list          # List available tools
arete tool show <name>   # Show tool details
```
