/**
 * `arete winddown apply <date>` — winddown approval-doc apply mapper (W3).
 *
 * Reads the saved approval doc + the persisted agent baseline, builds the apply
 * plan (parse → anchor map → diff → classify), prints the CONFIRM SUMMARY, and
 * on `y` executes via EXISTING primitives:
 *   - meeting items → `writeItemStatusToFile` + `commitApprovedItems`
 *   - `act:resolve:<id>` → `commitments.resolve` (R7 idempotency guard)
 *   - other actions (DM/Slack/email/jira/inbox) → drafted, NOT sent — the chef
 *     executes through MCP as today; the EDITED BODY flows through verbatim.
 *
 * Idempotent: re-apply over an already-applied day mutates nothing (meeting
 * already `status: approved` → commit no-ops; commitment already resolved →
 * R7 guard).
 */
import type { Command } from 'commander';
/** Persist the agent-rendered baseline alongside the archive (called at render time). */
export declare function baselinePath(now: string, date: string): string;
export declare function docPath(now: string, date: string): string;
export declare function registerWinddownCommand(program: Command): void;
//# sourceMappingURL=winddown.d.ts.map