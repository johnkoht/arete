/**
 * `arete project` command group (Phase 12).
 *
 *   - `arete project backfill-area` — AC2: propose (preview default) /
 *     `--apply` / `--reset` an `area:` on active projects missing one.
 *     Mirrors `arete commitments backfill-area` (preview-by-default,
 *     0.7 confidence floor, `area_set_by: backfill` provenance).
 *   - `arete project open <name>` — AC3: READ-ONLY open flow. Resolve
 *     name → slug (top-N disambiguation on tie, never auto-load), print
 *     the project brief + "what's new since last touched". Zero writes.
 *
 * Conventions per packages/cli/src/commands/LEARNINGS.md: findRoot guard,
 * `--json` complete in all exit paths, formatters.ts helpers,
 * refreshQmdIndex after workspace writes (+ `--skip-qmd`).
 */
import { Command } from 'commander';
export declare function registerProjectCommand(program: Command): void;
//# sourceMappingURL=project.d.ts.map