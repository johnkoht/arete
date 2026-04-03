/**
 * Human-readable CLI output formatting for meeting reconciliation results.
 */
import type { ReconciliationResult, ReconciledItem } from '@arete/core';
/**
 * Format a relevance tier as a colored badge for CLI output.
 * HIGH = green, NORMAL = yellow, LOW = red.
 */
export declare function formatTierBadge(tier: ReconciledItem['relevanceTier']): string;
/**
 * Get a display label for a reconciled item.
 * Extracts description text from action items or uses string directly.
 */
export declare function getReconciledItemText(item: ReconciledItem): string;
/**
 * Display reconciliation details: per-item tier badges, duplicate annotations, and stats summary.
 */
export declare function displayReconciliationDetails(result: ReconciliationResult, reconciled: Array<{
    id: string;
    matchedText: string;
}>): void;
/**
 * Display reconciled completed items (action items matched to already-done tasks).
 */
export declare function displayReconciledCompletedItems(reconciled: Array<{
    id: string;
    matchedText: string;
}>): void;
//# sourceMappingURL=reconciliation-output.d.ts.map