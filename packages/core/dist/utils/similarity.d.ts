/**
 * Shared Jaccard similarity utilities.
 *
 * Provides the core set-intersection computation used by multiple services
 * (commitments, meeting-extraction, area-parser). Each caller retains its
 * own normalization/tokenization logic — only the similarity math is shared.
 */
/**
 * Normalize text for Jaccard comparison.
 * Lowercase, replace newlines with spaces, strip non-alphanumeric, split on whitespace.
 */
export declare function normalizeForJaccard(text: string): string[];
/**
 * Compute Jaccard similarity between two pre-tokenized word arrays.
 * Returns 0–1 where 1 is identical and 0 is completely disjoint.
 *
 * Formula: |intersection| / |union|
 */
export declare function jaccardSimilarity(a: string[], b: string[]): number;
//# sourceMappingURL=similarity.d.ts.map