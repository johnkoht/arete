# wrap / finalize-project reconcile + skill-router common-word over-matching (2026-06-14)

WS-3 of `dev/work/plans/project-wiki-sync-followups`. Reconciled the `wrap` and
`finalize-project` runtime skills so they stop routing on top of each other, and
fixed three scorer bugs in `packages/core/src/services/intelligence.ts`
(`scoreMatch`) that were the actual cause of the mis-routing.

## The collision was NOT wrap-vs-finalize

The isolated eng-lead analysis assumed the conflict was `wrap` vs
`finalize-project` and reasoned about a two-skill subset. Routing the queries
against the **full** candidate set told a different story: the read-only
`project` skill (id = `project`, a common word; its `/project` trigger
tokenizes to bare `["project"]`) was shadowing `finalize-project` on
"finalize/complete/archive *project*" queries. You cannot diagnose a router by
scoring two hand-picked skills — an id-token as generic as "project" or "week"
collides with skills you didn't think to include.

**LESSON: route against the full candidate set, not a curated subset. Every
scorer change must run the full per-skill sweep.**

## Three scorer bugs

1. **Substring id-match.** `id.includes(token)` meant the id `week plan` matched
   the query token `we` ("we"∈"week"). Now id matches by TOKEN EQUALITY:
   `idTokens.some(it => qTokenSet.has(it))`. An id token only fires if the query
   contains that exact token.

2. **Dashified bonus inverted.** The old `q.replace(/\s+/g,'-').includes(id)`
   compared a dash-joined query against a SPACE-separated id, so it only ever
   matched single-word ids (no space to dashify) — exactly the case it shouldn't
   reward, and `project` was scoring a spurious +15. Now: fire only for genuine
   multi-word ids, compared dash-to-dash (`id.includes(' ') && qDash.includes(dashId)`).

3. **Flat trigger weight.** Every trigger match scored a flat +18, so one
   generic single-word trigger (`/project` → `["project"]`) tied a precise
   multi-token phrase. Now weighted by specificity. Principled hierarchy:

   - explicit multi-token trigger = **22** (strongest intent signal)
   - id mention = **20**
   - single-token trigger = **10**
   - description overlap = lower

   So an explicit phrase ("finalize project") beats an incidental id-token
   overlap, and a generic single-word trigger can't masquerade as intent.

## YAML colon gotcha (skills frontmatter)

`readSkillFrontmatter` (`packages/core/src/services/skills.ts`) runs `parseYaml`
on the whole frontmatter block inside a try/catch that returns `{}` on any
error. An UNQUOTED `description:` containing a colon (e.g.
`description: Close out completed work: assess outcomes`) is invalid YAML
(mapping-value-not-allowed) → the catch swallows the ENTIRE frontmatter to `{}`,
SILENTLY. The skill then has no triggers/work_type and `getInfo` falls back to
routing on `id = basename(path)` only — no error anywhere.

**Always quote any `description:` (or other value) that contains a colon.**
`wrap`'s re-scoped description is quoted for exactly this reason.

## Structural-over-advisory

`wrap` step 6 now STRUCTURALLY refuses to archive `projects/active/` dirs and
redirects to `finalize-project` (plus a step-1 hand-off nudge). Advisory prose
alone ("prefer finalize-project for projects") would not close the
divergent-archive hole — an agent under instruction pressure can still produce a
lightweight retro + ad-hoc archive that diverges from the real finalize
ceremony. The refusal is in the skill body, not just guidance.

## Residual

`weekly-winddown` beats `week-plan` by only **+2** on its "week" triggers — these
are genuinely ambiguous queries and the router has NO tie-break surface (pure
argmax, floor < 4 in `routeToSkill`). Acceptable for now. A future robustness
pass could add an exact-contiguous-phrase bonus so a literal trigger phrase wins
ties.

## Verification

5 target queries route correctly ("finalize project" / "complete this project" /
"archive this project" → finalize-project; "wrap up" / "what did we learn" →
wrap); 4 weekly-winddown regressions fixed; 17 cross-skill leaks fixed; ZERO new
regressions; router + core tests green (4052 core).
