import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderTopicPage,
  parseTopicPage,
  getTopicHeadline,
  selectSectionsForBudget,
  SECTION_NAMES,
  type TopicPage,
} from '../../src/models/topic-page.js';

function fixturePage(overrides: Partial<TopicPage> = {}): TopicPage {
  return {
    frontmatter: {
      topic_slug: 'cover-whale-templates',
      area: 'glance-communications',
      status: 'active',
      aliases: ['cw-templates', 'cover-whale-email'],
      entities: {
        people: ['anthony-avina', 'carla-rice'],
        related_topics: ['leap-templates', 'signature-logic'],
      },
      first_seen: '2026-03-02',
      last_refreshed: '2026-04-22',
      sources_integrated: [
        { path: 'resources/meetings/2026-03-02-foo.md', date: '2026-03-02', hash: 'a1b2c3d4' },
        { path: 'resources/meetings/2026-04-16-bar.md', date: '2026-04-16', hash: '9f8e7d6c' },
      ],
      ...(overrides.frontmatter ?? {}),
    },
    sections: {
      'Current state': 'Staging-validated; awaiting pilot adjusters.',
      'Why/background': 'Chosen after POP rollout. Account loss risk.',
      'Rollout/timeline': '1. Internal team\n2. Cargo adjusters\n3. Full production',
      'Open questions': '- Carrier-name language required on every email?',
      'Source trail': '- [[2026-03-02-foo]]\n- [[2026-04-16-bar]]',
      'Change log': '- 2026-04-22: reimport validated',
      ...(overrides.sections ?? {}),
    },
  };
}

