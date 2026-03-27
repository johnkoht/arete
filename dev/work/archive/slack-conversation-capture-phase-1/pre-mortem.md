# Pre-Mortem: Slack Conversation Capture — Phase 1

**Plan**: Manual ingestion of Slack conversations into `conversation` artifacts with extracted insights  
**PRD**: `dev/work/plans/slack-conversation-capture-phase-1/prd.md`  
**Date**: 2026-02-19  
**Size**: Large (6 delivery steps)

---

## Risk 1: No `conversation` Artifact Type Exists Yet

**Problem**: The codebase has no concept of a `conversation` artifact. There's no model type, no workspace path (`resources/conversations`), no save logic, no template. The `WorkspacePaths` type doesn't include a `conversations` field. Meetings have a well-established pattern (`MeetingForSave`, `saveMeetingFile`, `meetingFilename`, output to `resources/meetings/`), but conversations need a parallel track. Every downstream piece — context discovery, memory integration, people intelligence — depends on this schema being right from the start.

**Mitigation**:
- Design the `ConversationForSave` type and artifact schema **first**, before any pipeline work.
- Follow the meetings pattern closely: frontmatter (title, date, source, provenance), structured sections, slug-based filenames.
- Decide upfront: does `WorkspacePaths` get a `conversations` field, or do conversations live under `resources/conversations/`? (Recommend the latter for Phase 1 — avoids touching workspace type + install/update flows.)
- Add `resources/conversations` to `BASE_WORKSPACE_DIRS` in `workspace-structure.ts`.
- Write the type + save function + test before building anything on top.

**Verification**: `ConversationForSave` type exists with all required fields (raw, normalized, insights, provenance). Save function has unit tests. Schema review completed before pipeline work begins.

---

## Risk 2: Slack Paste Format Is Highly Variable

**Problem**: Slack conversations pasted as text come in many forms: browser copy (includes timestamps/avatars), mobile copy (different format), exported JSON, screenshot-to-text, manually reformatted. The PRD says "parses speaker turns/timestamps when detectable" — but the variability is enormous. If the parser is too rigid, it fails on common inputs. If too loose, it produces garbage normalized output.

**Mitigation**:
- Define a **minimal viable parse**: detect `Name: message` or `[timestamp] Name: message` patterns. Everything else is treated as unstructured text (still usable for insight extraction).
- Do NOT try to handle Slack JSON export or HTML in Phase 1 — that's scope creep.
- Build the parser with a **fallback chain**: try structured parse → fall back to raw text with paragraph splitting → always succeed (never error on input format).
- Collect 5-10 real paste samples before implementing to validate assumptions.
- The insight extraction (LLM-based) doesn't need perfect parsing — raw pasted text is fine input for summarization.

**Verification**: Parser has tests for at least 4 input formats: structured with timestamps, structured without timestamps, unstructured blob, empty/minimal input. All produce valid output (never throw).

---

## Risk 3: Insight Extraction Quality Is Uncertain

**Problem**: The PRD requires 6 insight types (summary, decisions, actions, questions, stakeholders, risks). LLM extraction quality varies with conversation length, topic density, and how well-structured the input is. Short conversations may not have all 6 types. The PRD lists "pilot users rate usefulness at target threshold" but doesn't define the threshold. Risk of building a full pipeline that produces mediocre output.

**Mitigation**:
- Make each insight section **optional** in the schema — don't force 6 sections when the conversation only has 3 meaningful ones.
- Use a single well-crafted extraction prompt rather than 6 separate calls. Structured output (JSON mode) to get reliable formatting.
- Add a `confidence` or `extracted_count` field to the artifact so users know what was found vs. not.
- For Phase 1, don't over-invest in prompt tuning — the edit-before-save step is the quality safety net.
- Define "usefulness threshold" now: suggest ≥4/5 on "Was this summary accurate and useful?" for ≥70% of captures.

**Verification**: Extraction produces valid structured output for at least 3 real conversation samples. Empty/missing sections are handled gracefully (not blank headers with no content).

---

## Risk 4: Edit/Redact UX Is Underspecified

**Problem**: The PRD says "user can edit/redact extracted content before save" but this is a CLI/chat tool, not a GUI. What does "edit before save" look like in practice? In a chat context, the agent shows output and the user says "change X." In CLI, options are: dump to temp file and open `$EDITOR`, or interactive prompts. The UX here is vague enough to become a time sink or produce something nobody uses.

**Mitigation**:
- **Phase 1 scope decision**: In chat context, "edit before save" means the agent presents the extracted output and asks "Want to change anything before I save?" — conversational editing. No special UI needed.
- For CLI: present the output, ask for confirmation. If the user wants to edit, save a draft and let them edit the markdown file directly, then run a "finalize" command.
- Do NOT build a custom interactive editor. That's Phase 2+ if ever.
- Redaction in Phase 1 = user edits out sensitive content in the conversational flow or in the draft file. Don't build a redaction-specific feature.

**Verification**: The save flow has a clear "review → confirm → save" step. Draft mode works (save without finalizing, edit file, then finalize).

---

