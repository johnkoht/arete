/**
 * Unified meeting-apply frontmatter writer.
 *
 * Three code paths emit meeting frontmatter during extraction/apply:
 *
 *   1. `meeting-apply.ts:applyMeetingIntelligence` — CLI `arete meeting apply`
 *   2. `agent.ts:processMeeting` — backend `/process` route
 *   3. `meeting.ts:extract --stage` — CLI extract-with-stage path
 *
 * Pre-followup-5, each path inlined its own writer. Paths 1+2 wrote the
 * full set (topics post-alias-coerce + 5 counts); path 3 wrote ONLY the
 * minimal subset (`status`, `processed_at`, `staged_item_*`) — silently
 * dropping topics + counts when chef daily-winddown switched its
 * process-meetings flow from `meeting apply` to `meeting extract --stage`.
 *
 * This module consolidates the write into one helper so the three call
 * sites produce identical frontmatter for identical inputs. Idempotent:
 * calling twice with the same `intelligence` produces the same output.
 *
 * See `dev/work/plans/arete-v2-chef-orchestrator/phase-3-5-followup-5-wiki-discoverability/plan.md`
 * (AC1).
 */

import type { MeetingIntelligence } from './meeting-extraction.js';
import type { TopicMemoryService } from './topic-memory.js';
import type { WorkspacePaths } from '../models/workspace.js';
import type { LLMCallFn } from '../integrations/conversations/extract.js';

/**
 * Status fields the writer attaches to frontmatter alongside the
 * intelligence-derived topics + counts.
 */
export interface MeetingApplyStatus {
  /** Resolved status string (e.g. `'processed'`, `'approved'`). */
  status: string;
  /** ISO 8601 timestamp string (typically `new Date().toISOString()`). */
  processedAt: string;
}

/**
 * Optional alias-merge dependencies. When all three are provided AND
 * `intelligence.topics` is non-empty, the writer runs proposed slugs
 * through `topicMemory.aliasAndMerge` before writing `fm.topics`.
 *
 * When any field is undefined, the writer falls back to writing the
 * proposed slugs verbatim.
 *
 * `aliasAndMerge` failures are non-fatal: the writer catches and
 * forwards a single warning string via the `onWarning` callback (if
 * provided), then writes the proposed slugs verbatim.
 */
export interface MeetingApplyAliasDeps {
  topicMemory?: TopicMemoryService;
  workspacePaths?: WorkspacePaths;
  callLLM?: LLMCallFn;
  /** Set to true to skip the alias/merge pass entirely (e.g., `--skip-topics`). */
  skipTopicAlias?: boolean;
  /** Receives a single non-fatal warning string when alias/merge throws. */
  onWarning?: (msg: string) => void;
}

/**
 * Write the agent-facing meeting frontmatter fields:
 *   - `topics` (slug array, post-alias-coerce when deps provided)
 *   - `open_action_items` (number)
 *   - `my_commitments` (number; `direction === 'i_owe_them'`)
 *   - `their_commitments` (number; `direction === 'they_owe_me'`)
 *   - `decisions_count` (number)
 *   - `learnings_count` (number)
 *   - `status`, `processed_at` (from the `status` arg)
 *   - `could_include` (string array; wiki-repair W2/D1 — persisted at
 *     stage so `arete meeting approve` can render the summary's FYI
 *     section; consumed + cleared at approve)
 *
 * Mutates `fm` in place. Idempotent: re-running on the same
 * `intelligence` produces the same `fm`. Field order in YAML output is
 * determined by the YAML serializer (insertion order for `yaml` lib);
 * this writer is intentionally written so the canonical 7 fields are
 * always assigned in the same order across the 3 call sites.
 *
 * `could_include` clear semantics: when `intelligence.could_include` is
 * absent/empty, the key is `delete`d from `fm` (NOT set to `undefined`
 * — the backend path serializes via gray-matter/js-yaml, which throws
 * on undefined values). Callers that write through a PARTIAL-MERGE
 * mechanism (`writeWithLock` — extract `--stage`) must additionally set
 * `patch['could_include'] = undefined` when the writer didn't set the
 * key, so a stale key from a prior extract is deleted rather than
 * surviving the merge (see meeting.ts extract mutator).
 *
 * @param fm - Frontmatter object to mutate.
 * @param intelligence - Extracted meeting intelligence.
 * @param status - `{ status, processedAt }` to attach.
 * @param aliasDeps - Optional alias-merge dependencies.
 */
export async function writeMeetingApplyFrontmatter(
  fm: Record<string, unknown>,
  intelligence: MeetingIntelligence,
  status: MeetingApplyStatus,
  aliasDeps: MeetingApplyAliasDeps = {},
): Promise<void> {
  // 1. Status fields (always written, same order).
  fm['status'] = status.status;
  fm['processed_at'] = status.processedAt;

  // 2. Topics — optionally run through alias/merge.
  const proposedTopics = intelligence.topics ?? [];
  let normalizedTopics: string[] = proposedTopics;
  const canAlias =
    !aliasDeps.skipTopicAlias &&
    aliasDeps.topicMemory !== undefined &&
    aliasDeps.workspacePaths !== undefined &&
    proposedTopics.length > 0;
  if (canAlias) {
    try {
      // Dynamic import avoids forcing `topic-memory.js` as a load-time
      // dep of this module (mirrors the existing pattern at
      // meeting-apply.ts:290).
      const { TopicMemoryService: TMS } = await import('./topic-memory.js');
      const { topics: existingPages } = await aliasDeps.topicMemory!.listAll(aliasDeps.workspacePaths!);
      const existingIdentities = TMS.toIdentities(existingPages);
      const aliasResults = await aliasDeps.topicMemory!.aliasAndMerge(
        proposedTopics,
        existingIdentities,
        { callLLM: aliasDeps.callLLM },
      );
      normalizedTopics = aliasResults.map((r) => r.resolved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      if (aliasDeps.onWarning !== undefined) {
        aliasDeps.onWarning(`topic alias/merge failed (non-fatal): ${msg}`);
      }
      normalizedTopics = proposedTopics;
    }
  }
  fm['topics'] = normalizedTopics;

  // 3. Counts (derived from intelligence; deterministic).
  fm['open_action_items'] = intelligence.actionItems.length;
  fm['my_commitments'] = intelligence.actionItems.filter(
    (i) => i.direction === 'i_owe_them',
  ).length;
  fm['their_commitments'] = intelligence.actionItems.filter(
    (i) => i.direction === 'they_owe_me',
  ).length;
  fm['decisions_count'] = intelligence.decisions.length;
  fm['learnings_count'] = intelligence.learnings.length;

  // 4. could_include — wiki-repair W2/D1 persistence.
  //
  // Side-thread headlines parsed by wiki-aware extraction previously
  // lived only in the extract process's memory: the body-block rendering
  // was removed in Phase 1 and the approve path (a separate process)
  // could never see them — the FYI content went nowhere. Persisting the
  // (already-sanitized, hard-capped-at-8) list here lets
  // `arete meeting approve` consume it for the summary's FYI section.
  const couldInclude = intelligence.could_include;
  if (couldInclude !== undefined && couldInclude.length > 0) {
    fm['could_include'] = couldInclude;
  } else {
    // Set-or-DELETE, never set-undefined (js-yaml throws on undefined;
    // see module docstring for the partial-merge caveat).
    delete fm['could_include'];
  }
}
