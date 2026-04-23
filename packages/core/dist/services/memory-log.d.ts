/**
 * MemoryLogService — single writer-of-record for `.arete/memory/log.md`.
 *
 * Wraps the pure `utils/memory-log` grammar with an atomic-append primitive
 * so concurrent refreshes (e.g., `arete memory refresh` + `arete meeting
 * apply` in parallel) never drop events.
 *
 * Grammar and event kinds are defined in `utils/memory-log.ts`. New callers
 * (Step 8 seed, Step 9 CLAUDE.md regen) use this service rather than
 * reinventing the read-modify-write dance.
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
}
//# sourceMappingURL=memory-log.d.ts.map