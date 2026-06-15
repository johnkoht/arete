/**
 * `arete plan-context` — plan-context aggregator (WS-2/WS-3,
 * plan-context-injection).
 *
 *   - `--week` — all active projects (recency-ranked) + active topics + goals
 *     crosswalk + last week's `now/week.md`.
 *   - `--day`  — same schema, scoped to today's areas (areas-of-today), with a
 *     recently-active fallback so the bundle is never silently empty (R13).
 *
 * THIN SHELL (pre-mortem R6): this command performs ZERO body parsing — no
 * `parseFrontmatter` on project READMEs, no `## ` heading regex, no
 * `readFileSync` of project docs. All composition (selectProjectDocs +
 * assembleProjectWhatsNew + getActiveTopics + last-week read + openQuestions
 * extraction) lives in `IntelligenceService.assemblePlanContext` (core). The
 * `--json` shape is the skill-consumer contract (snapshot-tested).
 *
 * Conventions per packages/cli/src/commands/LEARNINGS.md: findRoot guard,
 * `--json` complete in all exit paths, formatters.ts helpers. Pure read — no
 * writes, no qmd refresh.
 */
import { Command } from 'commander';
export declare function registerPlanContextCommand(program: Command): void;
//# sourceMappingURL=plan-context.d.ts.map