/**
 * Markdown-section diff utility (Phase 3 Step 4).
 *
 * Splits a markdown document into top-level sections (delimited by
 * ATX headers — `#`, `##`, etc.) and diffs section-by-section. The
 * resulting `MarkdownDiff` is deterministic and JSON-serializable so
 * `arete skill diff <name> --json` returns a stable shape.
 *
 * Why section-level (not line-level): SKILL.md authors edit prose
 * inside a section; upstream-vs-fork comparisons are cleaner when the
 * unit of comparison matches the editing unit. A line-level diff
 * surfaces every reflowed paragraph as a thousand changes;
 * section-level shows "the `## Read first` section diverged" which
 * is what the user needs to decide whether to merge.
 *
 * Frontmatter (the leading YAML block delimited by `---`) is treated
 * as a synthetic top-section called `__frontmatter__` so frontmatter
 * edits are explicit in the diff.
 *
 * Pure functions; no I/O. Tests at
 * `packages/core/test/utils/markdown-diff.test.ts`.
 */
/** A section of a markdown document. */
export interface MarkdownSection {
    /**
     * Section heading text (e.g. `"## Read first"`). For the synthetic
     * frontmatter section, the heading is `"__frontmatter__"`. For
     * content above the first header but after frontmatter, the heading
     * is `"__preamble__"`.
     */
    heading: string;
    /**
     * Section body — everything from the line after the heading up to
     * (but not including) the next heading. Includes trailing newlines
     * as authored. For the frontmatter section, this is the YAML between
     * the `---` fences (no fences). For preamble, this is the lines
     * between frontmatter and the first heading.
     */
    body: string;
}
/** A per-section change in the diff. */
export type MarkdownSectionChange = {
    kind: 'added';
    heading: string;
    /** Body in `b` (the new side). */
    body: string;
} | {
    kind: 'removed';
    heading: string;
    /** Body in `a` (the old side). */
    body: string;
} | {
    kind: 'modified';
    heading: string;
    /** Old body. */
    bodyA: string;
    /** New body. */
    bodyB: string;
};
export interface MarkdownDiff {
    /** Per-section changes in document order (preserved across both sides). */
    changes: MarkdownSectionChange[];
    /** True if `a` and `b` are byte-equal in section terms (no changes). */
    unchanged: boolean;
}
/**
 * Parse a markdown document into ordered sections. Frontmatter (if
 * present) is captured as a synthetic `__frontmatter__` section.
 * Content above the first heading is captured as `__preamble__`
 * (omitted when empty).
 *
 * The parser is line-level and does not understand fenced code
 * blocks — a line starting with `# ` inside a code fence will be
 * (mis-)treated as a heading. SKILL.md prose rarely embeds raw
 * markdown headers in code fences in practice; if this becomes a
 * problem, add fence tracking. Documented limitation.
 */
export declare function parseMarkdownSections(content: string): MarkdownSection[];
/**
 * Compute a section-level diff between two markdown documents.
 *
 * Sections are matched by heading text (exact string match, including
 * the leading `## ` etc.). Unchanged sections produce no entry; added
 * / removed / modified sections produce entries in the order they
 * appear in the union of the two sides (a-first, then b-only).
 */
export declare function diffMarkdownSections(a: string, b: string): MarkdownDiff;
/**
 * Format a MarkdownDiff as a human-readable string suitable for
 * `arete skill diff <name>` (non-JSON output). Each change shows the
 * section heading and the body deltas in a unified-diff-ish style.
 *
 * Not a strict unified diff (no `@@` hunks, no line numbers). The
 * goal is reviewability; a real `diff -u` of the underlying files is
 * one shell pipe away if line-level precision is needed.
 */
export declare function formatMarkdownDiff(diff: MarkdownDiff): string;
/**
 * Render a section-level three-way merge result as a markdown
 * document with git-style conflict markers when local and incoming
 * disagree.
 *
 * Inputs:
 * - `base`: the fork's recorded base (contents of `.fork-base/SKILL.md`)
 * - `local`: the user's current fork (`.agents/skills/<name>/SKILL.md`)
 * - `incoming`: the new managed/shipped content (`.arete/skills/<name>/SKILL.md`)
 *
 * Algorithm (per-section):
 * - Section unchanged in local vs base + changed in incoming → take incoming.
 * - Section changed in local vs base + unchanged in incoming → keep local.
 * - Section changed in local vs base + changed in incoming + bodies match → keep (no conflict).
 * - Section changed in local vs base + changed in incoming + bodies differ → conflict markers.
 * - Section added only in local → keep local.
 * - Section added only in incoming → take incoming.
 * - Section removed in local but present in incoming → re-add from incoming
 *   (conservative; user can drop again post-merge).
 * - Section removed in incoming but kept in local → keep local (user fork
 *   wins on removals; user can drop with `arete skill reset` if they want).
 *
 * Returns:
 * - `merged`: the rendered markdown content (with conflict markers if any).
 * - `conflicts`: list of section headings that landed conflict markers.
 * - `clean`: true when no conflict markers were emitted.
 */
export interface MergeResult {
    merged: string;
    conflicts: string[];
    /**
     * Per-section verdict in document order. Diagnostic for tests +
     * `--interactive` mode.
     */
    hunks: MergeHunk[];
    clean: boolean;
}
export interface MergeHunk {
    heading: string;
    /**
     * - `unchanged`: same body in all three sides (or local matches incoming).
     * - `local-only`: only local changed; kept as-is.
     * - `incoming-only`: only incoming changed; took incoming.
     * - `both-agree`: both local and incoming changed identically.
     * - `conflict`: both sides changed and disagree.
     * - `local-add`: present only in local.
     * - `incoming-add`: present only in incoming.
     * - `incoming-restore`: removed from local but still in incoming; re-added.
     * - `local-keep-removed`: present in local + base; removed in incoming;
     *   kept (user's right to retain).
     */
    kind: 'unchanged' | 'local-only' | 'incoming-only' | 'both-agree' | 'conflict' | 'local-add' | 'incoming-add' | 'incoming-restore' | 'local-keep-removed';
}
export declare function threeWayMergeSections(base: string, local: string, incoming: string): MergeResult;
/**
 * Render a list of sections back to a markdown document. Inverse of
 * `parseMarkdownSections` for the structural fields.
 */
export declare function renderSections(sections: {
    heading: string;
    body: string;
}[]): string;
/** Constants for callers that need to filter out synthetic sections. */
export declare const SYNTHETIC_FRONTMATTER_HEADING = "__frontmatter__";
export declare const SYNTHETIC_PREAMBLE_HEADING = "__preamble__";
//# sourceMappingURL=markdown-diff.d.ts.map