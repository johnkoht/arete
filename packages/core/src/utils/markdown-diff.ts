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
export type MarkdownSectionChange =
  | {
      kind: 'added';
      heading: string;
      /** Body in `b` (the new side). */
      body: string;
    }
  | {
      kind: 'removed';
      heading: string;
      /** Body in `a` (the old side). */
      body: string;
    }
  | {
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

const FRONTMATTER_HEADING = '__frontmatter__';
const PREAMBLE_HEADING = '__preamble__';

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
export function parseMarkdownSections(content: string): MarkdownSection[] {
  if (!content) return [];

  const sections: MarkdownSection[] = [];
  const lines = content.split('\n');
  let i = 0;

  // Frontmatter detection: leading `---` line and matching closer.
  if (lines[0] === '---') {
    let close = -1;
    for (let j = 1; j < lines.length; j++) {
      if (lines[j] === '---') {
        close = j;
        break;
      }
    }
    if (close > 0) {
      const frontmatterBody = lines.slice(1, close).join('\n');
      sections.push({ heading: FRONTMATTER_HEADING, body: frontmatterBody });
      i = close + 1;
      // Skip the immediate-after-frontmatter blank line if present.
      if (i < lines.length && lines[i] === '') i++;
    }
  }

  // Preamble: any content before the first ATX heading.
  let preambleStart = i;
  let firstHeadingIdx = -1;
  for (let j = i; j < lines.length; j++) {
    if (isAtxHeading(lines[j])) {
      firstHeadingIdx = j;
      break;
    }
  }
  if (firstHeadingIdx === -1) {
    // No headings — the rest is preamble.
    if (preambleStart < lines.length) {
      const body = lines.slice(preambleStart).join('\n');
      if (body.length > 0 || preambleStart < lines.length) {
        sections.push({ heading: PREAMBLE_HEADING, body });
      }
    }
    return sections;
  }
  if (firstHeadingIdx > preambleStart) {
    const body = lines.slice(preambleStart, firstHeadingIdx).join('\n');
    if (body.trim().length > 0) {
      sections.push({ heading: PREAMBLE_HEADING, body });
    }
  }
  i = firstHeadingIdx;

  // Walk headings, gathering each section's body.
  while (i < lines.length) {
    const heading = lines[i];
    let nextHeading = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (isAtxHeading(lines[j])) {
        nextHeading = j;
        break;
      }
    }
    const bodyLines = lines.slice(i + 1, nextHeading);
    sections.push({ heading, body: normalizeBody(bodyLines) });
    i = nextHeading;
  }

  return sections;
}

/**
 * Normalize a body's trailing whitespace so identical content compares
 * byte-equal regardless of file-level trailing newlines or whether the
 * section was followed by another heading vs. EOF. We strip only
 * trailing blank lines (preserving the leading whitespace and any
 * blank lines inside the section body, which are author-meaningful).
 */
function normalizeBody(lines: string[]): string {
  // Trim trailing empty strings produced by `split('\n')` on
  // newline-terminated input.
  let end = lines.length;
  while (end > 0 && lines[end - 1] === '') end--;
  return lines.slice(0, end).join('\n');
}

/**
 * Compute a section-level diff between two markdown documents.
 *
 * Sections are matched by heading text (exact string match, including
 * the leading `## ` etc.). Unchanged sections produce no entry; added
 * / removed / modified sections produce entries in the order they
 * appear in the union of the two sides (a-first, then b-only).
 */
export function diffMarkdownSections(
  a: string,
  b: string,
): MarkdownDiff {
  const aSections = parseMarkdownSections(a);
  const bSections = parseMarkdownSections(b);
  const aMap = new Map(aSections.map((s) => [s.heading, s.body]));
  const bMap = new Map(bSections.map((s) => [s.heading, s.body]));

  const changes: MarkdownSectionChange[] = [];

  // First pass: walk a's order. Mark removed or modified.
  for (const section of aSections) {
    if (!bMap.has(section.heading)) {
      changes.push({
        kind: 'removed',
        heading: section.heading,
        body: section.body,
      });
    } else {
      const bodyB = bMap.get(section.heading)!;
      if (bodyB !== section.body) {
        changes.push({
          kind: 'modified',
          heading: section.heading,
          bodyA: section.body,
          bodyB,
        });
      }
    }
  }

  // Second pass: walk b's order; add b-only sections.
  for (const section of bSections) {
    if (!aMap.has(section.heading)) {
      changes.push({
        kind: 'added',
        heading: section.heading,
        body: section.body,
      });
    }
  }

  return { changes, unchanged: changes.length === 0 };
}

