/**
 * Phase 10b-min Step 6 — Dedup decisions audit log writer.
 *
 * Appends one line per cross-meeting dedup decision to
 * `dev/diary/dedup-decisions.log`. Format mirrors Phase 9's
 * `brief-invocations.log` + Phase 10 followup-2's `chef-skip-log.md`
 * conventions, but with a fixed-column shape (per plan AC9):
 *
 *   ${ISO} ${decision} ${new-id} ${canonical-id} ${jaccard} ${llm-tier} ${llm-decision} ${reasoning}
 *
 * Decisions:
 *   - MERGE     — text-hash exact match OR LLM SAME
 *   - NEW       — no hybrid candidates OR all LLM DIFFERENT
 *   - UNCERTAIN — LLM UNCERTAIN (registered as new canonical AND flagged)
 *   - UNMERGE   — user-initiated split via [[unmerge]] (Phase 10b-aux)
 *
 * Best-effort writer: failures (disk full, permission, etc.) do NOT
 * block extract or winddown. Caller never needs try/catch around this.
 *
 * Log file is gitignored — same convention as Phase 9
 * `brief-invocations.log` + Phase 10 followup-2 `chef-skip-log.md`.
 */

import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { DedupOutcome } from './commitment-dedup-pipeline.js';
import type { ExtractDedupDecision } from './commitment-dedup-extract.js';

/**
 * Decision token written as the second column of the log line.
 */
export type DedupDecisionKind = 'MERGE' | 'NEW' | 'UNCERTAIN' | 'UNMERGE';

/**
 * LLM tier token written as the sixth column. Mirrors the AITier shape
 * but as a string literal so callers don't pull in the workspace
 * config type.
 */
export type DedupLLMTier = 'fast' | 'standard' | 'frontier' | '-';

/**
 * Payload for one dedup-decision log entry.
 *
 * `reasoning` is the human-readable trailing column. Spaces are
 * preserved; newlines are stripped (the log is one-line-per-event).
 */
export type DedupDecisionLogPayload = {
  decision: DedupDecisionKind;
  /** Staged-item ID from the meeting being extracted. */
  newId: string;
  /** Canonical's commitment ID OR '-' when decision=NEW. */
  canonicalId: string;
  /** Jaccard score (0-1) of the chosen candidate; '-' when N/A. */
  jaccard: number | '-';
  /** LLM tier used for the cross-check; '-' when text-hash match (no LLM). */
  llmTier: DedupLLMTier;
  /** LLM verdict ('SAME' | 'DIFFERENT' | 'UNCERTAIN' | '-' for hash hits). */
  llmDecision: 'SAME' | 'DIFFERENT' | 'UNCERTAIN' | '-';
  /** Free-form reasoning string — preserved on one line. */
  reasoning: string;
};

/**
 * Sanitize reasoning to a single line. Strips newlines + carriage
 * returns; collapses whitespace runs.
 *
 * Exported for tests.
 */
export function sanitizeReasoning(s: string): string {
  return s.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Render a `DedupDecisionLogPayload` to one log line (without trailing
 * newline). Caller appends `\n` at write time.
 *
 * Exported for tests + future parser tooling (e.g., `arete dedup
 * --explain` may grep this log for prior decisions on a canonical).
 */
export function renderDedupDecisionLine(
  iso: string,
  payload: DedupDecisionLogPayload,
): string {
  const j =
    payload.jaccard === '-' ? '-' : payload.jaccard.toFixed(2);
  const reasoning = sanitizeReasoning(payload.reasoning);
  return [
    iso,
    payload.decision,
    payload.newId,
    payload.canonicalId,
    j,
    payload.llmTier,
    payload.llmDecision,
    reasoning,
  ].join(' ');
}

/**
 * Map an `ExtractDedupDecision` to the log payload. The caller (CLI)
 * uses this when batch-writing multiple decisions from a single
 * extract.
 *
 * Exported for tests.
 */
export function payloadFromExtractDecision(
  decision: ExtractDedupDecision,
  llmTier: DedupLLMTier = 'fast',
): DedupDecisionLogPayload {
  const outcome: DedupOutcome = decision.outcome;
  if (outcome.kind === 'definite-dupe') {
    return {
      decision: 'MERGE',
      newId: decision.itemId,
      canonicalId: outcome.canonical.id,
      jaccard: outcome.jaccard ?? outcome.canonical.jaccard ?? 1.0,
      llmTier: outcome.via === 'text-hash' ? '-' : llmTier,
      llmDecision: outcome.via === 'text-hash' ? '-' : 'SAME',
      reasoning: outcome.reasoning ?? (outcome.via === 'text-hash' ? 'text-hash exact match' : ''),
    };
  }
  if (outcome.kind === 'possibly-mergeable') {
    return {
      decision: 'UNCERTAIN',
      newId: decision.itemId,
      canonicalId: outcome.bestCandidate.id,
      jaccard: outcome.bestCandidate.jaccard,
      llmTier,
      llmDecision: 'UNCERTAIN',
      reasoning: outcome.reasoning ?? '',
    };
  }
  // new-canonical
  return {
    decision: 'NEW',
    newId: decision.itemId,
    canonicalId: '-',
    jaccard: '-',
    llmTier: outcome.candidatesEvaluated.length > 0 ? llmTier : '-',
    llmDecision: outcome.candidatesEvaluated.length > 0 ? 'DIFFERENT' : '-',
    reasoning:
      outcome.candidatesEvaluated.length > 0
        ? 'no SAME / no UNCERTAIN across candidates'
        : 'no hybrid candidates',
  };
}

/**
 * Append one dedup-decision log line.
 *
 * Best-effort: errors during mkdir/appendFile are swallowed silently.
 *
 * @param workspaceRoot Absolute path to the workspace root
 * @param payload       The decision payload
 */
export async function appendDedupDecisionLog(
  workspaceRoot: string,
  payload: DedupDecisionLogPayload,
): Promise<void> {
  try {
    const dir = join(workspaceRoot, 'dev', 'diary');
    await mkdir(dir, { recursive: true });
    const logPath = join(dir, 'dedup-decisions.log');
    const iso = new Date().toISOString();
    const line = renderDedupDecisionLine(iso, payload) + '\n';
    await appendFile(logPath, line, 'utf8');
  } catch {
    // Best-effort — never block the command. Audit signal lost is a
    // soak-observability issue, not a correctness issue.
  }
}

/**
 * Convenience: append multiple decisions from a single extract pass.
 *
 * Iterates serially — preserves write ordering in the log so reading
 * the tail shows the extract's decisions in item-order.
 */
export async function appendDedupDecisionLogBatch(
  workspaceRoot: string,
  decisions: ReadonlyArray<ExtractDedupDecision>,
  llmTier: DedupLLMTier = 'fast',
): Promise<void> {
  for (const d of decisions) {
    const payload = payloadFromExtractDecision(d, llmTier);
    await appendDedupDecisionLog(workspaceRoot, payload);
  }
}
