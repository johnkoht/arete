# Ship Skill — Learnings

## Gotchas

- **Stay in current terminal, don't launch new windows** (2026-03-26): The original design launched a new iTerm/Terminal window for the worktree via osascript. This was overly complex (platform detection, permission checks, fallback handling) and fragile (Automation permissions, iTerm vs Terminal.app). Simpler: just `cd` to the worktree in the current session. The worktree isolation comes from git, not from terminal separation.

- **Interactive prompts prevent "walk away and forget"** (2026-03-26): If the skill completes autonomously while the builder is away, they return to a wall of text with "Next Steps" buried in it. Adding an interactive prompt at the end ("Ready to merge?") ensures the builder engages with the completion state and doesn't forget to merge/cleanup.

- **Use /wrap for verification, don't duplicate checks** (2026-03-26): The plan-mode extension already has `/wrap` which verifies memory entry exists, MEMORY.md is updated, LEARNINGS.md reviewed, etc. Rather than reimplementing these checks in the ship skill, just invoke `/wrap` and parse its output.

## Invariants

- **Phase 5.6 must wait for builder input**: The merge prompt is intentionally blocking. Do not auto-merge or timeout — the builder needs to consciously decide to merge or defer.

- **Phase 6 cleanup requires merge verification**: Before deleting a branch, always check if it's merged to main. If not merged, require explicit confirmation with branch name typed out.

## Patterns

- **Gate decisions follow severity hierarchy**: CRITICAL → pause, HIGH → proceed with note, MEDIUM/LOW → proceed silently. See `orchestrator.md` for the full decision matrix.

- **Interactive prompts use consistent format**: Options presented as `[M] Merge`, `[R] Review`, `[L] Leave` with single-letter shortcuts.

## Anti-Patterns

- **Don't launch external processes for simple tasks**: osascript to launch terminals added complexity without proportional value. Prefer in-process solutions.

- **Don't bury action items in report text**: Important next steps should be interactive prompts, not prose that gets scrolled past.

## References

- [SKILL.md](./SKILL.md) — Full workflow documentation
- [orchestrator.md](./orchestrator.md) — Gate decision matrix and orchestrator behavior
- [templates/ship-report.md](./templates/ship-report.md) — Report template
