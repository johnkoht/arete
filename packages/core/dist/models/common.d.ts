/**
 * Common leaf types shared across multiple domains.
 *
 * RULE: This is a leaf module — it must NOT import from any other model file.
 */
/**
 * Origin of a staged item (extracted, deduped, or reconciled against workspace state).
 * Canonical source of truth. Keep in sync with:
 *   - packages/apps/backend/src/services/workspace.ts (parseStagedItemSource)
 *   - packages/apps/web/src/api/types.ts (standalone duplicate — web has no @arete/core dep)
 *   - packages/apps/web/src/api/meetings.ts (standalone duplicate)
 * Drift is caught by packages/apps/backend/test/services/item-source-compat.test.ts.
 *
 * Values:
 * - 'ai': LLM extracted
 * - 'dedup': matched user notes in the meeting body
 * - 'reconciled': matched a completed task in week.md/scratchpad.md OR dropped by cross-meeting reconciliation
 * - 'existing-task': matched an OPEN task in week.md/tasks.md (avoids duplicating already-tracked work)
 * - 'slack-resolved': reserved for slack-evidence-dedup follow-on plan; no producer today
 */
export type ItemSource = 'ai' | 'dedup' | 'reconciled' | 'existing-task' | 'slack-resolved';
/** Product primitive — the five building blocks of product knowledge */
export type ProductPrimitive = 'Problem' | 'User' | 'Solution' | 'Market' | 'Risk';
/** All valid product primitives */
export declare const PRODUCT_PRIMITIVES: readonly ProductPrimitive[];
/** Work type classification for skills */
export type WorkType = 'discovery' | 'definition' | 'delivery' | 'analysis' | 'planning' | 'operations';
/** Skill category */
export type SkillCategory = 'essential' | 'default' | 'community';
/** Agent mode: builder = building Areté; guide = leading/empowering the user (end-product) */
export type AgentMode = 'builder' | 'guide';
/** Entity type for resolution */
export type EntityType = 'person' | 'meeting' | 'project' | 'any';
/** Memory item type */
export type MemoryItemType = 'decisions' | 'learnings' | 'observations';
/** Date range filter used by search operations */
export type DateRange = {
    start?: string;
    end?: string;
};
//# sourceMappingURL=common.d.ts.map