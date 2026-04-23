/**
 * Strict-grammar append-only log for `.arete/memory/log.md`.
 *
 * Grammar (one line per event):
 *
 *   ## [YYYY-MM-DDTHH:MM:SSZ] <event> | <k=v> <k=v> ...
 *
 * - Timestamp is ISO-8601 UTC (Z suffix), seconds precision.
 * - Event is a short kebab-case identifier from a known (but extensible) set.
 * - Key/value pairs are space-separated. Keys are [a-z_]+. Values are
 *   **URL-encoded** so they can safely contain pipes, spaces, newlines,
 *   or any UTF-8 content. Callers pass raw strings; the encoder handles
 *   escaping. This preserves the Karpathy-style `grep "^## \[" log.md`
 *   replay idiom even under adversarial LLM output.
 *
 * Multi-line details can follow under a fenced `<details>` block; those
 * never start with `## [` and are ignored by the grep-line scanner.
 *
 * Extensibility: `event` is a `string`, not a closed union — new event
 * kinds can land without touching this module. Validation happens at the
 * caller level (which fields are required per event is a policy, not a
 * grammar, concern).
 */
export interface LogEvent {
    timestamp: string;
    event: string;
    fields: Record<string, string>;
}
/**
 * Format a LogEvent as a single grep-friendly line (no trailing newline).
 * Throws on invalid event kind or key format — keep the grammar tight.
 */
export declare function formatEvent(event: LogEvent): string;
/**
 * Parse a single log line into a LogEvent. Returns null when the line
 * does not match the grammar (detail blocks, blank lines, preamble, etc).
 * Values are URL-decoded back to their raw form.
 */
export declare function parseEvent(line: string): LogEvent | null;
/**
 * Parse a full log file into all valid events, preserving chronological
 * order (as written). Non-event lines (header prose, detail blocks) are
 * skipped silently — the file IS the grep target.
 */
export declare function parseLog(content: string): LogEvent[];
/**
 * Compute the content to write when appending a new event. If the log
 * doesn't exist yet, starts with the grammar header. Otherwise appends
 * the new line(s) after existing content, preserving everything.
 *
 * Pure — no I/O. Caller invokes StorageAdapter.write.
 */
export declare function appendEvent(existingContent: string | null, event: LogEvent): string;
/**
 * Convenience for batch appending multiple events atomically (same
 * timestamp-ordering contract as single append).
 */
export declare function appendEvents(existingContent: string | null, events: LogEvent[]): string;
/**
 * Encode a value so it can appear in `k=v` form without breaking the
 * `## [ts] event | k=v k=v` grammar. Uses `encodeURIComponent` plus
 * additional escapes for characters it leaves alone that would still be
 * ambiguous in our grammar (space → %20 via encodeURIComponent; `|` and
 * `=` preserved by encodeURIComponent so we escape those manually).
 */
export declare function encodeValue(raw: string): string;
/**
 * Inverse of encodeValue. `decodeURIComponent` handles all encoded
 * forms; our encoder only emits percent-escapes.
 */
export declare function decodeValue(encoded: string): string;
/**
 * Build a timestamp at seconds precision. Accepts a Date for dependency
 * injection in tests.
 */
export declare function nowIsoSeconds(ref?: Date): string;
//# sourceMappingURL=memory-log.d.ts.map