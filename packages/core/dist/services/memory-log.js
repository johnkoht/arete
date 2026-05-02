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
import { join } from 'node:path';
import { formatEvent, nowIsoSeconds, } from '../utils/memory-log.js';
const LOG_RELATIVE_PATH = 'log.md';
const ITEM_FATES_RELATIVE_PATH = 'item-fates.jsonl';
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
    async appendItemFate(workspacePaths, event, options = {}) {
        const path = join(workspacePaths.memory, ITEM_FATES_RELATIVE_PATH);
        const ts = event.ts !== undefined && event.ts.length > 0
            ? event.ts
            : nowIsoSeconds(options.now);
        const record = {
            type: 'item_fate',
            ts,
            item_text: event.item_text,
            item_kind: event.item_kind,
            source_path: event.source_path,
            fate: event.fate,
            reason: event.reason,
            confidence: event.confidence,
            importance_at_extraction: event.importance_at_extraction,
        };
        const line = JSON.stringify(record) + '\n';
        if (this.storage.append !== undefined) {
            await this.storage.append(path, line);
            return;
        }
        const existing = await this.storage.read(path);
        const next = (existing ?? '') + line;
        await this.storage.write(path, next);
    }
}
//# sourceMappingURL=memory-log.js.map