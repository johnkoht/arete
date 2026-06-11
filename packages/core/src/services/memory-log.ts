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
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/workspace.js';
import {
  formatEvent,
  nowIsoSeconds,
  type LogEvent,
} from '../utils/memory-log.js';

const LOG_RELATIVE_PATH = 'log.md';
const ITEM_FATES_RELATIVE_PATH = 'item-fates.jsonl';

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
 * - `deferral_disagreement`: Phase 3.5 — the user pulled back a previously
 *   deferred item (e.g., uncommented or removed `[[defer]]` in the sidecar).
 *   Captures the chef's mis-classification so future runs can tighten
 *   defer-confidence. See `DeferralDisagreementFields` for the additional
 *   schema beyond the base ItemFateEvent.
 */
export type ItemFate =
  | 'approved'
  | 'dismissed'
  | 'skipped'
  | 'deferred'
  | 'deferral_disagreement';

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
   *
   * For `deferral_disagreement` events, `reason` carries the ORIGINAL
   * defer reason (the one the chef recorded when auto-deferring the
   * item). The fact that the user pulled it back is the disagreement
   * signal; the original reason is the bias-correction target.
   */
  reason: string | null;
  /** Confidence score recorded at extraction (0–1) when known. */
  confidence: number | null;
  /** Importance assigned at extraction time when the meeting carried one. */
  importance_at_extraction: ItemFateImportance | null;
  /**
   * Phase 3.5 D1 — when `fate === 'deferral_disagreement'`, the prior
   * fate the chef recorded for this item. Always `'deferred'` in the
   * v1 wiring (we don't yet observe disagreements with other fates),
   * but typed as `ItemFate | null` for future flexibility.
   */
  original_fate?: ItemFate | null;
  /**
   * Phase 3.5 D1 — when `fate === 'deferral_disagreement'`, the
   * timestamp at which the user pulled the item back from the
   * sidecar. Distinct from `ts` (the fate-write time): pull-back
   * detection is asynchronous from the moment the user edited the
   * sidecar.
   */
  pulled_back_at?: string;
}

export interface AppendItemFateOptions {
  /** Optional clock override for tests. */
  now?: Date;
}

/**
 * Detector telemetry record (single-pass W3 / D4). Written to the SAME
 * `item-fates.jsonl` stream as ItemFateEvent, distinguished by
 * `type: 'extraction_telemetry'` — consumers filtering on
 * `type === 'item_fate'` are unaffected. These are the log-only events the
 * legacy mechanical filters (garbage/trivial/mirror-pair/near-dup) emit in
 * single_pass mode instead of dropping items.
 */
export interface ExtractionTelemetryRecord {
  type: 'extraction_telemetry';
  ts: string;
  detector: string;
  item_kind: 'action_item' | 'decision' | 'learning';
  item_text: string;
  detail: string;
  source_path: string;
}

export class MemoryLogService {
  constructor(private readonly storage: StorageAdapter) {}

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
  async append(
    workspacePaths: WorkspacePaths,
    event: Omit<LogEvent, 'timestamp'> & { timestamp?: string },
    options: AppendLogOptions = {},
  ): Promise<void> {
    const path = join(workspacePaths.memory, LOG_RELATIVE_PATH);
    const timestamp =
      event.timestamp !== undefined && event.timestamp.length > 0
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
  async appendItemFate(
    workspacePaths: WorkspacePaths,
    event: Omit<ItemFateEvent, 'type' | 'ts'> & { ts?: string },
    options: AppendItemFateOptions = {},
  ): Promise<void> {
    const path = join(workspacePaths.memory, ITEM_FATES_RELATIVE_PATH);
    const ts = event.ts !== undefined && event.ts.length > 0
      ? event.ts
      : nowIsoSeconds(options.now);
    const record: ItemFateEvent = {
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
    // Phase 3.5 D1 — only emit the disagreement-specific fields when
    // they apply; preserves single-line JSONL backward-compat for
    // existing consumers.
    if (event.original_fate !== undefined) {
      record.original_fate = event.original_fate;
    }
    if (event.pulled_back_at !== undefined) {
      record.pulled_back_at = event.pulled_back_at;
    }
    const line = JSON.stringify(record) + '\n';

    if (this.storage.append !== undefined) {
      await this.storage.append(path, line);
      return;
    }

    const existing = await this.storage.read(path);
    const next = (existing ?? '') + line;
    await this.storage.write(path, next);
  }

  /**
   * Append a single extraction-telemetry event (single-pass W3 / D4) to
   * `.arete/memory/item-fates.jsonl`. One JSON line per event; same
   * atomic-append semantics as `appendItemFate`.
   */
  async appendExtractionTelemetry(
    workspacePaths: WorkspacePaths,
    event: Omit<ExtractionTelemetryRecord, 'type' | 'ts'> & { ts?: string },
    options: AppendItemFateOptions = {},
  ): Promise<void> {
    const path = join(workspacePaths.memory, ITEM_FATES_RELATIVE_PATH);
    const ts = event.ts !== undefined && event.ts.length > 0
      ? event.ts
      : nowIsoSeconds(options.now);
    const record: ExtractionTelemetryRecord = {
      type: 'extraction_telemetry',
      ts,
      detector: event.detector,
      item_kind: event.item_kind,
      item_text: event.item_text,
      detail: event.detail,
      source_path: event.source_path,
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
