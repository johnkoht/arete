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
export declare function registerEventsCommand(program: Command, deps?: EventsCommandDeps): void;
//# sourceMappingURL=events.d.ts.map