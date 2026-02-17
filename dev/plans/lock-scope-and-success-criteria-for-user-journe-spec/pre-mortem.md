# Pre-Mortem: Template Architecture + GUIDE.md Shipping

Triggered: 2026-02-17T11:30:00.000Z

---

### Risk 1: Install never copies templates — they don't exist in user workspaces

**Problem**: `sourcePaths.templates` is wired up and passed to `workspace.create()`, but the code never actually copies anything from it. The `create-prd` SKILL.md references `templates/outputs/prd-simple.md` etc. — paths that don't exist in user workspaces today. Moving templates to skill-local directories won't help if they're still not being copied.

**Mitigation**: Add an explicit template copy step to `workspace.create()` (mirroring the skills copy loop). Do this as the first code change so the rest of the plan builds on a working foundation.

**Verification**: Install a workspace into a temp directory and confirm `templates/` is populated with default files.

---

### Risk 2: Backward compatibility — existing workspaces have templates at old paths

**Problem**: `create-prd` SKILL.md currently references `templates/outputs/prd-simple.md`. After we move templates to `skills/create-prd/templates/` and update the SKILL.md, `arete update` will ship the new SKILL.md — but existing user workspaces still have templates at the old path and nothing at the new skill-local path. The skill will reference templates that don't exist.

**Mitigation**: The resolution order is the safety net: workspace override → skill-local → **legacy `templates/outputs/` fallback**. Keep the old `templates/outputs/` files in `packages/runtime/templates/outputs/` and continue shipping them. Only remove the legacy path in a future breaking release. Document this explicitly in the SKILL.md resolution instructions.

**Verification**: Test resolution when only the legacy path exists — should fall back cleanly with no error.

---

### Risk 3: GUIDE.md is never shipped to user workspaces

**Problem**: `generateRootFiles()` only generates `AGENTS.md`. `GUIDE.md` exists in `packages/runtime/` but is never copied during `install` or `update`. Users have no GUIDE.md.

**Mitigation**: Add GUIDE.md to the install flow — read from `packages/runtime/GUIDE.md` at install time and write to workspace root. Add backfill to `update` (only if file doesn't exist, to avoid clobbering). This is a straightforward file copy, not architecture.

**Verification**: Install a workspace and confirm `GUIDE.md` exists at root. Run `arete update` on an existing workspace without GUIDE.md and confirm it's backfilled. Run update on a workspace with a user-modified GUIDE.md and confirm it's preserved.

---

### Risk 4: "Without clobbering" policy is undefined — leading to inconsistent behavior

**Problem**: The plan says update should "backfill missing files without clobbering user-customized files." Without an explicit policy, we could accidentally overwrite user content OR never update files that need updating. We have no checksum mechanism.

**Mitigation**: Define the policy explicitly upfront — **only backfill if the file doesn't exist**. No content comparison, no checksums. Document this as the behavior contract in tests and code comments. For GUIDE.md and skill templates, "exists = preserved." Future releases can add checksum-based update if needed.

**Verification**: Tests explicitly cover "update does NOT overwrite existing GUIDE.md" and "update DOES write GUIDE.md when absent."

---

### Risk 5: Resolution logic lives in TypeScript but agents read SKILL.md

**Problem**: `create-prd` is followed by an AI agent reading `SKILL.md` instructions — not TypeScript code. If we build a `resolveTemplate()` TypeScript function but don't update the SKILL.md to reflect the new resolution order, agents will still hardcode the old path. The TypeScript resolution function is irrelevant unless the agent is told to call it OR the SKILL.md references the new paths correctly.

**Mitigation**: Update SKILL.md to include explicit resolution instructions in plain language: "Look for template in order: (1) `templates/outputs/create-prd/[variant].md`, (2) `.agents/skills/create-prd/templates/[variant].md`, (3) `templates/outputs/[variant].md` (legacy fallback)." The TypeScript `resolveTemplate()` function serves programmatic callers; SKILL.md serves agents. Both need updating.

**Verification**: Confirm SKILL.md template selection section references all three paths in priority order.

---

### Risk 6: Scope creep on `arete.yaml` template default key

**Problem**: The plan mentions `arete.yaml` for optional default template selection. This is low-priority and easy to over-engineer — adding config parsing, validation, and fallback logic for a feature that may not be needed yet.

**Mitigation**: Explicitly descope `arete.yaml` template key from this implementation. The resolution system works without it (variant selection stays in SKILL.md as it is today). Add a backlog item for `arete.yaml` template config if it becomes necessary.

**Verification**: No `arete.yaml` template parsing code is added in this implementation.

---

### Risk 7: Missing test patterns for workspace service

**Problem**: Install/update backfill tests touch `WorkspaceService` internals. Without reviewing existing test patterns first, new tests may not follow conventions — wrong mock patterns, wrong assertion style, or testing the wrong layer.

**Mitigation**: Before writing a single test, read `packages/cli/test/integration/install-update.integration.test.ts` and mirror its sandbox + helpers pattern for install/update tests. New tests live in that file.

**Verification**: New tests pass alongside existing ones (`npm test`). Sandbox is a real temp directory (integration-style), not mocked filesystem.

---

## Summary

**Total risks identified**: 7
**Categories covered**: Integration, Backward Compatibility, Scope Creep, Platform (agent vs. code), Test Patterns, Behavior Contract

**Highest priority mitigations before writing code**:
1. Confirm and fix install's template copy gap (Risk 1)
2. Define and document "backfill if absent" policy explicitly (Risk 4)
3. Update SKILL.md alongside TypeScript changes (Risk 5)
