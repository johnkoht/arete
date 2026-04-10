/**
 * Hygiene domain types.
 *
 * Types for workspace hygiene scanning and cleanup operations.
 */
/** Risk tier: 1 = safe auto-apply, 2 = review recommended, 3 = human judgment required */
export type HygieneTier = 1 | 2 | 3;
/** Category of workspace entropy */
export type HygieneCategory = 'meetings' | 'memory' | 'commitments' | 'activity';
/** Type of cleanup action */
export type HygieneActionType = 'archive' | 'compact' | 'purge' | 'trim' | 'merge';
/** A single hygiene issue detected by scan */
export interface HygieneItem {
    /** Deterministic identifier: hash of category + affectedPath */
    id: string;
    tier: HygieneTier;
    category: HygieneCategory;
    actionType: HygieneActionType;
    /** Human-readable description of the issue */
    description: string;
    /** Workspace-relative path of the affected file */
    affectedPath: string;
    /** Human-readable suggested action */
    suggestedAction: string;
    /** Category-specific metadata (e.g., similarity score, age in days) */
    metadata: Record<string, unknown>;
}
/** Result of a hygiene scan — pure read, no mutations */
export interface HygieneReport {
    /** ISO timestamp of when the scan was performed */
    scannedAt: string;
    items: HygieneItem[];
    summary: {
        total: number;
        byTier: Record<HygieneTier, number>;
        byCategory: Record<HygieneCategory, number>;
    };
}
/** An action approved by the user for execution */
export interface ApprovedAction {
    id: string;
}
/** Result of applying approved hygiene actions */
export interface HygieneResult {
    /** IDs of successfully applied actions */
    applied: string[];
    /** Actions that failed with error details */
    failed: Array<{
        id: string;
        error: string;
    }>;
}
/** Options for the hygiene scan */
export interface HygieneScanOptions {
    /** Filter to specific tiers */
    tiers?: HygieneTier[];
    /** Filter to specific categories */
    categories?: HygieneCategory[];
    /** Threshold for stale meetings (default: 90) */
    meetingOlderThanDays?: number;
    /** Threshold for old memory entries (default: 90) */
    memoryOlderThanDays?: number;
    /** Threshold for resolved commitments (default: 30) */
    commitmentOlderThanDays?: number;
}
//# sourceMappingURL=hygiene.d.ts.map