describe('renderTopicPage', () => {
  it('renders valid markdown with frontmatter and sections', () => {
    const output = renderTopicPage(fixturePage());
    assert.match(output, /^---\n/);
    assert.match(output, /topic_slug: cover-whale-templates/);
    assert.match(output, /\n---\n/);
    assert.match(output, /^# Cover Whale Templates$/m);
    assert.match(output, /^## Current state$/m);
    assert.match(output, /^## Change log$/m);
  });

  it('renders sections in canonical SECTION_NAMES order', () => {
    const output = renderTopicPage(fixturePage());
    const indices = SECTION_NAMES.map((n) => output.indexOf(`## ${n}`)).filter(
      (i) => i >= 0,
    );
    for (let i = 1; i < indices.length; i++) {
      assert.ok(indices[i] > indices[i - 1], `Section at index ${i} out of order`);
    }
  });

  it('omits sections that are undefined or empty', () => {
    const page: TopicPage = {
      frontmatter: fixturePage().frontmatter,
      sections: {
        'Current state': 'Something.',
        'Why/background': '',
        'Known gaps': '   ',
      },
    };
    const output = renderTopicPage(page);
    assert.match(output, /^## Current state$/m);
    assert.doesNotMatch(output, /^## Why\/background$/m);
    assert.doesNotMatch(output, /^## Known gaps$/m);
    assert.doesNotMatch(output, /^## Open questions$/m);
  });

  it('is byte-equal for equal inputs (idempotency)', () => {
    const page = fixturePage();
    const a = renderTopicPage(page);
    const b = renderTopicPage(page);
    assert.strictEqual(a, b);
  });

  it('is stable under shuffled aliases / people / related_topics', () => {
    const ordered = fixturePage();
    const shuffled = fixturePage({
      frontmatter: {
        ...ordered.frontmatter,
        aliases: ['cover-whale-email', 'cw-templates'],
        entities: {
          people: ['carla-rice', 'anthony-avina'],
          related_topics: ['signature-logic', 'leap-templates'],
        },
      },
    });
    assert.strictEqual(renderTopicPage(ordered), renderTopicPage(shuffled));
  });

  it('does not embed wall-clock time or Date.now() anywhere', () => {
    const page = fixturePage();
    const before = renderTopicPage(page);
    // Advance simulated clock in no-op fashion; the renderer must not read it.
    const after = renderTopicPage(page);
    assert.strictEqual(before, after);
    assert.doesNotMatch(before, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/); // no ISO wall-clock
  });

  it('omits empty aliases / entities from frontmatter', () => {
    const page = fixturePage({
      frontmatter: {
        topic_slug: 'x',
        status: 'new',
        first_seen: '2026-04-22',
        last_refreshed: '2026-04-22',
        sources_integrated: [],
        aliases: [],
        entities: { people: [], related_topics: [] },
      },
    });
    const output = renderTopicPage(page);
    assert.doesNotMatch(output, /aliases:/);
    assert.doesNotMatch(output, /entities:/);
  });

  it('ends with exactly one trailing newline', () => {
    const output = renderTopicPage(fixturePage());
    assert.ok(output.endsWith('\n'));
    assert.ok(!output.endsWith('\n\n'));
  });
});

describe('parseTopicPage', () => {
  it('returns null for non-topic-page content', () => {
    assert.strictEqual(parseTopicPage('# Not a topic page'), null);
    assert.strictEqual(parseTopicPage(''), null);
    assert.strictEqual(parseTopicPage('---\n---\n'), null); // no required fields
  });

  it('returns null for malformed YAML frontmatter', () => {
    assert.strictEqual(parseTopicPage('---\n: : :\n---\n'), null);
  });

  it('returns null when required fields are missing', () => {
    const noSlug = '---\nstatus: active\nfirst_seen: 2026-04-22\nlast_refreshed: 2026-04-22\nsources_integrated: []\n---\n';
    assert.strictEqual(parseTopicPage(noSlug), null);

    const noStatus = '---\ntopic_slug: x\nfirst_seen: 2026-04-22\nlast_refreshed: 2026-04-22\nsources_integrated: []\n---\n';
    assert.strictEqual(parseTopicPage(noStatus), null);
  });

  it('rejects invalid status values', () => {
    const badStatus = '---\ntopic_slug: x\nstatus: bogus\nfirst_seen: 2026-04-22\nlast_refreshed: 2026-04-22\nsources_integrated: []\n---\n';
    assert.strictEqual(parseTopicPage(badStatus), null);
  });

  it('extracts sections by canonical heading names', () => {
    const input =
      '---\ntopic_slug: x\nstatus: active\nfirst_seen: 2026-04-22\nlast_refreshed: 2026-04-22\nsources_integrated: []\n---\n\n# X\n\n## Current state\nFoo.\n\n## Change log\n- a\n- b\n';
    const parsed = parseTopicPage(input);
    assert.ok(parsed !== null);
    assert.strictEqual(parsed.sections['Current state'], 'Foo.');
    assert.strictEqual(parsed.sections['Change log'], '- a\n- b');
  });

  it('ignores unknown section headings silently', () => {
    const input =
      '---\ntopic_slug: x\nstatus: active\nfirst_seen: 2026-04-22\nlast_refreshed: 2026-04-22\nsources_integrated: []\n---\n\n## Bogus\ntext\n\n## Current state\nok.\n';
    const parsed = parseTopicPage(input);
    assert.ok(parsed !== null);
    assert.strictEqual(parsed.sections['Current state'], 'ok.');
    // Bogus section body never leaks into a valid section
    assert.ok(!JSON.stringify(parsed.sections).includes('text'));
  });
});

describe('getTopicHeadline', () => {
  it('returns first non-empty line of Current state', () => {
    const page: TopicPage = {
      frontmatter: fixturePage().frontmatter,
      sections: { 'Current state': 'Staging-validated.\n\nSecond paragraph.' },
    };
    assert.strictEqual(getTopicHeadline(page), 'Staging-validated.');
  });

  it('returns empty string when Current state missing', () => {
    const page: TopicPage = {
      frontmatter: fixturePage().frontmatter,
      sections: { 'Change log': '- foo' },
    };
    assert.strictEqual(getTopicHeadline(page), '');
  });

  it('truncates long headlines on a word boundary', () => {
    const long = 'a '.repeat(200).trim();
    const page: TopicPage = {
      frontmatter: fixturePage().frontmatter,
      sections: { 'Current state': long },
    };
    const headline = getTopicHeadline(page, 40);
    assert.ok(headline.length <= 41);
    assert.ok(headline.endsWith('…'));
    assert.ok(!headline.includes('  '));
  });

  it('skips blank first lines', () => {
    const page: TopicPage = {
      frontmatter: fixturePage().frontmatter,
      sections: { 'Current state': '\n\n   \nReal content here.' },
    };
    assert.strictEqual(getTopicHeadline(page), 'Real content here.');
  });
});

describe('selectSectionsForBudget', () => {
  it('always includes Current state first', () => {
    const page: TopicPage = {
      frontmatter: fixturePage().frontmatter,
      sections: {
        'Current state': 'Status summary.',
        'Why/background': 'Background prose.',
      },
    };
    const out = selectSectionsForBudget(page, 100);
    assert.ok(out.startsWith('## Current state'));
    assert.ok(out.includes('Why/background'));
  });

  it('includes Current state even if it alone exceeds budget', () => {
    const longCurrent = 'word '.repeat(500).trim();
    const page: TopicPage = {
      frontmatter: fixturePage().frontmatter,
      sections: {
        'Current state': longCurrent,
        'Why/background': 'other',
      },
    };
    const out = selectSectionsForBudget(page, 50);
    assert.ok(out.includes(longCurrent));
    // Remaining budget exhausted — second section excluded.
    assert.ok(!out.includes('Why/background'));
  });

  it('respects priority order (Open questions before Why/background)', () => {
    const page: TopicPage = {
      frontmatter: fixturePage().frontmatter,
      sections: {
        'Current state': 'cur',
        'Why/background': 'bg '.repeat(20),
        'Open questions': 'qs',
      },
    };
    const out = selectSectionsForBudget(page, 10);
    // Current state (1w) + Open questions (1w) fit; Why/background excluded
    assert.ok(out.includes('Open questions'));
    assert.ok(!out.includes('Why/background'));
  });

  it('emits no frontmatter or title', () => {
    const out = selectSectionsForBudget(fixturePage(), 1000);
    assert.ok(!out.includes('---'));
    assert.ok(!out.includes('# Cover Whale Templates'));
  });

  it('returns empty string for page with no sections', () => {
    const page: TopicPage = {
      frontmatter: fixturePage().frontmatter,
      sections: {},
    };
    assert.strictEqual(selectSectionsForBudget(page, 100), '');
  });
});

describe('render/parse round-trip', () => {
  it('is lossless for a full page', () => {
    const original = fixturePage();
    const rendered = renderTopicPage(original);
    const parsed = parseTopicPage(rendered);
    assert.ok(parsed !== null);
    const rerendered = renderTopicPage(parsed);
    assert.strictEqual(rendered, rerendered);
  });

  it('is lossless for minimal page', () => {
    const minimal: TopicPage = {
      frontmatter: {
        topic_slug: 'minimal',
        status: 'new',
        first_seen: '2026-04-22',
        last_refreshed: '2026-04-22',
        sources_integrated: [],
      },
      sections: {
        'Current state': 'Nothing yet.',
      },
    };
    const rendered = renderTopicPage(minimal);
    const parsed = parseTopicPage(rendered);
    assert.ok(parsed !== null);
    assert.deepStrictEqual(parsed.frontmatter.topic_slug, 'minimal');
    assert.strictEqual(renderTopicPage(parsed), rendered);
  });

  it('preserves sources_integrated order across round-trip', () => {
    const page = fixturePage();
    const rendered = renderTopicPage(page);
    const parsed = parseTopicPage(rendered);
    assert.ok(parsed !== null);
    assert.deepStrictEqual(
      parsed.frontmatter.sources_integrated,
      page.frontmatter.sources_integrated,
    );
  });
});