function isAtxHeading(line: string): boolean {
  // ATX heading: 1–6 leading `#` followed by space, per CommonMark.
  // We accept the common "no space" form (`#heading`) too — some
  // SKILL.md files have it.
  return /^#{1,6}(\s|$)/.test(line);
}

/**
 * Format a MarkdownDiff as a human-readable string suitable for
 * `arete skill diff <name>` (non-JSON output). Each change shows the
 * section heading and the body deltas in a unified-diff-ish style.
 *
 * Not a strict unified diff (no `@@` hunks, no line numbers). The
 * goal is reviewability; a real `diff -u` of the underlying files is
 * one shell pipe away if line-level precision is needed.
 */
export function formatMarkdownDiff(diff: MarkdownDiff): string {
  if (diff.unchanged) return 'No section-level changes.\n';
  const out: string[] = [];
  for (const change of diff.changes) {
    if (change.kind === 'added') {
      out.push(`+ ADDED: ${change.heading}`);
      out.push(indent(change.body, '+ '));
      out.push('');
    } else if (change.kind === 'removed') {
      out.push(`- REMOVED: ${change.heading}`);
      out.push(indent(change.body, '- '));
      out.push('');
    } else {
      out.push(`~ MODIFIED: ${change.heading}`);
      out.push('  --- before');
      out.push(indent(change.bodyA, '- '));
      out.push('  +++ after');
      out.push(indent(change.bodyB, '+ '));
      out.push('');
    }
  }
  return out.join('\n');
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

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
  kind:
    | 'unchanged'
    | 'local-only'
    | 'incoming-only'
    | 'both-agree'
    | 'conflict'
    | 'local-add'
    | 'incoming-add'
    | 'incoming-restore'
    | 'local-keep-removed';
}

