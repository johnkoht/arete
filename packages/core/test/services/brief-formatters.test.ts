/**
 * Phase 9 — Brief markdown formatters tests.
 *
 * AC11: per-section + global truncation markers; empty section drop;
 * stable markdown shape.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPersonBriefMarkdown,
  formatProjectBriefMarkdown,
  formatAreaBriefMarkdown,
  formatMeetingBriefMarkdown,
} from '../../src/services/brief-formatters.js';
import type {
  PersonBrief,
  ProjectBrief,
  AreaBrief,
  MeetingBrief,
} from '../../src/models/index.js';

describe('brief-formatters', () => {
  it('formatPersonBriefMarkdown — emits header + sections + sources', () => {
    const brief: PersonBrief = {
      mode: 'person',
      subject: 'Lindsay Gray',
      subjectSlug: 'lindsay-gray',
      sections: [
        {
          heading: 'Recent meetings (2)',
          bullets: ['**A** (2026-05-15) — `path/a.md`', '**B** (2026-05-08) — `path/b.md`'],
        },
        {
          heading: 'Memory highlights',
          bullets: ['**Stances:**', '  - supportive of X'],
        },
      ],
      sources: ['people/internal/lindsay-gray.md', 'resources/meetings/path/a.md'],
      truncated: false,
      metadata: { role: 'Manager', team: 'Product' },
    };

    const md = formatPersonBriefMarkdown(brief);
    assert.ok(md.startsWith('# Brief: Lindsay Gray'));
    assert.ok(md.includes('**Role:** Manager'));
    assert.ok(md.includes('## Recent meetings (2)'));
    assert.ok(md.includes('## Memory highlights'));
    assert.ok(md.includes('## Sources'));
    assert.ok(md.includes('`people/internal/lindsay-gray.md`'));
  });

  it('emits per-section truncation marker when section.truncated is set', () => {
    const brief: PersonBrief = {
      mode: 'person',
      subject: 'X',
      subjectSlug: 'x',
      sections: [
        {
          heading: 'Open commitments (10)',
          bullets: ['c1', 'c2'],
          truncated: true,
          truncatedCount: 8,
        },
      ],
      sources: [],
      truncated: false,
      metadata: {},
    };
    const md = formatPersonBriefMarkdown(brief);
    assert.ok(/_\[truncated: 8 items not shown — older items dropped first\]_/.test(md), md);
  });

  it('emits global truncation marker when brief.truncated is set', () => {
    const brief: ProjectBrief = {
      mode: 'project',
      subject: 'Glance 2 MVP',
      subjectSlug: 'glance-2-mvp',
      sections: [
        {
          heading: 'Project context',
          bullets: [],
          body: 'short body',
        },
      ],
      sources: ['projects/active/glance-2-mvp/README.md'],
      truncated: true,
      truncatedSections: ['Related wiki pages', 'Sources'],
      metadata: { area: 'glance-modernization', status: 'active' },
    };
    const md = formatProjectBriefMarkdown(brief);
    assert.ok(/_\[truncated: 2 sections dropped — Related wiki pages, Sources\]_/.test(md), md);
  });

  it('empty section drop — formatter only renders provided sections', () => {
    const brief: AreaBrief = {
      mode: 'area',
      subject: 'Area X',
      subjectSlug: 'area-x',
      sections: [
        // Only one section provided — formatter never produces a `## (no decisions)` placeholder.
        { heading: 'Area memory', bullets: [], body: 'foo' },
      ],
      sources: [],
      truncated: false,
      metadata: { name: 'Area X' },
    };
    const md = formatAreaBriefMarkdown(brief);
    assert.ok(md.includes('## Area memory'));
    assert.ok(!md.includes('## Recent meetings'));
    assert.ok(!md.includes('## Decisions'));
    assert.ok(!md.includes('N/A'));
  });

  it('formatMeetingBriefMarkdown — unresolved AC4d path renders warning + sections with (unresolved) bullets', () => {
    const brief: MeetingBrief = {
      mode: 'meeting',
      subject: 'Random title',
      subjectSlug: 'random title',
      sections: [
        { heading: 'Attendees', bullets: ['_(unresolved — no calendar match, no saved file)_'] },
        { heading: 'Meeting area & projects', bullets: ['_(unresolved — no calendar match, no saved file)_'] },
      ],
      sources: [],
      truncated: false,
      metadata: {
        title: 'Random title',
        attendees: [],
        resolved: false,
        unresolved: true,
      },
      attendeeMiniBriefs: [],
    };
    const md = formatMeetingBriefMarkdown(brief);
    assert.ok(/_\*\*Unresolved\*\*: no calendar match/.test(md));
    assert.ok(/\(unresolved — no calendar match, no saved file\)/.test(md));
  });

  it('formatMeetingBriefMarkdown — projectOverride and inferredArea surfaced in header', () => {
    const brief: MeetingBrief = {
      mode: 'meeting',
      subject: 'John / Lindsay 1:1',
      subjectSlug: '2026-05-15-john-lindsay-11',
      sections: [],
      sources: [],
      truncated: false,
      metadata: {
        title: 'John / Lindsay 1:1',
        date: '2026-05-15',
        attendees: ['John', 'Lindsay'],
        resolved: true,
        projectOverride: 'glance-2-mvp',
      },
      attendeeMiniBriefs: [],
    };
    const md = formatMeetingBriefMarkdown(brief);
    assert.ok(/Project pinned via `--project glance-2-mvp`/.test(md));
  });
});
