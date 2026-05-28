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
 *
 * Mutates `fm` in place. Idempotent: re-running on the same
 * `intelligence` produces the same `fm`. Field order in YAML output is
 * determined by the YAML serializer (insertion order for `yaml` lib);
 * this writer is intentionally written so the canonical 7 fields are
 * always assigned in the same order across the 3 call sites.
 *
 * @param fm - Frontmatter object to mutate.
 * @param intelligence - Extracted meeting intelligence.
 * @param status - `{ status, processedAt }` to attach.
 * @param aliasDeps - Optional alias-merge dependencies.
 */
export declare function writeMeetingApplyFrontmatter(fm: Record<string, unknown>, intelligence: MeetingIntelligence, status: MeetingApplyStatus, aliasDeps?: MeetingApplyAliasDeps): Promise<void>;
//# sourceMappingURL=meeting-frontmatter.d.ts.map