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
 * Matches a result path under a project folder and captures the remainder.
 * `<seg>` is a single segment — a bare `<slug>` or a `YYYY-MM_<slug>` archive
 * folder (both archive shapes; real archives use the dated form, but tolerating
 * both is free). Separators are normalized to `/` before matching.
 */
const PROJECT_SUBPATH = /(?:^|\/)projects\/(?:active|archive)\/[^/]+\/(.+)$/;

/**
 * Classify a workspace-relative result path into a provenance tier, or
 * `undefined` for non-project paths and the durable long-tail (which rank
 * normally on relevance). `working/` is the only tier that changes rank.
 *
 * `inputs?`/`outputs?` tolerate the singular folder names a few projects use.
 */
export function classifyProvenance(path: string): Provenance | undefined {
  const norm = path.replace(/\\/g, '/');
  const m = PROJECT_SUBPATH.exec(norm);
  if (m === null) return undefined;
  const rest = m[1]; // path relative to the project folder
  if (/^working\//.test(rest)) return 'draft'; // checked first: a README/file in working/ is still a draft
  if (/^outputs?\//.test(rest)) return 'published';
  if (rest === 'README.md') return 'published'; // project-root README only — anchored by PROJECT_SUBPATH
  if (/^inputs?\//.test(rest)) return 'reference';
  return undefined;
}

/**
 * Attach `provenance` to each result and stable-sink drafts below all
 * non-draft results. Relevance order is preserved within each group; scores
 * are untouched. Generic over the result shape so the caller's item type
 * (with its own fields) flows through unchanged.
 */
export function applyProvenance<T extends { path: string }>(
  results: readonly T[],
): Array<T & { provenance?: Provenance }> {
  const tagged = results.map(
    (r): T & { provenance?: Provenance } => ({
      ...r,
      provenance: classifyProvenance(r.path),
    }),
  );
  // Stable partition: non-draft first (original order), then drafts (original order).
  const nonDraft = tagged.filter((r) => r.provenance !== 'draft');
  const drafts = tagged.filter((r) => r.provenance === 'draft');
  return [...nonDraft, ...drafts];
}
