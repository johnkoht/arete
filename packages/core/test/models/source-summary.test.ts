import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderSourceSummary,
  parseSourceSummary,
  MEETING_SECTION_NAMES,
  INBOX_SECTION_NAMES,
  type MeetingSummary,
  type InboxSummary,
} from '../../src/models/source-summary.js';

function meetingFixture(overrides: Partial<MeetingSummary> = {}): MeetingSummary {
  return {
    frontmatter: {
      source_path: 'resources/meetings/2026-04-22-cover-whale-sync.md',
      source_type: 'meeting',
      date: '2026-04-22',
      area: 'glance-communications',
      importance: 'normal',
      topics: ['cover-whale-templates', 'rollout'],
      participants: ['Anthony Avina', 'Carla Rice'],
      extraction_version: '1',
      ...(overrides.frontmatter ?? {}),
    },
    sections: {
      'What happened':
        'Reviewed staging validation. Anthony confirmed adjusters are ready for next pilot.',
      'What was decided':
        '- Ship the [[cover-whale-templates]] pilot with 3 adjusters.',
      "What's next":
        '- John: schedule pilot kickoff with adjusters by Thursday',
      'Open questions': '- Should the carrier name appear in every signature?',
      FYI: '- Next-step legal review pending',
      'Things mentioned but not actioned':
        '- Hallway mention of [[leap-templates]] revival',
      ...(overrides.sections ?? {}),
    },
  };
}

function inboxFixture(overrides: Partial<InboxSummary> = {}): InboxSummary {
  return {
    frontmatter: {
      source_path: 'inbox/2026-04-22-claude-pricing-tweet.md',
      source_type: 'inbox',
      date: '2026-04-22',
      topics: ['pricing'],
      ...(overrides.frontmatter ?? {}),
    },
    sections: {
      Summary: 'Anthropic posted a pricing-tier tweet relevant to our [[claude-pilot]].',
      'Key points': '- Tier shift\n- New rate cap',
      "What's relevant": 'Touches the [[claude-pilot]] cost ceiling.',
      Followups: '- Re-check pilot budget Friday',
      ...(overrides.sections ?? {}),
    },
  };
}

