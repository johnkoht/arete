# Audit Skill — Learnings

Patterns and gotchas discovered through audit runs.

---

## Gotchas

- **BUILD vs GUIDE docs** (2026-03-28): `CHANGELOG.md` is for BUILD (internal dev changes), `UPDATES.md` is for GUIDE (user-facing changes). The docs domain should audit both but understand the audience distinction.

- **Subagents read their own profiles** (2026-03-28): Don't inject expertise profiles into subagent prompts. Instead, reference the profile path and let the subagent read it. Keeps orchestrator.md lean (~250 lines vs ~500 lines).

## Patterns

- **Approval gate UX**: Use `[Y] Apply all [N] Skip all [1,2,3] Select items` for consistent approval flows. Save skipped items to `{date}-deferred.md`.

- **Manifest-driven audits**: Define what to check in `manifest.yaml` with glob patterns. Easier to maintain than hardcoded file lists in orchestrator.md.

## Anti-Patterns

- **Injecting full profiles into orchestrator**: Makes the file huge and hard to maintain. Reference profiles instead.

## References

- [SKILL.md](./SKILL.md) — Triggers, flags, workflow
- [orchestrator.md](./orchestrator.md) — Domain dispatch logic
- [manifest.yaml](./manifest.yaml) — What to audit per domain
