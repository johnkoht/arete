/**
 * Provenance classification + ordering for project search results.
 *
 * The qmd index is unchanged: the entire `projects/` tree (including
 * `working/`) is already searchable. This module only re-orders and labels
 * what qmd already returned — it adds/removes nothing from the index.
 *
 * Model (see dev/work/plans/project-wiki-sync/plan.md):
 *  - Ranking is binary. `working/` drafts are stable-sunk BELOW all other
 *    results; everything else keeps qmd's relevance order. Only `working/`
 *    moves — it's the one reliable scratch signal in the real workspace
 *    (~74% of projects use it; durable content is scattered everywhere else,
 *    so an allowlist of "published" folders over-fits and is avoided).
 *  - Labels are partial and honest: only confident tiers are tagged
 *    (`outputs/`+project README → published, `inputs/` → reference,
 *    `working/` → draft). The durable long-tail (root docs, skill/, plan/, …)
 *    stays unlabeled and ranks normally — neutral, not penalized.
 *  - The displayed relevance score is never modified; order only.
 */
export type Provenance = 'published' | 'reference' | 'draft';
/**
 * Classify a workspace-relative result path into a provenance tier, or
 * `undefined` for non-project paths and the durable long-tail (which rank
 * normally on relevance). `working/` is the only tier that changes rank.
 *
 * `inputs?`/`outputs?` tolerate the singular folder names a few projects use.
 */
export declare function classifyProvenance(path: string): Provenance | undefined;
/**
 * Attach `provenance` to each result and stable-sink drafts below all
 * non-draft results. Relevance order is preserved within each group; scores
 * are untouched. Generic over the result shape so the caller's item type
 * (with its own fields) flows through unchanged.
 */
export declare function applyProvenance<T extends {
    path: string;
}>(results: readonly T[]): Array<T & {
    provenance?: Provenance;
}>;
//# sourceMappingURL=provenance.d.ts.map