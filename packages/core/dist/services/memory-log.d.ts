/**
 * MemoryLogService — single writer-of-record for `.arete/memory/log.md`
 * and `.arete/memory/item-fates.jsonl`.
 *
 * Wraps the pure `utils/memory-log` grammar with an atomic-append primitive
 * so concurrent refreshes (e.g., `arete memory refresh` + `arete meeting
 * apply` in parallel) never drop events.
 *
 * Grammar and event kinds for `log.md` are defined in `utils/memory-log.ts`.
 * New callers (Step 8 seed, Step 9 CLAUDE.md regen) use this service rather
 * than reinventing the read-modify-write dance.
 *
 * Item-fate events ship as JSONL — one JSON object per line — at
 * `.arete/memory/item-fates.jsonl`. Phase 0 instrumentation; consumed by
 * later phases (cost reports, baseline distributions).
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/workspace.js';
import { type LogEvent } from '../utils/memory-log.js';
export interface AppendLogOptions {
    /**
     * Optional clock override for tests. Defaults to real time via
     * `nowIsoSeconds()`.
     */
    now?: Date;
}
/**
 * Item kinds tracked in the fate log. Mirrors the three extracted-item
 * categories already produced by the extraction pipeline.
 */
export type ItemFateKind = 'action_item' | 'decision' | 'learning';
/**
 * Terminal states for an item observed by Phase 0 instrumentation. A staged
 * item lands in exactly one of these on each pass.
 *
 * - `approved`: committed to memory (decision/learning) or marked task-tracked (action).
 * - `dismissed`: silently merged or dropped because already-known (duplicate/matched).
 * - `skipped`: visibly marked as skipped to the user (matched a completed/open task).
 * - `deferred`: reserved for Phase 2's deferred-tier surface; not emitted by Phase 0.
 */
export type ItemFate = 'approved' | 'dismissed' | 'skipped' | 'deferred';
/**
 * Importance taxonomy as written by the extraction pipeline. Tracked at
 * extraction time so the fate log captures the signal even when later
 * phases drop or rename it.
 */
export type ItemFateImportance = 'light' | 'normal' | 'important' | 'skip';
export interface ItemFateEvent {
    type: 'item_fate';
    /** ISO-8601 UTC seconds. Stamped automatically when omitted. */
    ts?: string;
    /** Verbatim text of the staged item at fate-time. */
    item_text: string;
    item_kind: ItemFateKind;
    /** Workspace-relative or absolute path of the source meeting/note file. */
    source_path: string;
    fate: ItemFate;
    /**
     * Free-form short tag. Examples: `low_priority`, `duplicate`, `user_skip`,
     * `matched_completed`, `matched_open_task`. `null` when no reason applies.
     */
    reason: string | null;
    /** Confidence score recorded at extraction (0–1) when known. */
    confidence: number | null;
    /** Importance assigned at extraction time when the meeting carried one. */
    importance_at_extraction: ItemFateImportance | null;
}
export interface AppendItemFateOptions {
    /** Optional clock override for tests. */
    now?: Date;
}
export declare class MemoryLogService {
    private readonly storage;
    constructor(storage: StorageAdapter);
    /**
     * Append a single event to `.arete/memory/log.md`.
     * Atomic under concurrent writers when the adapter implements
     * `append` (FileStorageAdapter does — uses POSIX O_APPEND).
     * Falls back to read-modify-write when not — acceptable for tests
     * and in-memory adapters where concurrency is not a concern.
     *
     * If `event.timestamp` is not set (`''` or missing), stamps it with
     * `nowIsoSeconds(options.now)`.
     */
    append(workspacePaths: WorkspacePaths, event: Omit<LogEvent, 'timestamp'> & {
        timestamp?: string;
    }, options?: AppendLogOptions): Promise<void>;
    /**
     * Append a single item-fate event to `.arete/memory/item-fates.jsonl`.
     *
     * Each event is one line of JSON terminated by `\n`. Atomic under
     * concurrent writers when the adapter implements `append` (POSIX
     * O_APPEND). Falls back to read-modify-write otherwise.
     *
     * `event.ts` is stamped via `nowIsoSeconds(options.now)` when omitted
     * or empty so callers don't have to manage timestamps. Newlines inside
     * `item_text` are escaped by `JSON.stringify` so a single event always
     * occupies exactly one line — load-bearing for `grep`/`jq`-based
     * downstream tooling.
     */
    appendItemFate(workspacePaths: WorkspacePaths, event: Omit<ItemFateEvent, 'type' | 'ts'> & {
        ts?: string;
    }, options?: AppendItemFateOptions): Promise<void>;
}
//# sourceMappingURL=memory-log.d.ts.map