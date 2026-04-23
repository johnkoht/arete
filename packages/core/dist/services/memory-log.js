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
import { join } from 'node:path';
import { formatEvent, nowIsoSeconds, } from '../utils/memory-log.js';
const LOG_RELATIVE_PATH = 'log.md';
export class MemoryLogService {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
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
    async append(workspacePaths, event, options = {}) {
        const path = join(workspacePaths.memory, LOG_RELATIVE_PATH);
        const timestamp = event.timestamp !== undefined && event.timestamp.length > 0
            ? event.timestamp
            : nowIsoSeconds(options.now);
        const line = formatEvent({
            timestamp,
            event: event.event,
            fields: event.fields,
        }) + '\n';
        if (this.storage.append !== undefined) {
            await this.storage.append(path, line);
            return;
        }
        // Fallback for adapters without an atomic-append primitive. Safe
        // single-threaded; *not* safe under concurrent writers.
        const existing = await this.storage.read(path);
        const next = (existing ?? '') + line;
        await this.storage.write(path, next);
    }
}
//# sourceMappingURL=memory-log.js.map