## Risk 5: Memory/Context Integration Coupling

**Problem**: PRD step 4 says "Integrate with memory/people intelligence pathways." The existing `IntelligenceService` orchestrates context, memory, and entity services. Making conversations discoverable by these services means they need to know about the new artifact type. This could require changes to `ContextService` (to find conversation files), `MemoryService` (to index them), and `EntityService` (to extract people). Touching 3+ services for "integration" is where scope explodes.

**Mitigation**:
- **Phase 1 integration = file-based discovery only.** If conversations are saved as markdown in `resources/conversations/` with proper frontmatter, existing context service glob patterns may already pick them up. Verify this before writing new integration code.
- People intelligence integration should be **out of scope for Phase 1** (it's explicitly in Phase 2 backlog). The PRD's step 4 should be scoped down to: "Ensure conversation artifacts are discoverable by `arete context`."
- Don't modify `EntityService` or `IntelligenceService` in Phase 1.
- Test: after saving a conversation, does `arete context --for "topic from conversation"` find it?

**Verification**: A saved conversation file appears in `arete context` results without any service modifications. If it doesn't, the fix is a glob pattern update, not an architecture change.

---

## Risk 6: No Existing Test Patterns for Integration Pipelines

**Problem**: Looking at the test directory, there are tests for individual services but the Fathom integration (the closest analog) may not have comprehensive pipeline tests. A new integration with parse → extract → edit → save has multiple stages, each needing tests. Without clear test patterns, subagents or future developers may skip testing or write inconsistent tests.

**Mitigation**:
- Before building, review existing integration tests: `packages/core/test/integrations/` for patterns.
- Define the test strategy upfront:
  - Unit tests: parser (multiple input formats), save function (file output), schema validation
  - Integration tests: full pipeline (paste input → saved file with correct content)
- Use the `StorageAdapter` interface for testability (mock file system, no real writes in tests).
- Each delivery step must include its tests before moving to the next step.

**Verification**: Test files exist for parser, save, and pipeline. All use mock `StorageAdapter`. Tests run as part of `npm test`.

---

## Risk 7: Scope Creep from "Parsing" Into "Slack Integration"

**Problem**: The PRD is titled "Slack Conversation Capture" and the natural inclination will be to make the parser Slack-aware (handle Slack-specific formatting, emoji reactions, thread replies, channel references). This is a slippery slope toward building Phase 2/3 features (Slack API, thread URL import) under the guise of "better parsing."

**Mitigation**:
- Rename internally to "Conversation Capture" (not "Slack"). The input is **pasted text**, source-agnostic.
- Parser should handle generic conversation patterns, not Slack-specific markup.
- Explicit rule: if a parsing feature requires knowledge of Slack's data format (e.g., `<@U123>` user mentions, `:emoji:` syntax), it's **out of scope** for Phase 1.
- The insight extraction prompt can mention "this may be from Slack" but shouldn't depend on Slack structure.

**Verification**: Parser has no Slack-specific code (no Slack mention parsing, no emoji handling, no thread detection). Search codebase for "slack" — should only appear in user-facing strings/docs, not parsing logic.

---

## Risk 8: State Tracking Across 6 Delivery Steps

**Problem**: This is a large plan with 6 steps that will span multiple sessions. Without clear state tracking, work may be repeated, skipped, or done out of order. The PRD delivery plan is high-level — it doesn't have per-task acceptance criteria or dependency markers.

**Mitigation**:
- Before starting build, convert PRD to `prd.json` with explicit tasks, dependencies, and ACs.
- Use `prd.json` status tracking (the existing `execute-prd` skill handles this).
- After each step, update `prd.json` status and run full test suite.
- Key dependency chain: Step 1 (schema) → Step 2 (pipeline) → Step 3 (edit/save UX) → Step 4 (integration). Steps 5-6 are post-ship.

**Verification**: `prd.json` exists with task statuses before build begins. Each completed task is marked in the JSON.

---

## Summary

| # | Risk | Category | Severity |
|---|------|----------|----------|
| 1 | No conversation artifact type exists | Dependencies | High |
| 2 | Slack paste format is highly variable | Integration | High |
| 3 | Insight extraction quality is uncertain | Integration | Medium |
| 4 | Edit/redact UX is underspecified | Scope Creep | Medium |
| 5 | Memory/context integration coupling | Scope Creep | High |
| 6 | No test patterns for integration pipelines | Test Patterns | Medium |
| 7 | Scope creep from parsing into Slack integration | Scope Creep | Medium |
| 8 | State tracking across 6 steps | State Tracking | Low |

**Total risks identified**: 8  
**Categories covered**: Dependencies, Integration, Scope Creep, Test Patterns, State Tracking  
**Highest risks**: #1 (schema must be right first), #2 (parse variability), #5 (integration scope)

---

**Key recommendation**: The biggest risk is scope. Three of eight risks are scope-creep-related. The mitigations all point the same direction: **build the schema + parser + save flow first, keep integration minimal (file-based discovery only), and defer people intelligence to Phase 2.**

**Ready to proceed with these mitigations?**
