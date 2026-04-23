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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEvent {
  timestamp: string;           // ISO-8601 UTC, seconds precision
  event: string;               // kebab-case event kind
  fields: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const HEADER = `# Memory Log

> Auto-generated append-only log of memory operations. Each line is
> grep-parseable with prefix \`## [\`. Values are URL-encoded so pipes
> and newlines in payloads do not break the grammar.

`;

const EVENT_LINE_RE = /^## \[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\] ([a-z][a-z0-9-]*)(?: \| (.*))?$/;

const KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Format a LogEvent as a single grep-friendly line (no trailing newline).
 * Throws on invalid event kind or key format — keep the grammar tight.
 */
export function formatEvent(event: LogEvent): string {
  if (!/^[a-z][a-z0-9-]*$/.test(event.event)) {
    throw new Error(`Invalid event kind: "${event.event}" — must be kebab-case starting with a letter`);
  }
  if (!isIsoUtcSeconds(event.timestamp)) {
    throw new Error(`Invalid timestamp: "${event.timestamp}" — must be YYYY-MM-DDTHH:MM:SSZ`);
  }

  const parts: string[] = [`## [${event.timestamp}] ${event.event}`];

  const keys = Object.keys(event.fields).sort();
  if (keys.length > 0) {
    const kv = keys
      .map((k) => {
        if (!KEY_RE.test(k)) {
          throw new Error(`Invalid log field key: "${k}"`);
        }
        const raw = event.fields[k];
        return `${k}=${encodeValue(raw)}`;
      })
      .join(' ');
    parts.push(kv);
  }

  return parts.join(' | ');
}

/**
 * Parse a single log line into a LogEvent. Returns null when the line
 * does not match the grammar (detail blocks, blank lines, preamble, etc).
 * Values are URL-decoded back to their raw form.
 */
export function parseEvent(line: string): LogEvent | null {
  const match = EVENT_LINE_RE.exec(line);
  if (!match) return null;

  const [, timestamp, event, kvPart] = match;
  const fields: Record<string, string> = {};

  if (kvPart !== undefined && kvPart.length > 0) {
    // Split on single spaces — values are URL-encoded so they never contain raw spaces
    for (const pair of kvPart.split(' ')) {
      if (pair.length === 0) continue;
      const eq = pair.indexOf('=');
      if (eq < 0) continue;       // malformed token; skip conservatively
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (!KEY_RE.test(key)) continue;
      try {
        fields[key] = decodeValue(value);
      } catch {
        // Malformed URL encoding — skip this field but keep the rest
      }
    }
  }

  return { timestamp, event, fields };
}

/**
 * Parse a full log file into all valid events, preserving chronological
 * order (as written). Non-event lines (header prose, detail blocks) are
 * skipped silently — the file IS the grep target.
 */
export function parseLog(content: string): LogEvent[] {
  const events: LogEvent[] = [];
  for (const line of content.split('\n')) {
    const parsed = parseEvent(line);
    if (parsed !== null) events.push(parsed);
  }
  return events;
}

/**
 * Compute the content to write when appending a new event. If the log
 * doesn't exist yet, starts with the grammar header. Otherwise appends
 * the new line(s) after existing content, preserving everything.
 *
 * Pure — no I/O. Caller invokes StorageAdapter.write.
 */
export function appendEvent(existingContent: string | null, event: LogEvent): string {
  const line = formatEvent(event);
  if (existingContent === null || existingContent.length === 0) {
    return `${HEADER}${line}\n`;
  }
  // Ensure single trailing newline in existing, then append.
  const base = existingContent.replace(/\n+$/, '\n');
  return `${base}${line}\n`;
}

/**
 * Convenience for batch appending multiple events atomically (same
 * timestamp-ordering contract as single append).
 */
export function appendEvents(existingContent: string | null, events: LogEvent[]): string {
  if (events.length === 0) return existingContent ?? '';
  let out = existingContent;
  for (const event of events) {
    out = appendEvent(out, event);
  }
  return out ?? '';
}

// ---------------------------------------------------------------------------
// Value encoding
// ---------------------------------------------------------------------------

/**
 * Encode a value so it can appear in `k=v` form without breaking the
 * `## [ts] event | k=v k=v` grammar. Uses `encodeURIComponent` plus
 * additional escapes for characters it leaves alone that would still be
 * ambiguous in our grammar (space → %20 via encodeURIComponent; `|` and
 * `=` preserved by encodeURIComponent so we escape those manually).
 */
export function encodeValue(raw: string): string {
  // encodeURIComponent escapes: control chars, space, # < > and most punctuation
  // but leaves: A-Z a-z 0-9 - _ . ! ~ * ' ( )
  // We additionally need to escape: | = (would confuse our grammar)
  //                                  ! ~ * ' ( ) (cosmetic — escape for total safety)
  return encodeURIComponent(raw)
    .replace(/\|/g, '%7C')
    .replace(/=/g, '%3D')
    .replace(/!/g, '%21')
    .replace(/~/g, '%7E')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

/**
 * Inverse of encodeValue. `decodeURIComponent` handles all encoded
 * forms; our encoder only emits percent-escapes.
 */
export function decodeValue(encoded: string): string {
  return decodeURIComponent(encoded);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isIsoUtcSeconds(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s);
}

/**
 * Build a timestamp at seconds precision. Accepts a Date for dependency
 * injection in tests.
 */
export function nowIsoSeconds(ref: Date = new Date()): string {
  return ref.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
