# Pre-Mortem: Conversation Capture — Phase 2 (People Modes)

Date: 2026-02-20
Plan: dev/work/plans/slack-conversation-capture-phase-2/plan.md

---

### Risk 1: `refreshPersonMemory` and `findMentions` don't scan conversations

**Problem**: `EntityService.findMentions()` scans `context/`, `resources/meetings/`, `memory/items/` — not conversations. `refreshPersonMemory()` scans only `resources/meetings/`. After Phase 2, conversations will contain person signals but neither method will pick them up. Step 4's end-to-end ACs would silently fail.

**Mitigation**: Step 3 explicitly adds `resources/conversations/` to both methods. `collectSignalsForPerson()` is already content-based (regex) and works without changes on conversation content.

**Verification**: After implementation, `findMentions()` returns conversation files for a matching participant; `arete people memory refresh` picks up signals from a conversation mentioning a known person.

---

### Risk 2: No existing config tests — `config.test.ts` must be created from scratch

**Problem**: Zero test files for `config.ts`. Step 2 adds a new config field and the developer needs to mock `StorageAdapter` for YAML file reading — no existing pattern to follow in the config test layer.

**Mitigation**: Step 2 explicitly requires creating `packages/core/test/config.test.ts`. Reference patterns: `packages/core/test/integrations/calendar.test.ts` (getDefaultConfig usage) and `packages/core/test/services/workspace.test.ts` (StorageAdapter mocking).

**Verification**: New test file exists with coverage for: default value, workspace override, deepMerge nesting, missing/invalid YAML.

---

### Risk 3: Plan file overwritten by plan-mode system

**Problem**: The plan file was overwritten with a plan-mode summary during a session. The real plan content was only in git history.

**Mitigation**: Plan restored and committed. Pre-mortem now stored as a separate file (`pre-mortem.md`) so it won't be overwritten. Before starting build, verify `plan.md` has the full 5-step plan.

**Verification**: `head -5 dev/work/plans/slack-conversation-capture-phase-2/plan.md` shows YAML frontmatter with `steps: 5`.

---

### Risk 4: Default `ask` would harm zero-friction users

**Problem**: The original plan defaulted to `ask`, meaning every conversation capture ends with a prompt. The Harvester persona (zero-friction, mid-flow user) would encounter this as a blocking second gate and abandon the flow.

**Mitigation**: Default changed to `off` per Persona Council decision. Feature is opt-in via `arete.yaml`. Passive tip shown in confirmation (not on every capture) to aid discoverability for Architects who want it.

**Verification**: `getDefaultConfig().settings.conversations.peopleProcessing === 'off'`.

---

### Risk 5: "Always/never" in `ask` mode requires agent writing YAML

**Problem**: The original plan included "always"/"never" remember-choice options that would have the agent write back to `arete.yaml`. No existing pattern for agent-writes-YAML, and YAML serialization from chat is error-prone.

**Mitigation**: Simplified to yes/no per-run only in v1. Persistence deferred until `arete config set` CLI exists.

**Verification**: Skill instructions contain no steps where the agent modifies `arete.yaml`.

---

### Risk 6: `participant_ids` writeback needs post-save patch — two writes, one failure mode

**Problem**: People mapping runs after save (to guarantee save-first). Writing `participant_ids` back requires a second file write. If this second write fails, the file is saved but has no `participant_ids` — silently incomplete.

**Mitigation**: `updateConversationFrontmatter()` helper is explicit in Step 1 ACs. Helper must be graceful on failure (log, don't throw). Skill instructions treat writeback failure as non-fatal: conversation is already saved, people were mapped, only the frontmatter link is missing.

**Verification**: `updateConversationFrontmatter()` test covers: missing file (no-op), existing file (updates correctly), preserves all body content.

---

## Summary

Total risks: 6
Categories: Context Gaps (1, 3), Test Patterns (2), Scope Creep (4, 5), Integration (6)

All mitigations incorporated into plan steps. Ready to build.
