# Agent Experts — Discussion Topics

All topics resolved. See decisions summary below.

---

## Resolved Decisions Summary

| # | Topic | Decision |
|---|-------|----------|
| 1 | Duplication problem | Single source of truth per concern. APPEND_SYSTEM.md → planner context (~80-100 lines). New `build-standards.md` for coding/testing/review (subagents only). Delete `conventions.md`. |
| 2 | `.agents/sources/` location | Stays for GUIDE pipeline. BUILD sources (`builder/`) deleted. Root AGENTS.md hand-written. |
| 3 | `.cursor/rules/` strategy | Delete at end of work (not used for BUILD, pi only). |
| 4 | AGENTS.md restructuring | Hand-written planner context. No generation pipeline for BUILD. Vision, expertise awareness, skills index, memory refs. No coding standards. |
| 5 | Profile loading mechanism | 4-layer subagent stack: AGENTS.md + build-standards.md + role.md + expertise PROFILE.md. Agents dig deep via tools (read, LSP, grep). |
| 6 | Cross-cutting work | Profiles cross-reference each other. Experts not siloed. Can read any profile. |
| 7 | Phase 0 consolidation | Folded into broader restructuring. |
| 8 | Minimum viable profile | ~200-250 line PROFILE.md per area. Single file with: purpose, architecture, component map (what each service/module does), invariants, anti-patterns, required reading, cross-references, LEARNINGS.md locations. Start thorough, dial back if too much. |
| 9 | Validation test | Smoke test document with prompts for each agent type. Tests: experts know their domain, planner routes instead of answering, developers reference correct files. Static validation too (files exist, no broken pointers, no content duplication). Written at end of project. |

## Additional Decisions (from workflow discussion)

| Decision | Detail |
|----------|--------|
| Workflow model | Steps 1-7: Init → Planning → Technical Assessment → Pre-mortem → Review → Build → Close |
| Context isolation | Subagents provide context compression. Planner accumulates conclusions, not raw material. |
| Profiles as maps | Profiles orient agents WHERE to look and WHAT matters. Agents dig deep via tools. |
| Self-improving docs | Step 7 (Close): experts reflect, update LEARNINGS.md, flag profile issues. Light maintenance every run, dedicated maintenance for structural changes. |
| `build-standards.md` | One file to start. Split only if >500 lines. |
| `.agents/sources/` | GUIDE pipeline stays (produces dist/AGENTS.md for npm package). BUILD pipeline removed. |