describe('source-summary model', () => {
  describe('meeting summary', () => {
    it('round-trips frontmatter + sections losslessly', () => {
      const original = meetingFixture();
      const md = renderSourceSummary(original);
      const parsed = parseSourceSummary(md);
      assert.notEqual(parsed, null);
      assert.equal(parsed!.frontmatter.source_type, 'meeting');
      assert.deepEqual(parsed!.frontmatter, original.frontmatter);
      assert.deepEqual(parsed!.sections, original.sections);
    });

    it('renders sections in canonical order', () => {
      const md = renderSourceSummary(meetingFixture());
      const headerOrder: string[] = [];
      const headerRe = /^##\s+(.+)$/gm;
      let m: RegExpExecArray | null;
      while ((m = headerRe.exec(md)) !== null) {
        headerOrder.push(m[1].trim());
      }
      // Filter to known names so a future "# Title" doesn't pollute.
      const known = headerOrder.filter((n) =>
        (MEETING_SECTION_NAMES as readonly string[]).includes(n),
      );
      assert.deepEqual(known, [
        'What happened',
        'What was decided',
        "What's next",
        'Open questions',
        'FYI',
        'Things mentioned but not actioned',
      ]);
    });

    it('omits empty / undefined sections from output', () => {
      // Construct directly (not via fixture spread) to ensure other
      // sections are truly absent rather than inherited from defaults.
      const summary: MeetingSummary = {
        frontmatter: meetingFixture().frontmatter,
        sections: {
          'What happened': 'Hallway sync.',
        },
      };
      const md = renderSourceSummary(summary);
      assert.match(md, /## What happened/);
      assert.doesNotMatch(md, /## What was decided/);
      assert.doesNotMatch(md, /## FYI/);
    });

    it('idempotent renderer (render → parse → render produces equal output)', () => {
      const summary = meetingFixture();
      const first = renderSourceSummary(summary);
      const parsed = parseSourceSummary(first);
      assert.notEqual(parsed, null);
      const second = renderSourceSummary(parsed!);
      assert.equal(first, second);
    });

    it('preserves participants order', () => {
      const summary = meetingFixture({
        frontmatter: {
          ...meetingFixture().frontmatter,
          participants: ['Z Person', 'A Person', 'M Person'],
        },
      });
      const md = renderSourceSummary(summary);
      const parsed = parseSourceSummary(md);
      assert.deepEqual(parsed!.frontmatter.participants, ['Z Person', 'A Person', 'M Person']);
    });
  });

  describe('inbox / slack summary', () => {
    it('round-trips inbox summary', () => {
      const original = inboxFixture();
      const md = renderSourceSummary(original);
      const parsed = parseSourceSummary(md);
      assert.notEqual(parsed, null);
      assert.equal(parsed!.frontmatter.source_type, 'inbox');
      assert.deepEqual(parsed!.frontmatter, original.frontmatter);
      assert.deepEqual(parsed!.sections, original.sections);
    });

    it('round-trips slack summary using inbox shape', () => {
      const slack: InboxSummary = inboxFixture({
        frontmatter: {
          source_path: 'resources/notes/2026-04-22-slack-digest.md#thread/abc',
          source_type: 'slack',
          date: '2026-04-22',
          participants: ['John', 'Anthony'],
        },
        sections: {
          Summary: 'Thread about pricing',
          'Key points': '- Cap proposed',
          "What's relevant": 'Affects pilot budget',
          Followups: '- Confirm with finance',
        },
      });
      const md = renderSourceSummary(slack);
      const parsed = parseSourceSummary(md);
      assert.notEqual(parsed, null);
      assert.equal(parsed!.frontmatter.source_type, 'slack');
      assert.deepEqual(parsed!.sections, slack.sections);
    });

    it('renders inbox sections in canonical order', () => {
      const md = renderSourceSummary(inboxFixture());
      const headerOrder: string[] = [];
      const headerRe = /^##\s+(.+)$/gm;
      let m: RegExpExecArray | null;
      while ((m = headerRe.exec(md)) !== null) {
        headerOrder.push(m[1].trim());
      }
      const known = headerOrder.filter((n) =>
        (INBOX_SECTION_NAMES as readonly string[]).includes(n),
      );
      assert.deepEqual(known, ['Summary', 'Key points', "What's relevant", 'Followups']);
    });
  });

  describe('parser tolerance', () => {
    it('returns null for missing frontmatter', () => {
      assert.equal(parseSourceSummary('# no frontmatter\n\n## What happened\n\nfoo'), null);
    });

    it('returns null for invalid source_type', () => {
      const md = `---\nsource_path: foo\nsource_type: nonsense\ndate: 2026-04-22\n---\n\n# t\n`;
      assert.equal(parseSourceSummary(md), null);
    });

    it('drops unrecognized section headers', () => {
      const md = [
        '---',
        'source_path: resources/meetings/2026-04-22-foo.md',
        'source_type: meeting',
        'date: 2026-04-22',
        '---',
        '',
        '# t',
        '',
        '## What happened',
        '',
        'happened body',
        '',
        '## Random Header',
        '',
        'this should be discarded',
        '',
      ].join('\n');
      const parsed = parseSourceSummary(md);
      assert.notEqual(parsed, null);
      assert.equal(parsed!.sections['What happened' as never], 'happened body');
      assert.equal(
        Object.prototype.hasOwnProperty.call(parsed!.sections, 'Random Header'),
        false,
      );
    });

    // phase-8-followup-5 Item B amendment — guard the parser predicate
    // against the OLD `'standard' | 'heavy'` taxonomy. The chef
    // orchestrator gates on `importance: important`; the parser MUST
    // pass canonical values through, not drop them.
    it('passes canonical importance values through (skip/light/normal/important)', () => {
      for (const value of ['skip', 'light', 'normal', 'important'] as const) {
        const md = [
          '---',
          'source_path: resources/meetings/2026-04-22-foo.md',
          'source_type: meeting',
          'date: 2026-04-22',
          `importance: ${value}`,
          '---',
          '',
          '# t',
          '',
          '## What happened',
          '',
          'body',
          '',
        ].join('\n');
        const parsed = parseSourceSummary(md);
        assert.notEqual(parsed, null, `should parse importance: ${value}`);
        assert.equal(
          parsed!.frontmatter.importance,
          value,
          `importance: ${value} must round-trip; old taxonomy 'standard'/'heavy' silently dropped 'normal'/'important'`,
        );
      }
    });

    it('drops legacy importance values (standard/heavy) — not in canonical taxonomy', () => {
      // Defensive: if an old summary file happens to carry the legacy
      // value, the parser must not type-launder it into the canonical
      // type. Dropping to undefined is the safe move; the writer will
      // re-derive on next refresh.
      for (const value of ['standard', 'heavy'] as const) {
        const md = [
          '---',
          'source_path: resources/meetings/2026-04-22-foo.md',
          'source_type: meeting',
          'date: 2026-04-22',
          `importance: ${value}`,
          '---',
          '',
          '# t',
          '',
          '## What happened',
          '',
          'body',
          '',
        ].join('\n');
        const parsed = parseSourceSummary(md);
        assert.notEqual(parsed, null);
        assert.equal(parsed!.frontmatter.importance, undefined);
      }
    });

    it('ignores ## headers inside fenced code blocks', () => {
      const md = [
        '---',
        'source_path: resources/meetings/2026-04-22-foo.md',
        'source_type: meeting',
        'date: 2026-04-22',
        '---',
        '',
        '# t',
        '',
        '## What happened',
        '',
        '```',
        '## What was decided  <-- inside fence; should NOT open a section',
        '```',
        '',
        'still in What happened',
        '',
      ].join('\n');
      const parsed = parseSourceSummary(md);
      assert.notEqual(parsed, null);
      // The fenced "header" should be part of the What happened section.
      assert.match(parsed!.sections['What happened' as never] ?? '', /still in What happened/);
      assert.equal(
        Object.prototype.hasOwnProperty.call(parsed!.sections, 'What was decided'),
        false,
      );
    });
  });
});
