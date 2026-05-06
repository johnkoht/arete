/**
 * Tests for markdown-diff utility (Phase 3 Step 4).
 *
 * Covers:
 * - parseMarkdownSections: frontmatter, preamble, multi-heading docs
 * - diffMarkdownSections: unchanged / added / removed / modified
 * - threeWayMergeSections: clean merges, conflicts, removals
 * - formatMarkdownDiff: human-readable output sanity
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMarkdownSections,
  diffMarkdownSections,
  threeWayMergeSections,
  formatMarkdownDiff,
  renderSections,
  SYNTHETIC_FRONTMATTER_HEADING,
  SYNTHETIC_PREAMBLE_HEADING,
} from '../../src/utils/markdown-diff.js';

describe('parseMarkdownSections', () => {
  it('returns [] on empty input', () => {
    assert.deepEqual(parseMarkdownSections(''), []);
  });

  it('parses a document with one section', () => {
    const md = '# Title\n\nBody text\n';
    const sections = parseMarkdownSections(md);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].heading, '# Title');
    assert.match(sections[0].body, /Body text/);
  });

  it('parses multiple sections in order', () => {
    const md = '# A\nbody A\n## B\nbody B\n## C\nbody C\n';
    const sections = parseMarkdownSections(md);
    assert.equal(sections.length, 3);
    assert.equal(sections[0].heading, '# A');
    assert.equal(sections[1].heading, '## B');
    assert.equal(sections[2].heading, '## C');
  });

  it('captures frontmatter as a synthetic section', () => {
    const md = '---\ntitle: foo\nname: bar\n---\n\n# Section\nBody\n';
    const sections = parseMarkdownSections(md);
    assert.equal(sections[0].heading, SYNTHETIC_FRONTMATTER_HEADING);
    assert.match(sections[0].body, /title: foo/);
    assert.equal(sections[1].heading, '# Section');
  });

  it('captures content above the first heading as preamble', () => {
    const md = 'Lead-in paragraph.\n\nMore lead-in.\n\n# Section\nBody\n';
    const sections = parseMarkdownSections(md);
    assert.equal(sections[0].heading, SYNTHETIC_PREAMBLE_HEADING);
    assert.match(sections[0].body, /Lead-in paragraph/);
    assert.equal(sections[1].heading, '# Section');
  });

  it('handles a doc with only frontmatter and no body', () => {
    const md = '---\nfoo: bar\n---\n';
    const sections = parseMarkdownSections(md);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].heading, SYNTHETIC_FRONTMATTER_HEADING);
  });

  it('handles malformed frontmatter (no closing fence) as preamble', () => {
    const md = '---\nfoo: bar\nno-closer\n# Heading\nBody\n';
    const sections = parseMarkdownSections(md);
    // The unmatched `---` opens but never closes; treated as preamble.
    assert.equal(sections[0].heading, SYNTHETIC_PREAMBLE_HEADING);
  });

  it('matches deep ATX heading levels', () => {
    const md = '#### Heading\nbody\n';
    const sections = parseMarkdownSections(md);
    assert.equal(sections[0].heading, '#### Heading');
  });
});

describe('diffMarkdownSections', () => {
  it('returns unchanged=true for identical input', () => {
    const a = '# Title\nbody\n';
    const diff = diffMarkdownSections(a, a);
    assert.equal(diff.unchanged, true);
    assert.deepEqual(diff.changes, []);
  });

  it('reports added sections', () => {
    const a = '# A\nbody A\n';
    const b = '# A\nbody A\n## B\nbody B\n';
    const diff = diffMarkdownSections(a, b);
    assert.equal(diff.unchanged, false);
    assert.equal(diff.changes.length, 1);
    assert.equal(diff.changes[0].kind, 'added');
    if (diff.changes[0].kind === 'added') {
      assert.equal(diff.changes[0].heading, '## B');
    }
  });

  it('reports removed sections', () => {
    const a = '# A\nbody A\n## B\nbody B\n';
    const b = '# A\nbody A\n';
    const diff = diffMarkdownSections(a, b);
    assert.equal(diff.changes.length, 1);
    assert.equal(diff.changes[0].kind, 'removed');
  });

  it('reports modified sections', () => {
    const a = '# A\noriginal body\n';
    const b = '# A\nrewritten body\n';
    const diff = diffMarkdownSections(a, b);
    assert.equal(diff.changes.length, 1);
    assert.equal(diff.changes[0].kind, 'modified');
  });

  it('captures all three kinds in one diff', () => {
    const a = '# A\nold\n## B\nbody\n';
    const b = '# A\nrewritten\n## C\nnew\n';
    const diff = diffMarkdownSections(a, b);
    assert.equal(diff.changes.length, 3);
    const kinds = diff.changes.map((c) => c.kind).sort();
    assert.deepEqual(kinds, ['added', 'modified', 'removed']);
  });

  it('reports frontmatter modifications as a section change', () => {
    const a = '---\ntitle: foo\n---\n\n# Section\nbody\n';
    const b = '---\ntitle: bar\n---\n\n# Section\nbody\n';
    const diff = diffMarkdownSections(a, b);
    assert.equal(diff.changes.length, 1);
    assert.equal(diff.changes[0].kind, 'modified');
    if (diff.changes[0].kind === 'modified') {
      assert.equal(diff.changes[0].heading, SYNTHETIC_FRONTMATTER_HEADING);
    }
  });
});

describe('threeWayMergeSections', () => {
  it('clean merge: only incoming changed', () => {
    const base = '# A\nbody\n## B\nbody B\n';
    const local = base; // user has not edited
    const incoming = '# A\nbody\n## B\nrewritten B\n';
    const result = threeWayMergeSections(base, local, incoming);
    assert.equal(result.clean, true);
    assert.deepEqual(result.conflicts, []);
    assert.match(result.merged, /rewritten B/);
  });

  it('clean merge: only local changed', () => {
    const base = '# A\nbody\n## B\nbody B\n';
    const local = '# A\nbody\n## B\nuser-edited B\n';
    const incoming = base;
    const result = threeWayMergeSections(base, local, incoming);
    assert.equal(result.clean, true);
    assert.match(result.merged, /user-edited B/);
  });

  it('both-agree: local and incoming both made the same change', () => {
    const base = '# A\nbody\n';
    const local = '# A\nrewritten\n';
    const incoming = '# A\nrewritten\n';
    const result = threeWayMergeSections(base, local, incoming);
    assert.equal(result.clean, true);
    assert.equal(result.hunks[0].kind, 'both-agree');
  });

  it('conflict: local and incoming both changed differently', () => {
    const base = '# A\nbody\n';
    const local = '# A\nuser version\n';
    const incoming = '# A\nupstream version\n';
    const result = threeWayMergeSections(base, local, incoming);
    assert.equal(result.clean, false);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0], '# A');
    assert.match(result.merged, /<<<<<<< local/);
    assert.match(result.merged, /=======/);
    assert.match(result.merged, />>>>>>> incoming/);
    assert.match(result.merged, /user version/);
    assert.match(result.merged, /upstream version/);
  });

  it('local-add: section only in local survives', () => {
    const base = '# A\nbody\n';
    const local = '# A\nbody\n## C\nuser-only\n';
    const incoming = '# A\nbody\n';
    const result = threeWayMergeSections(base, local, incoming);
    assert.equal(result.clean, true);
    assert.match(result.merged, /user-only/);
  });

  it('incoming-add: new shipped section is taken', () => {
    const base = '# A\nbody\n';
    const local = '# A\nbody\n';
    const incoming = '# A\nbody\n## D\nnew shipped\n';
    const result = threeWayMergeSections(base, local, incoming);
    assert.equal(result.clean, true);
    assert.match(result.merged, /new shipped/);
  });

  it('local-keep-removed: incoming removed a section local kept', () => {
    const base = '# A\nbody\n## B\nbody B\n';
    const local = base;
    const incoming = '# A\nbody\n';
    const result = threeWayMergeSections(base, local, incoming);
    assert.equal(result.clean, true);
    // Local kept B; merge keeps it.
    assert.match(result.merged, /body B/);
    assert(result.hunks.some((h) => h.kind === 'local-keep-removed' && h.heading === '## B'));
  });

  it('incoming-restore: local removed but incoming kept it', () => {
    const base = '# A\nbody\n## B\nbody B\n';
    const local = '# A\nbody\n'; // user dropped B
    const incoming = '# A\nbody\n## B\nrenamed B body\n'; // upstream kept (and changed) B
    const result = threeWayMergeSections(base, local, incoming);
    assert.equal(result.clean, true);
    // Conservative policy: re-add from incoming.
    assert.match(result.merged, /renamed B body/);
    assert(result.hunks.some((h) => h.kind === 'incoming-restore' && h.heading === '## B'));
  });

  it('preserves section ordering: local order first, incoming-only at end', () => {
    const base = '# A\nA\n## B\nB\n';
    const local = '# A\nA-edit\n## B\nB\n';
    const incoming = '# A\nA\n## B\nB\n## C\nshipped C\n';
    const result = threeWayMergeSections(base, local, incoming);
    assert.equal(result.clean, true);
    // Order: # A, ## B, ## C. # A's body is local's edit, ## C's body is incoming.
    const aIdx = result.merged.indexOf('# A');
    const bIdx = result.merged.indexOf('## B');
    const cIdx = result.merged.indexOf('## C');
    assert(aIdx < bIdx);
    assert(bIdx < cIdx);
    assert.match(result.merged, /A-edit/);
    assert.match(result.merged, /shipped C/);
  });
});

describe('formatMarkdownDiff', () => {
  it('says no changes for unchanged diff', () => {
    const out = formatMarkdownDiff({ changes: [], unchanged: true });
    assert.match(out, /No section-level changes/);
  });

  it('formats added/removed/modified entries', () => {
    const a = '# A\nbody\n## B\nbody\n';
    const b = '# A\nrewritten\n## C\nnew\n';
    const diff = diffMarkdownSections(a, b);
    const out = formatMarkdownDiff(diff);
    assert.match(out, /MODIFIED.*# A/);
    assert.match(out, /REMOVED.*## B/);
    assert.match(out, /ADDED.*## C/);
  });
});

describe('renderSections roundtrip', () => {
  it('parse → render preserves structural content', () => {
    const md = '# A\nbody A\n## B\nbody B\n';
    const sections = parseMarkdownSections(md);
    const rendered = renderSections(sections);
    // We don't require byte-equality (newlines may be normalized) but
    // both sections should round-trip.
    assert.match(rendered, /# A\nbody A/);
    assert.match(rendered, /## B\nbody B/);
  });

  it('round-trips frontmatter', () => {
    const md = '---\ntitle: foo\n---\n\n# A\nbody\n';
    const sections = parseMarkdownSections(md);
    const rendered = renderSections(sections);
    assert.match(rendered, /^---\ntitle: foo\n---/);
    assert.match(rendered, /# A\nbody/);
  });
});
