# Persona Council — PRD Execution Learnings

**Date**: 2026-02-19
**PRD**: persona-council
**Tasks**: 3/3 complete | 0 iterations | 0 risks materialized
**Commits**: 0 (no code changes — docs and config only)
**Quality gates**: typecheck ✅ | tests ⚠️ pre-existing esbuild x64/arm64 environment issue, unrelated to this work

---

## What Was Built

Introduced a Persona Council to the Arete BUILD MODE planning system: three behavioral archetypes (Harvester, Architect, Preparer) representing GUIDE MODE end users. Wired into:
- `.pi/agents/product-manager.md` — PM agent offers council check for user-facing features
- `AGENTS.md` — `[Personas]` block in always-loaded context, visible to all BUILD agents
- `dev/personas/PERSONA_COUNCIL.md` — full persona definitions
- `dev/personas/COUNCIL_INSTRUCTIONS.md` — operating manual with decision policy

---

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|---|---|---|---|
| PM agent prompt bloat | No | Yes — kept to 9 lines | Yes |
| Cursor rule trigger scope wrong | N/A — Cursor rule dropped from scope | — | — |
| AGENTS.md format mismatch | No | Yes — read source format first, verified with grep | Yes |
| Personas drift to fiction | No — addressed structurally | Yes — Evidence sections labeled hypothesis-only | Yes |
| Council check becomes rote | No — addressed in wording | Yes — "offer" framing + scoped trigger | Yes |

0/5 risks materialized. 2 were mitigated structurally through content decisions. 1 was removed from scope (Cursor rule).

---

## What Worked Well

**Pre-mortem shaped the content decisions directly.** Both highest-severity risks (drift to fiction, rote overhead) were about content quality, not technical execution. Having them identified before writing meant the personas.md and PM agent section were written with those risks explicitly in mind — not patched afterward.

**Dropping Cursor rules was the right call.** The user correctly identified that Cursor agent workflow isn't the current direction. Removing that step reduced scope by one task and eliminated one of the pre-mortem risks entirely. Good scope decision during planning.

**No tables in persona files.** Writing for machine consumption (prose and flat lists) rather than human readability produced cleaner, more scannable content for agents. The decision policy as flat key: value pairs is more token-efficient than a markdown table.

**build-agents.ts requires explicit registration.** The script's `getConfig()` function hardcodes source files — no auto-discovery. Adding `builder/personas.md` required updating the `builderFiles` array. This is a pattern to remember for future AGENTS.md source additions.

---

## Environment Issue to Resolve

`npm run build:agents:dev` and `npm test` fail due to esbuild x64/arm64 platform mismatch (esbuild installed for darwin-x64, machine runs darwin-arm64). This is pre-existing — not caused by this PRD.

Workaround for build script: `node --experimental-strip-types scripts/build-agents.ts dev`

**The builder should fix this separately**: `npm install` or reinstalling esbuild for arm64 should resolve it. All tsx-based commands are currently broken in this environment.

---

## Learnings

**Docs-only PRDs can move very fast.** No tests to write, no compilation, no type system to satisfy. The planning overhead (pre-mortem, PRD, prd.json) was proportionally large relative to the actual implementation time. For future docs-only or config-only work, consider whether the full PRD execute loop is warranted or if direct execution is more appropriate.

**The PM agent section placement matters.** Inserting Persona Council as `### 4.` under `## Your Responsibilities` (between Product Pre-Mortem and PRD Creation) places it exactly where it's needed — after the builder has committed to working on a feature but before they've locked requirements. The ordering is intentional.

**Evidence sections built in from day one.** Starting with empty Evidence sections labeled "hypothesis-based" creates the habit structure before there's any data to put in them. If the sections weren't there, they'd never get added. The council will improve in quality as dogfooding observations and user feedback accumulate.

---

## Recommendations

Continue:
- Dropping scope during planning when a step doesn't fit the current direction (Cursor rule removal was clean)
- Writing personas/instructions for machine consumption, not human readability
- Explicit pre-mortem before any new "meta-process" tool (risk of rote overhead is always there)

Start:
- Populating Evidence sections in `dev/personas/PERSONA_COUNCIL.md` as dogfooding observations accumulate
- Running a council check on the next GUIDE MODE feature being planned (Slack integration is the pending one)
- Fixing the esbuild platform issue so `npm test` and `npm run build:agents:dev` work normally

Stop:
- Running full PRD execute loop for docs-only or config-only work of this size — plan → direct execute is faster and lower overhead
