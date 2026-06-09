import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderOrgEntityPage,
  parseOrgEntityPage,
  upsertOrgMemorySection,
  extractOrgMemorySection,
  AUTO_ORG_MEMORY_START,
  AUTO_ORG_MEMORY_END,
  type OrgEntity,
} from '../../src/models/org-entity.js';

function fixture(overrides: Partial<OrgEntity> = {}): OrgEntity {
  return {
    frontmatter: {
      org_slug: 'cover-whale',
      status: 'active',
      aliases: ['cw', 'coverwhale'],
      people: ['anthony-avina', 'carla-rice'],
      related_topics: ['cover-whale-templates', 'rollout'],
      first_seen: '2026-03-02',
      last_refreshed: '2026-04-22',
      sources_integrated: [
        'resources/meetings/2026-03-02-foo.md',
        'resources/meetings/2026-04-16-bar.md',
      ],
      ...(overrides.frontmatter ?? {}),
    },
    autoSection:
      overrides.autoSection ??
      [
        '- **Last seen on**: 2026-04-22',
        '- **Recent meetings**: [[2026-04-16-bar]]',
        '- **Open items**: 2',
      ].join('\n'),
  };
}

describe('org-entity model', () => {
  it('round-trips frontmatter + auto section losslessly', () => {
    const original = fixture();
    const md = renderOrgEntityPage(original);
    const parsed = parseOrgEntityPage(md);
    assert.notEqual(parsed, null);
    assert.deepEqual(parsed!.frontmatter, original.frontmatter);
    assert.equal(parsed!.autoSection, original.autoSection);
  });

  it('emits sentinel comments around the auto section', () => {
    const md = renderOrgEntityPage(fixture());
    assert.match(md, new RegExp(AUTO_ORG_MEMORY_START));
    assert.match(md, new RegExp(AUTO_ORG_MEMORY_END));
  });

  it('extractOrgMemorySection returns the section content', () => {
    const md = renderOrgEntityPage(fixture());
    const section = extractOrgMemorySection(md);
    assert.notEqual(section, null);
    assert.match(section!, /Last seen on/);
  });

  it('extractOrgMemorySection returns null when sentinels absent', () => {
    assert.equal(extractOrgMemorySection('# Cover Whale\n\nFreeform notes.'), null);
  });

  it('upsertOrgMemorySection replaces existing auto section', () => {
    const md = renderOrgEntityPage(fixture());
    const updated = upsertOrgMemorySection(md, '- **Last seen on**: 2026-04-30');
    const section = extractOrgMemorySection(updated);
    assert.equal(section, '- **Last seen on**: 2026-04-30');
  });

  it('upsertOrgMemorySection preserves user content outside sentinels', () => {
    const md = renderOrgEntityPage(fixture());
    const userEdited = md.replace(
      AUTO_ORG_MEMORY_START,
      '## My private notes\n\nThis is John\'s notes about cover whale.\n\n' + AUTO_ORG_MEMORY_START,
    );
    const updated = upsertOrgMemorySection(userEdited, 'new auto content');
    assert.match(updated, /My private notes/);
    assert.match(updated, /This is John's notes/);
    assert.match(updated, /new auto content/);
    // Old auto content should be gone.
    assert.doesNotMatch(updated, /Last seen on: 2026-04-22/);
  });

  it('upsertOrgMemorySection appends sentinels when none exist', () => {
    const fileWithoutSentinels = '# Cover Whale\n\nUser-authored prose.\n';
    const updated = upsertOrgMemorySection(fileWithoutSentinels, 'auto content');
    assert.match(updated, /User-authored prose/);
    assert.match(updated, new RegExp(AUTO_ORG_MEMORY_START));
    assert.match(updated, /auto content/);
    assert.match(updated, new RegExp(AUTO_ORG_MEMORY_END));
  });

  it('parses page with empty auto section', () => {
    const md = renderOrgEntityPage(fixture({ autoSection: '' }));
    const parsed = parseOrgEntityPage(md);
    assert.notEqual(parsed, null);
    assert.equal(parsed!.autoSection, '');
  });

  it('returns null for missing frontmatter', () => {
    assert.equal(parseOrgEntityPage('# Cover Whale\n\nNo frontmatter.'), null);
  });

  it('returns null for missing org_slug', () => {
    const md = `---\nstatus: active\nfirst_seen: 2026-03-02\nlast_refreshed: 2026-04-22\n---\n\n# t`;
    assert.equal(parseOrgEntityPage(md), null);
  });

  it('returns null for invalid status', () => {
    const md = `---\norg_slug: foo\nstatus: neverheardofit\nfirst_seen: 2026-03-02\nlast_refreshed: 2026-04-22\n---\n\n# t`;
    assert.equal(parseOrgEntityPage(md), null);
  });
});
