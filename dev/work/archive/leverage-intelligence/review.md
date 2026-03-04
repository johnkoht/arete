# Multi-Reviewer Synthesis: Leverage Intelligence — Commitments Service

**Reviews conducted by**: Core Services, CLI, Runtime/Skills, and Persona Council subagents  
**Date**: 2026-03-03  
**Verdict**: Revise — 14 blocking gaps identified across 4 domains. Plan is directionally correct; spec gaps must be resolved before execution.

---

## Critical Findings by Domain

### Core Services (Steps 1–6)

**C1 [Critical]** Hash matching is unimplementable as specified. The Step 6 AC says "match by hash" but rendered format `- [ ] text (date)` contains no hash. `computeActionItemHash(text, personSlug, direction)` needs all three inputs; only text is visible in the rendered line.  
→ Fix: Embed hash as HTML comment: `- [ ] text (date) <!-- h:abc123 -->`. Parser in Step 6 reads comment to recover hash. renderPersonMemorySection() emits the comment.

**C2 [Critical]** CommitmentsService never wired into factory.ts, services/index.ts, or AreteServices type. No step mentions this. CLI can't access `services.commitments`.  
→ Fix: Add explicit AC to Step 5: "CommitmentsService added to factory.ts, AreteServices type, and services/index.ts barrel."

**C3 [Critical]** callLLM-not-provided behavior unspecified — silent regression. Currently action items always extract (regex). After Steps 1+2, when callLLM is absent, extraction silently skips. Users without LLM get zero commitments with no warning.  
→ Fix: Specify regex fallback in Step 1 and Step 2 AC: "When callLLM is not provided, fall back to regex extractActionItemsForPerson() to preserve current behavior."

**C4 [Critical]** EntityService → CommitmentsService dependency not planned. Step 6 requires refreshPersonMemory() to call CommitmentsService, but EntityService constructor is locked to (storage, searchProvider?). Plan never specifies how EntityService gets CommitmentsService.  
→ Fix: Pass via RefreshPersonMemoryOptions: `commitments?: CommitmentsService`. Gated: `if (options.commitments) { ... }`.

**C5 [Critical]** reconcile() fuzzy algorithm unspecified, no library exists. "Fuzzy-match" is implementation-free. No fuzzy string library (fuse.js, leven) in codebase.  
→ Fix: Specify normalized word-overlap Jaccard similarity, no external library. threshold ≥ 0.6 → include in results. Or defer reconcile() entirely (it has no CLI exposure and no integrations yet).

**C6 [Moderate]** `- [x]` detection sequencing not specified. Where in the refreshPersonMemory() flow does detection happen?  
→ Fix: After reading file content, before rendering: parse existing auto-section → bulkResolve detected items → render fresh items.

**C7 [Moderate]** commitments.json path hardcoded, not anchored to WorkspacePaths.  
→ Fix: CommitmentsService constructor takes `workspaceRoot: string`, resolves path internally.

**C8 [Moderate]** Pruning window uses wrong timestamp. >30-day pruning for resolved items should use `resolvedAt`, not `date` (meeting date). A commitment from 6 months ago, resolved yesterday, would be immediately pruned.  
→ Fix: Add `resolvedAt: string | null` to Commitment type. Prune predicate: `daysSince(resolvedAt) > 30`.

---

### CLI (Step 7)

**L1 [Blocking]** 64-char SHA-256 ID is unusable for `resolve <id>`. Week-review skill must instruct user to run this command; users cannot type/copy 64-char hashes reliably.  
→ Fix: `list` shows 8-char short ID. `resolve` accepts prefix ≥ 6 chars with ambiguity error. AC must specify this behavior explicitly.

**L2 [Blocking]** `--person` is singular; daily-plan needs multi-attendee filtering.  
→ Fix: Change to variadic `--person <slug...>` (Commander.js supports this). Service layer filters on any matching slug. Update Step 7 AC.

**L3 [Blocking]** `resolve` is a write command; missing all three write-command requirements: `--skip-qmd`, `loadConfig()`, `refreshQmdIndex()`, `displayQmdResult()`.  
→ Fix: Add to Step 7 AC: "`resolve` includes `--skip-qmd`, calls `loadConfig()` after `findRoot()`, calls `refreshQmdIndex()` before JSON/human return, uses `displayQmdResult()`."

**L4 [Blocking]** No `--json` contract. Both commands need --json mode with specified output shapes for programmatic use by skills.  
→ Fix: Specify JSON shapes in AC. `list --json`: `{ commitments: [...], count }`. `resolve --json`: `{ resolved: {...}, qmd: {...} }`. Errors: `{ success: false, error: "..." }`.

**L5 [Blocking]** `findRoot()` guard missing from AC. Both commands need workspace root guard.  
→ Fix: Add to AC: "Both commands guard with `findRoot()`. Error path is JSON-aware."

**L6 [Soft]** Confirmation UX for `resolve` underspecified. If interactive, blocks skill automation.  
→ Fix: Add `--yes` flag to skip confirmation. Confirmation uses `confirm()` from `@inquirer/prompts` with `default: false`. Show commitment text + person before confirming.

**L7 [Soft]** Routing discoverability not addressed. `arete route "what do I owe"` won't find commitments commands.  
→ Fix: Add to AC: "Create tool definition with triggers: 'commitments', 'what I owe', 'what they owe', 'track commitment', 'resolve commitment'."

---

### Runtime/Skills (Step 8)

