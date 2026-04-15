# PRD: Enhance `brief` with AI Synthesis

## Goal

Make the `brief` command produce concise, synthesized briefings by piping assembled context through AIService, with graceful fallback when AI is not configured and a `--raw` flag to skip AI.

## Background

Currently `arete brief --for "topic"` assembles context + memory + entities into a raw markdown dump via `IntelligenceService.assembleBriefing()`. The name "brief" implies synthesis, but users get a wall of text. This PRD adds AI synthesis to produce an actionable briefing with status, decisions, people, activity, and risks.

---

## Task 1: Add `brief` AITask type and default tier mapping

**Description**: Extend the `AITask` union type to include `'brief'` and add a default tier mapping (`'brief' → 'standard'`).

**Files**:
- `packages/core/src/models/workspace.ts` — Add `'brief'` to `AITask` union
- `packages/core/src/services/ai.ts` — Add `brief: 'standard'` to `DEFAULT_TASK_TIERS`

**Acceptance Criteria**:
- `AITask` type includes `'brief'`
- `DEFAULT_TASK_TIERS` maps `brief` to `'standard'`
- `npm run typecheck` passes
- `npm test` passes (existing AI tests unaffected)

---

## Task 2: Create `synthesizeBriefing()` in IntelligenceService

**Description**: Add a method to `IntelligenceService` that takes assembled briefing markdown + topic, sends it to AIService for synthesis, and returns a structured AI-generated briefing. Includes context truncation to stay within model token limits.

**Files**:
- `packages/core/src/services/intelligence.ts` — Add `synthesizeBriefing()` method
- `packages/core/src/models/intelligence.ts` — Add `SynthesizedBriefing` type
- `packages/core/src/services/index.ts` — Ensure exports are correct

**Acceptance Criteria**:
- `synthesizeBriefing(briefing: PrimitiveBriefing, topic: string, aiService: AIService)` method exists
- Truncates assembled markdown to 12,000 characters before sending to AI (configurable)
- Uses the `'brief'` AITask for model routing
- Returns `SynthesizedBriefing` with `{ synthesis: string; truncated: boolean; usage: { input: number; output: number } }`
- Gracefully returns fallback when AI call fails (catches errors, returns `null`)
- Prompt instructs AI to produce 5-section briefing: Status, Key Decisions, Key People, Recent Activity, Open Questions/Risks
- Unit tests in `packages/core/test/services/intelligence-brief.test.ts` covering: successful synthesis, truncation behavior, AI failure returns null

---

## Task 3: Add `--raw` flag and AI synthesis to CLI `brief` command

**Description**: Modify `registerBriefCommand()` in `intelligence.ts` to pipe assembled briefing through AI synthesis by default, with `--raw` flag to skip AI.

**Files**:
- `packages/cli/src/commands/intelligence.ts` — Modify `registerBriefCommand()`

**Acceptance Criteria**:
- `--raw` flag added to `brief` command
- When AI is configured and `--raw` is not set: calls `synthesizeBriefing()`, displays AI synthesis
- When AI is not configured: shows current raw output + info message about configuring AI
- When `--raw` is set: shows current raw output (regardless of AI configuration)
- `--json` mode includes `{ synthesized: boolean, synthesis?: string, raw: string }` fields
- If AI synthesis fails (returns null): falls back to raw output with warning
- Unit tests in `packages/cli/test/commands/brief.test.ts` covering: AI synthesis path, raw flag path, no-AI-configured fallback, JSON mode

---

## Task 4: Integration testing and quality polish

**Description**: End-to-end testing of all paths, verify JSON mode completeness, and ensure backward compatibility.

**Files**:
- `packages/core/test/services/intelligence-brief.test.ts` — Additional edge case tests
- `packages/cli/test/commands/brief.test.ts` — Additional edge case tests

**Acceptance Criteria**:
- All existing `brief` tests still pass (backward compatibility)
- Empty briefing (no context found) handled gracefully in both AI and raw modes
- `--json` output is complete and parseable for all paths (AI, raw, fallback)
- `npm run typecheck` passes
- `npm test` passes (full suite)
