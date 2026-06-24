# Pre-Mortem: Soak Logging (flag-gated usage log)

**Verdict:** PROCEED — no CRITICAL risks. Content-only change; the blast radius of every realistic failure is a lost/noisy data point, not a corrupted commit, dropped commitment, or altered user-facing behavior — *provided the flag-off gate holds*. The one thing that would block (a flag-off path that mutates state) does not exist in the design, contingent on the R1 fix.

## Risk table

| # | Risk | Rating | Mechanism | Mitigation |
|---|------|--------|-----------|------------|
| R1 | Hard-gate not actually first / phrased weakly → flag-off does work | HIGH | A SKILL.md ref that says "as the final step, apply Usage Logging" unconditionally sends the agent into the pattern; it may `mkdir dev/soak/` before reaching the STOP gate inside PATTERNS.md. | Carry the gate in the ref line itself: "If `usage_log` is true in arete.yaml, after the final report apply **Usage Logging** (PATTERNS.md § Usage Logging); otherwise do nothing." Gate is the literal first sentence of the pattern. No dir creation before the gate. |
| R2 | Weaker model skips/mangles the append (finding-#15 mode, recursively) | HIGH | The capture step is itself an agent instruction; a Sonnet drop is both the failure the feature exists to catch AND the failure that makes capture not happen. | Accept for v1. Make the entry self-incriminating (model writes its own tier, so a Sonnet run that logs says "Sonnet" loudly). Tier 3 (deterministic `arete usage-log append`) gated on observed drift. |
| R3 | Skip-if-exists sync drift — canonical edited later, workspace `cp` forgotten | HIGH | `workspace.ts:273-307` skips both subdirs and root `.md` when dest exists; the four files already exist in the workspace, so no automated path ever propagates a later edit. Soak then generates data from prose that no longer exists in canonical. | `/soak-review` diffs workspace copies vs canonical and flags drift before trusting the log. |
| R4 | Entry-format fields filled inconsistently across runs/skills | MEDIUM | Free-text; "Config"/"Commands"/"Anomalies" have no schema; the three skills have different primitives. | Mandate the bold labels; require every field present (use `· —` for empty) so every entry has the same shape; keep counts human-readable. |
| R5 | Reference line fires mid-skill or is ignored | MEDIUM | daily-winddown is 2072 lines; a line dropped in its trailing `## References`/`## Rollback` is documentation, never an executed step. The real workflow ends at the report step far above. | Anchor the ref as an explicit terminal step after each skill's always-run *report* step ("After the final report, …"); never in References/Rollback. project-exit: as Step 7 / part of always-run Step 6 (survives the silent fast-path). |
| R6 | `dev/soak/` lands in wrong repo / gets committed | MEDIUM | Agent-written relative path could resolve from wrong CWD; entries name people/commitments. | Pattern specifies an absolute, workspace-root-anchored path. Verify `dev/` is gitignored in arete-reserv as part of the flag-on smoke check. |
| R7 | soak-review harness location unresolved (.pi vs native) | MEDIUM | Port pending; a `.pi/` skill could be orphaned mid-soak. | Author capture (Tier 1) and review (Tier 2) as separable commits; capture has standalone value (logs readable by hand). |
| R8 | Log unbounded growth | LOW | Append-only per feature. | Fine for v1 (reset after review); per-week sub-headers later. |

## Folded into the build
1. **R1** — gate as literal first sentence of `## Usage Logging` AND restated in each SKILL.md ref line; no `mkdir` before the gate.
2. **R5** — anchor each ref line to the skill's always-run report step, after it; never in References/Rollback.
3. **R3** — `/soak-review` diffs live workspace copies against canonical before trusting the log.
4. **R6** — verify `dev/` is gitignored in arete-reserv in the flag-on smoke check.
5. **R4** — labeled template, every field present (`· —` for empty), bold labels mandatory.
6. Inert-off smoke check recorded as an explicit pass/fail in the build log.