export function threeWayMergeSections(
  base: string,
  local: string,
  incoming: string,
): MergeResult {
  const baseSections = parseMarkdownSections(base);
  const localSections = parseMarkdownSections(local);
  const incomingSections = parseMarkdownSections(incoming);

  const baseMap = new Map(baseSections.map((s) => [s.heading, s.body]));
  const localMap = new Map(localSections.map((s) => [s.heading, s.body]));
  const incomingMap = new Map(incomingSections.map((s) => [s.heading, s.body]));

  // Output order: union of (local order, then incoming-only sections in
  // their relative order). This keeps the user fork's section ordering
  // stable post-merge and only appends genuinely new shipped sections at
  // the end.
  const orderedHeadings: string[] = [];
  const seen = new Set<string>();
  for (const s of localSections) {
    orderedHeadings.push(s.heading);
    seen.add(s.heading);
  }
  for (const s of incomingSections) {
    if (!seen.has(s.heading)) {
      orderedHeadings.push(s.heading);
      seen.add(s.heading);
    }
  }
  for (const s of baseSections) {
    if (!seen.has(s.heading)) {
      orderedHeadings.push(s.heading);
      seen.add(s.heading);
    }
  }

  const hunks: MergeHunk[] = [];
  const conflicts: string[] = [];
  const outputSections: { heading: string; body: string }[] = [];

  for (const heading of orderedHeadings) {
    const inBase = baseMap.has(heading);
    const inLocal = localMap.has(heading);
    const inIncoming = incomingMap.has(heading);

    // Local-add (not in base, not in incoming) → keep local.
    if (!inBase && inLocal && !inIncoming) {
      hunks.push({ heading, kind: 'local-add' });
      outputSections.push({ heading, body: localMap.get(heading)! });
      continue;
    }
    // Incoming-add (not in base, not in local) → take incoming.
    if (!inBase && !inLocal && inIncoming) {
      hunks.push({ heading, kind: 'incoming-add' });
      outputSections.push({ heading, body: incomingMap.get(heading)! });
      continue;
    }
    // Both add the same section (not in base) → if bodies match, take
    // either; if bodies differ, conflict.
    if (!inBase && inLocal && inIncoming) {
      const lb = localMap.get(heading)!;
      const ib = incomingMap.get(heading)!;
      if (lb === ib) {
        hunks.push({ heading, kind: 'both-agree' });
        outputSections.push({ heading, body: lb });
      } else {
        hunks.push({ heading, kind: 'conflict' });
        conflicts.push(heading);
        outputSections.push({
          heading,
          body: renderConflictBody(lb, ib),
        });
      }
      continue;
    }

    // From here on: section was in base.
    const baseBody = baseMap.get(heading) ?? '';
    const localChanged = inLocal && localMap.get(heading) !== baseBody;
    const incomingChanged = inIncoming && incomingMap.get(heading) !== baseBody;

    // Local removed it; incoming kept it (changed or not).
    if (!inLocal && inIncoming) {
      hunks.push({ heading, kind: 'incoming-restore' });
      outputSections.push({ heading, body: incomingMap.get(heading)! });
      continue;
    }
    // Incoming removed it; local kept it.
    if (inLocal && !inIncoming) {
      hunks.push({ heading, kind: 'local-keep-removed' });
      outputSections.push({ heading, body: localMap.get(heading)! });
      continue;
    }
    // Neither side has it (both removed) → drop.
    if (!inLocal && !inIncoming) {
      // No-op: section is fully gone.
      continue;
    }

    // Both have it.
    const localBody = localMap.get(heading)!;
    const incomingBody = incomingMap.get(heading)!;

    if (!localChanged && !incomingChanged) {
      hunks.push({ heading, kind: 'unchanged' });
      outputSections.push({ heading, body: localBody });
    } else if (localChanged && !incomingChanged) {
      hunks.push({ heading, kind: 'local-only' });
      outputSections.push({ heading, body: localBody });
    } else if (!localChanged && incomingChanged) {
      hunks.push({ heading, kind: 'incoming-only' });
      outputSections.push({ heading, body: incomingBody });
    } else if (localBody === incomingBody) {
      hunks.push({ heading, kind: 'both-agree' });
      outputSections.push({ heading, body: localBody });
    } else {
      hunks.push({ heading, kind: 'conflict' });
      conflicts.push(heading);
      outputSections.push({
        heading,
        body: renderConflictBody(localBody, incomingBody),
      });
    }
  }

  return {
    merged: renderSections(outputSections),
    conflicts,
    hunks,
    clean: conflicts.length === 0,
  };
}

function renderConflictBody(localBody: string, incomingBody: string): string {
  return [
    '<<<<<<< local (.agents/skills/)',
    localBody,
    '=======',
    incomingBody,
    '>>>>>>> incoming (.arete/skills/)',
  ].join('\n');
}

/**
 * Render a list of sections back to a markdown document. Inverse of
 * `parseMarkdownSections` for the structural fields.
 */
export function renderSections(sections: { heading: string; body: string }[]): string {
  const out: string[] = [];
  for (const section of sections) {
    if (section.heading === FRONTMATTER_HEADING) {
      out.push('---');
      out.push(section.body);
      out.push('---');
      out.push('');
      continue;
    }
    if (section.heading === PREAMBLE_HEADING) {
      out.push(section.body);
      continue;
    }
    out.push(section.heading);
    if (section.body.length > 0) {
      out.push(section.body);
    }
  }
  return out.join('\n');
}

/** Constants for callers that need to filter out synthetic sections. */
export const SYNTHETIC_FRONTMATTER_HEADING = FRONTMATTER_HEADING;
export const SYNTHETIC_PREAMBLE_HEADING = PREAMBLE_HEADING;
