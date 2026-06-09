/**
 * arete events log — thin CLI wrapper over MemoryLogService.append for
 * agent-driven instrumentation (Phase 0).
 *
 * Subcommands:
 *   - `events log winddown --event start|end` (Phase 0) — daily-winddown
 *     timing.
 *   - `events log deferral-disagreement --item ... --source ... --reason ...`
 *     (Phase 3.5 D3) — chef detected the user pulled back a deferred
 *     item. Wraps `MemoryLogService.appendItemFate` with fate
 *     `deferral_disagreement`.
 *
 * Adding more event types later is a matter of adding subcommands;
 * grammar enforcement and append atomicity live in core.
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
export interface DeferralDisagreementOptions {
    item?: string;
    source?: string;
    reason?: string;
    /** ISO-8601 timestamp at which the user pulled the item back. Optional. */
    pulledBackAt?: string;
    /** Item kind (action_item | decision | learning). Defaults to 'action_item'. */
    kind?: 'action_item' | 'decision' | 'learning';
    json?: boolean;
}
/**
 * Phase 3.5 D3 — append a `deferral_disagreement` event to
 * `.arete/memory/item-fates.jsonl`. Triggered when the chef detects
 * that the user pulled a previously-deferred item back from the
 * sidecar (D2 wiring).
 *
 * Required: `--item <text>`, `--source <sidecar-path>`,
 * `--reason <original-reason>`. Optional: `--kind`, `--pulled-back-at`.
 */
export declare function runDeferralDisagreementLog(opts: DeferralDisagreementOptions, deps?: EventsCommandDeps): Promise<void>;
export interface BackfillItemFatesOptions {
    since?: string;
    /** Optional clock override (used to interpret relative `--since` values). */
    json?: boolean;
}
/**
 * Phase 3.5 D4 — scan approved meeting frontmatters in a window and
 * emit `item_fate` events for each item that lives in the body's
 * `## Approved Action Items / Decisions / Learnings` sections but is
 * NOT yet recorded in `item-fates.jsonl`. Idempotent (won't double-
 * emit). Recovery primitive for any future event-write gap.
 *
 * `--since <date>` accepts:
 *   - ISO date `YYYY-MM-DD`
 *   - Relative `Nd` (last N days)
 *   - Relative `Nw` (last N weeks)
 */
export declare function runBackfillItemFates(opts: BackfillItemFatesOptions, deps?: EventsCommandDeps): Promise<{
    scanned: number;
    alreadyRecorded: number;
    emitted: number;
    meetingsTouched: string[];
}>;
/**
 * Parse `--since`. Accepts `YYYY-MM-DD`, `Nd`, `Nw`. Returns the
 * resulting Date (UTC midnight) or null on parse error.
 */
export declare function parseSinceDate(raw: string, now: Date): Date | null;
export declare function registerEventsCommand(program: Command, deps?: EventsCommandDeps): void;
//# sourceMappingURL=events.d.ts.map