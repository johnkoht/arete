# Wrap Soft Gate

## Problem

`/wrap` checks for documentation completeness (UPDATES.md, memory entry, etc.) but the output is advisory only. Plans can be marked complete with ❌ items ignored — nothing enforces the checklist.

Task-management plan shipped without UPDATES.md being updated, even though `/wrap` would have flagged it.

## Solution

Add soft gate at `/plan archive`:

1. Run wrap checks automatically when archiving
2. If any ❌ items, show checklist and prompt: "N items need attention. Archive anyway? [y/N]"
3. Support `--force` flag to skip the gate
4. All ✅ → archive normally

## Scope

- Modify `handleArchive()` in `commands.ts` to run wrap checks before archiving
- Add interactive prompt (y/N default no) when ❌ items present
- Add `--force` flag to bypass
- `/ship` pipeline should hit same gate at wrap step

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| `/plan archive --force` | Skip gate, archive anyway |
| `/plan archive` with ❌ | Interactive prompt, default N |
| `/ship` with ❌ at wrap | Pause pipeline, show checklist, ask to continue |
| Manual frontmatter edit | No gate (escape hatch) |

## Size

Small — mostly wiring existing wrap checks into archive flow.