**S1 [Blocking]** process-meetings is the primary action item producer and is not in Step 8 scope. CommitmentsService will be empty on first use because no workflow writes to it. The data flow is broken: process-meetings writes to `## Action Items` in meeting files; skills call `arete commitments list`; get nothing.  
→ Fix: Add process-meetings to Step 8. When it extracts action items, it must also call CommitmentsService sync. Or: Step 2 (person memory refresh) feeds CommitmentsService automatically — but this only runs when `arete people memory refresh` is called, not when meetings are processed. The producer gap must be resolved.

**S2 [Blocking]** PATTERNS.md get_meeting_context change silently affects prepare-meeting-agenda, which is not listed in Step 8. Three skills call this pattern; plan only accounts for two.  
→ Fix: Audit all callers of get_meeting_context before changing PATTERNS.md. Add conditional fallback: "If CommitmentsService returns empty, fall back to manual `## Action Items` parse."

**S3 [Blocking]** daily-plan multi-attendee vs `--person` singular: N×M CLI call problem. Today's meetings could have 12 distinct attendees. One `list --person` call per attendee = 12 serial calls in planning workflow.  
→ Fix: daily-plan should call `arete commitments list` (unfiltered, all open), then agent filters by today's attendee names in context. Avoids N×M calls. Week-plan follows same pattern.

**S4 [Blocking]** 64-char hash UX in conversational week-review context. Skill must instruct user to run `arete commitments resolve <id>`. In a chat/IDE context, hash cannot be clicked or typed.  
→ Fix: With 8-char prefix (from L1 fix), agent-mediated resolution is workable: agent shows commitment list, user says "done", agent runs `resolve abc12345` on user's behalf. Week-review AC must specify this agent-mediated flow explicitly.

**S5 [Ambiguity]** Dual read paths create confusion: `arete people show --memory` (shows commitments inline) vs `arete commitments list --person` (task-management view). Skills and agents will call both or inconsistently.  
→ Fix: Canonicalize in PATTERNS.md: use `people show --memory` for meeting-prep (full person brief); use `commitments list` for week-review/week-plan (task-management resolution).

**S6 [Ambiguity]** week-review AC underspecified: resolution step placement, "dropped" state definition, resolution UX not described.  
→ Fix: Add new dedicated step to week-review workflow. Define "dropped" = explicitly de-scoped, no longer relevant. Resolution is agent-mediated (agent runs resolve on user's behalf after per-item confirmation). Include single "skip this section" escape.

**S7 [Ambiguity]** week-plan "user picks" creates decision overhead and semantic confusion (commitments aren't tasks, they're obligations).  
→ Fix: Remove separate pick-and-promote flow. Fold commitments into existing "Commitments due this week" section. User can elevate to a top outcome naturally in step 3 without a forced interaction.

---

### Persona Council Decisions

| Feature | Decision | Key Constraint |
|---------|----------|----------------|
| A: Markdown sync | Optional, off by default | Architect-only direct value; don't gate Feature C on A |
| B: CLI commands | Required, on by default (infrastructure) | Invoked by skills on user's behalf, not directly by users |
| C: Meeting-prep commitments | **Required, on by default** | All three personas value; silently omit if no data, never error |
| D: Week-review resolution | Optional, on by default, **skippable in one step** | Harvester rejects interactive loop; must have single "skip" escape |
| E: Daily/week-plan commitments | Daily-plan: required / Week-plan list: required / Week-plan interactive step: optional, skippable | Week-plan prioritization loop follows same skippable rule as D |

---

## Summary: What Must Change Before Execution

### Required (blocks correct implementation)
1. **Step 6**: Specify hash embedding: `- [ ] text (date) <!-- h:abc123 -->`. renderPersonMemorySection() emits the comment; parser reads it.
2. **Step 5**: Add factory.ts wiring to AC. CommitmentsService in AreteServices, services/index.ts.
3. **Step 1+2**: Add callLLM-not-provided fallback: regex extraction preserves current behavior.
4. **Step 6**: Add `commitments?: CommitmentsService` to RefreshPersonMemoryOptions. Gate: `if (options.commitments)`.
5. **Step 5**: Specify reconcile() algorithm (Jaccard word-overlap, threshold 0.6, no library) OR defer reconcile() entirely.
6. **Step 7**: 8-char prefix IDs in list; prefix-match in resolve.
7. **Step 7**: `--person <slug...>` variadic.
8. **Step 7**: `resolve` write-command ACs: --skip-qmd, --yes, loadConfig, refreshQmdIndex, displayQmdResult.
9. **Step 7**: --json contract specified for both commands.
10. **Step 7**: findRoot() guard on both commands.
11. **Step 8**: Add process-meetings as a producer (or document that refresh-based sync is the only producer path and its implications).
12. **Step 8**: PATTERNS.md update audits all callers; adds fallback for empty CommitmentsService.
13. **Step 8**: daily-plan uses `arete commitments list` unfiltered + agent-side filter (not N×M --person calls).
14. **Step 8**: week-review resolution UX specified: agent-mediated, skippable, "dropped" state defined.

### Recommended (improve quality and UX)
- Step 4: Add `resolvedAt: string | null` field; prune on resolvedAt not date.
- Step 4: CommitmentsService constructor takes `workspaceRoot: string`.
- Step 6: Specify detection sequencing (read → detect → bulkResolve → render).
- Step 7: `--yes` flag on `resolve`.
- Step 7: Routing tool definition.
- Step 8: Canonicalize `people show --memory` vs `commitments list` use in PATTERNS.md.
- Step 8: week-plan folds into existing section; remove pick-promote interactive step.
- Out of scope: Defer `reconcile()` method entirely — no CLI, no integrations, speculative interface.
