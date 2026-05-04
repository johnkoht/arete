/**
 * arete events log — thin CLI wrapper over MemoryLogService.append for
 * agent-driven instrumentation (Phase 0).
 *
 * Today the only subcommand is `events log winddown --event start|end`,
 * called from the daily-winddown skill prose. Adding more event types
 * later is a matter of adding subcommands; the grammar enforcement and
 * append atomicity already live in core.
 */
import type { Command } from 'commander';
export type WinddownEventName = 'start' | 'end';
export interface WinddownEventOptions {
    event?: WinddownEventName;
    json?: boolean;
}
export interface EventsCommandDeps {
    /** Optional clock override for tests. */
    now?: Date;
}
export declare function runWinddownEventLog(opts: WinddownEventOptions, deps?: EventsCommandDeps): Promise<void>;
export interface SlackEvalCliOptions {
    thread?: string;
    messages?: string;
    participants?: string;
    decision?: boolean;
    userFlag?: boolean;
    json?: boolean;
}
/**
 * Run the slack-thread heuristic and append the result to
 * `.arete/memory/log.md` as a `slack_thread_eval` event. During the
 * 7-day shadow run (Phase 1 ship), the writer is gated by
 * ARETE_SLACK_SUMMARIES — this command logs the WOULD-decision
 * regardless, so John can spot-check false-pos / false-neg rates.
 *
 * The slack-digest skill calls this once per thread it processes.
 */
export declare function runSlackThreadEval(opts: SlackEvalCliOptions, deps?: EventsCommandDeps): Promise<void>;
export declare function registerEventsCommand(program: Command, deps?: EventsCommandDeps): void;
//# sourceMappingURL=events.d.ts.map