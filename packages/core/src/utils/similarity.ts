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
export function normalizeForJaccard(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')  // Convert newlines to spaces first
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Compute Jaccard similarity between two pre-tokenized word arrays.
 * Returns 0–1 where 1 is identical and 0 is completely disjoint.
 *
 * Formula: |intersection| / |union|
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}
