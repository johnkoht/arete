# Agent Composition Model — Smoke Tests

> Manual validation scenarios for the 4-layer composition model (AGENTS.md → build-standards.md → role → expertise profile).
> Run these after the agent-experts PRD is complete to verify the system works end-to-end.

---

## How to Run

Each scenario is a prompt you give to a pi agent (planner, subagent, or skill). Observe the agent's behavior and check against Expected Behavior. If any Red Flags appear, the composition model has a gap.

**Prerequisites**: All agent-experts PRD tasks complete. Files exist:
- `AGENTS.md` (<100 lines, hand-written)
- `.pi/APPEND_SYSTEM.md` (<100 lines)
- `.pi/standards/build-standards.md`
- `.pi/agents/{developer,reviewer,engineering-lead,orchestrator,product-manager}.md`
- `.pi/expertise/core/PROFILE.md`
- `.pi/expertise/cli/PROFILE.md`

---

## Scenario 1: Planner Routes Ad-Hoc Question to Expert

**Role**: Planner (main conversation)
**Expertise**: None (planner doesn't get a profile — it spawns one)

**Prompt**:
> "How does the IntelligenceService assemble a briefing? What services does it call?"

**Expected Behavior**:
- Planner recognizes this as an ad-hoc code question (per APPEND_SYSTEM.md § Routing)
- Spawns a subagent with **core expertise profile** attached (Layer 4)
- The spawned agent reads `.pi/expertise/core/PROFILE.md` and identifies `IntelligenceService` in `services/intelligence.ts`
- Response references that it orchestrates `ContextService`, `MemoryService`, and `EntityService`
- Response mentions `assembleBriefing()`, `routeToSkill()`, `prepareForSkill()`

**Red Flags**:
- Planner answers directly without spawning an expert (should delegate)
- Planner spawns an expert but without the core PROFILE.md attached
- Expert doesn't know about IntelligenceService's dependency on the three core services
- Expert describes architecture that contradicts `factory.ts` wiring

---

## Scenario 2: Planner Knows Available Expertise Profiles

**Role**: Planner (main conversation)
**Expertise**: None

**Prompt**:
> "What expertise profiles are available for BUILD mode? What does each one cover?"

**Expected Behavior**:
- Planner reads from AGENTS.md `[Expertise]` section
- Lists two profiles: `core` and `cli`
- Describes core as covering `packages/core/` — services, search, integrations, adapters, storage, utils
- Describes cli as covering `packages/cli/` — commands, formatters, CLI↔core mapping
- Mentions the domain selection heuristic from APPEND_SYSTEM.md (touches `packages/core/` → core profile, `packages/cli/` → cli profile, both → both)

**Red Flags**:
- Planner can't enumerate profiles (AGENTS.md `[Expertise]` section missing or unreadable)
- Planner invents profiles that don't exist (e.g., "runtime" profile)
- Planner doesn't know the routing heuristic for when to attach which profile

---

## Scenario 3: Developer + Core Identifies Correct Service

**Role**: Developer (subagent)
**Expertise**: Core (`packages/core/`)

**Prompt** (task description given to developer subagent):
> "Add a `getRecentDecisions(days: number)` method to the MemoryService that returns decisions from the last N days. It should use the existing search infrastructure."

**Expected Behavior**:
- Developer reads `.pi/expertise/core/PROFILE.md` and identifies `MemoryService` in `services/memory.ts`
- Knows MemoryService depends on `StorageAdapter` and `SearchProvider`
- Reads `packages/core/src/services/memory.ts` before implementing
- Uses `StorageAdapter` for file I/O (not `fs` directly)
- Checks `packages/core/src/services/LEARNINGS.md` before editing
- Types defined in `models/memory.ts`, exported from `models/index.ts`
- Follows DI pattern: method uses existing constructor-injected dependencies

**Red Flags**:
- Developer imports `fs` directly in the service (violates core invariant)
- Developer doesn't know where MemoryService is or what it depends on
- Developer creates a standalone function instead of a class method
- Developer doesn't check LEARNINGS.md before editing
- Developer puts types in the service file instead of `models/`

---

## Scenario 4: Developer + Core References LEARNINGS.md from Profile

**Role**: Developer (subagent)
**Expertise**: Core (`packages/core/`)

**Prompt** (task description):
> "Fix a bug in EntityService where refreshPersonMemory skips results when SearchProvider returns empty."

**Expected Behavior**:
- Developer reads `.pi/expertise/core/PROFILE.md`
- Profile's EntityService section states: "empty results → full scan (never skip)"
- Developer checks `packages/core/src/services/LEARNINGS.md` (listed in profile's LEARNINGS.md Locations table)
- LEARNINGS.md provides additional context on EntityService invariants
- Fix ensures the full scan fallback is preserved, not bypassed
- Developer adds a regression test with a comment explaining the failure mode

**Red Flags**:
- Developer doesn't consult LEARNINGS.md before editing
- Developer "fixes" the bug by removing the full-scan fallback
- Developer doesn't know about the `SEARCH_PROVIDER_CANDIDATE_LIMIT = 100` threshold
- Developer doesn't add a regression test

---

## Scenario 5: Developer + CLI Knows Command-to-Service Mapping

**Role**: Developer (subagent)
**Expertise**: CLI (`packages/cli/`)

**Prompt** (task description):
> "Add a `--category` filter to the `arete people list` command that passes the category to the core EntityService."

**Expected Behavior**:
- Developer reads `.pi/expertise/cli/PROFILE.md`
- Identifies `people.ts` as the command file, specifically `people list`
- Knows it calls `services.entity.listPeople(paths, { category })`
- Follows the command skeleton: `createServices() → findRoot() → guard → service call → format`
- Uses `formatters.ts` helpers for output (not raw `console.log`)
- Reads `packages/cli/src/commands/LEARNINGS.md` before editing
- Adds `--json` support for the new filter
- Knows to check core PROFILE.md for `EntityService` API if needed

**Red Flags**:
- Developer constructs services directly instead of using `createServices()`
- Developer puts business logic (filtering) in the CLI command instead of delegating to core
- Developer doesn't use formatters
- Developer forgets `--json` output path
- Developer doesn't know which core service `people list` consumes

---

## Scenario 6: Reviewer + Core Applies Domain Invariants

**Role**: Reviewer (subagent)
**Expertise**: Core (`packages/core/`)

**Prompt** (review request):
> "Review this PR that adds a new `AnalyticsService` to packages/core/. The service imports `fs` for reading log files and is constructed directly in the CLI command."

**Expected Behavior**:
- Reviewer reads `.pi/expertise/core/PROFILE.md`
- Flags `fs` import as violating the StorageAdapter invariant ("Services never import `fs` directly")
- Flags direct construction as violating the factory pattern ("CLI commands never construct services directly — always `createServices()`")
- References the Anti-Patterns section of the core profile
- Suggests: add to `factory.ts` wiring, inject `StorageAdapter` via constructor
- Checks that types are defined in `models/` not inline
- Verifies tests mock `StorageAdapter` not filesystem

**Red Flags**:
- Reviewer doesn't catch the `fs` import violation
- Reviewer doesn't catch the direct construction anti-pattern
- Reviewer doesn't reference core profile invariants in feedback
- Reviewer approves without checking test approach

---

## Scenario 7: Engineering Lead + Core + CLI Assesses Cross-Cutting Impact

**Role**: Engineering Lead (subagent)
**Expertise**: Core + CLI (both profiles attached)

**Prompt** (review request):
> "Assess the impact of renaming `EntityService.resolve()` to `EntityService.resolveReference()`. What files and commands would need to change?"

**Expected Behavior**:
- Engineering Lead reads both expertise profiles
- From **core profile**: identifies `EntityService` in `services/entity.ts`, notes it's used by `IntelligenceService` (composition dependency)
- From **core profile**: identifies compat layer `compat/entity.ts` as another consumer
- From **CLI profile**: identifies all commands that call `services.entity.resolve()`:
  - `intelligence.ts` (resolve command)
  - `availability.ts` (resolves person for `--with`)
  - `calendar.ts` (resolves person for `--with`)
  - `pull.ts` (`resolveEntities()` for attendee enrichment)
- Recommends: update service → update compat layer → update all CLI consumers → update tests
- Flags risk: compat layer exists for gradual migration, so old callers may exist outside tracked files

**Red Flags**:
- Engineering Lead only identifies core changes, misses CLI impact
- Engineering Lead only identifies CLI changes, misses compat layer
- Engineering Lead doesn't consult both profiles
- Engineering Lead doesn't flag the compat layer migration risk

---

## Scenario 8: Orchestrator Assigns Correct Expertise to PRD Tasks

**Role**: Orchestrator (during execute-prd)
**Expertise**: N/A (orchestrator assembles context for others)

**Prompt** (PRD with mixed tasks):
> Execute a PRD containing these tasks:
> 1. "Add caching to ContextService.getRelevantContext()"
> 2. "Add `--verbose` flag to `arete context` command"
> 3. "Update README.md with new caching documentation"

**Expected Behavior**:
- Orchestrator reads AGENTS.md `[Expertise]` section and APPEND_SYSTEM.md § Composition
- Task 1 touches `packages/core/` → attaches **core profile** to developer subagent
- Task 2 touches `packages/cli/` → attaches **cli profile** to developer subagent
- Task 3 touches neither packages/ directory → **no expertise profile** (Layer 4 skipped)
- Each developer subagent receives the correct 4-layer (or 3-layer) context stack
- Orchestrator includes in each task prompt: AGENTS.md (L1), build-standards.md (L2 for code tasks), developer.md (L3), appropriate PROFILE.md (L4)

**Red Flags**:
- Orchestrator attaches core profile to CLI task or vice versa
- Orchestrator attaches profiles to the docs task (should skip Layer 4)
- Orchestrator doesn't attach any profile to code tasks
- Orchestrator doesn't follow the domain selection heuristic from APPEND_SYSTEM.md

---

## Scenario 9: Multi-Expertise — Task Spanning Core and CLI

**Role**: Developer (subagent)
**Expertise**: Core + CLI (both profiles attached)

**Prompt** (task description):
> "Add a new `arete memory recent` command that shows recent memory entries. Requires adding a `getRecent()` method to MemoryService in core, then exposing it via a new CLI command."

**Expected Behavior**:
- Developer receives both core and CLI expertise profiles
- For the core portion:
  - Adds `getRecent()` to `MemoryService` in `services/memory.ts`
  - Uses `StorageAdapter` (not `fs`)
  - Adds types to `models/memory.ts`
  - Checks `packages/core/src/services/LEARNINGS.md`
- For the CLI portion:
  - Adds to `intelligence.ts` (where other memory commands live)
  - Follows command skeleton: `createServices() → findRoot() → guard → service call → format`
  - Uses `formatters.ts` helpers
  - Supports `--json` flag
  - Checks `packages/cli/src/commands/LEARNINGS.md`
- Developer knows the boundary: business logic in core, presentation in CLI

**Red Flags**:
- Developer puts filtering/business logic in the CLI command
- Developer doesn't follow patterns from both profiles
- Developer checks LEARNINGS.md for one package but not the other
- Developer forgets the command skeleton pattern from CLI profile

---

## Scenario 10: No Expertise — Task Outside Profiled Domains

**Role**: Developer (subagent)
**Expertise**: None (task touches `packages/runtime/`)

**Prompt** (task description):
> "Fix a typo in the schedule-meeting skill template in packages/runtime/skills/schedule-meeting/."

**Expected Behavior**:
- Orchestrator recognizes task touches `packages/runtime/`, not core or CLI
- Per APPEND_SYSTEM.md heuristic: "If neither (docs, config) → skip Layer 4"
- Developer receives 3-layer stack: AGENTS.md (L1), build-standards.md (L2), developer.md (L3)
- Developer proceeds without a PROFILE.md — uses general file navigation (read, grep)
- Developer still checks for LEARNINGS.md in `packages/runtime/skills/schedule-meeting/` (per LEARNINGS.md Rules in APPEND_SYSTEM.md)
- Task completes successfully despite no expertise profile

**Red Flags**:
- Orchestrator blocks because no expertise profile exists for runtime
- Orchestrator incorrectly attaches core or CLI profile for a runtime task
- Developer fails to navigate without a profile (should still function, just without domain shortcuts)
- Developer skips LEARNINGS.md check because no profile told them to (LEARNINGS.md rules are in APPEND_SYSTEM.md, not profiles)
