/**
 * Tests for CLAUDE.md generator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateClaudeMd } from '../../src/generators/claude-md.js';
import type { AreteConfig } from '../../src/models/workspace.js';
import type { SkillDefinition } from '../../src/models/skills.js';

function makeConfig(overrides?: Partial<AreteConfig>): AreteConfig {
  return {
    schema: 1,
    version: '0.5.0',
    source: 'test',
    skills: { core: [], overrides: [] },
    tools: [],
    integrations: {},
    settings: {
      memory: {
        decisions: { prompt_before_save: true },
        learnings: { prompt_before_save: true },
      },
      conversations: { peopleProcessing: 'ask' },
    },
    ...overrides,
  };
}

function makeSkill(overrides?: Partial<SkillDefinition>): SkillDefinition {
  return {
    id: 'week-plan',
    name: 'Week Plan',
    description: 'Plan the week and set weekly priorities.',
    path: '/workspace/.agents/skills/week-plan',
    triggers: ['plan my week'],
    category: 'core',
    ...overrides,
  };
}

describe('generateClaudeMd', () => {
  it('contains Arete identity section', () => {
    const output = generateClaudeMd(makeConfig(), []);
    assert.ok(output.includes('Arete PM Workspace'));
    assert.ok(output.includes('excellence'));
  });

  it('contains workspace structure tree', () => {
    const output = generateClaudeMd(makeConfig(), []);
    assert.ok(output.includes('now/'));
    assert.ok(output.includes('goals/'));
    assert.ok(output.includes('context/'));
    assert.ok(output.includes('.arete/'));
    assert.ok(output.includes('.agents/'));
  });

  it('contains slash commands table when skills provided', () => {
    const skills = [
      makeSkill(),
      makeSkill({ id: 'daily-winddown', name: 'Daily Winddown', description: 'End of day reflection.' }),
    ];
    const output = generateClaudeMd(makeConfig(), skills);
    assert.ok(output.includes('| /week-plan |'));
    assert.ok(output.includes('| /daily-winddown |'));
    assert.ok(output.includes('| Command | Description |'));
  });

  it('contains intelligence services section', () => {
    const output = generateClaudeMd(makeConfig(), []);
    assert.ok(output.includes('arete search'));
    assert.ok(output.includes('arete brief'));
    assert.ok(output.includes('arete resolve'));
    assert.ok(output.includes('arete commitments list'));
  });

  it('contains memory section', () => {
    const output = generateClaudeMd(makeConfig(), []);
    assert.ok(output.includes('decisions.md'));
    assert.ok(output.includes('learnings.md'));
  });

  it('contains version footer with config version', () => {
    const output = generateClaudeMd(makeConfig({ version: '0.5.0' }), []);
    assert.ok(output.includes('Arete v0.5.0'));
  });

  it('does NOT contain STOP or routing-mandatory language', () => {
    const skills = [makeSkill()];
    const output = generateClaudeMd(makeConfig(), skills);
    assert.ok(!output.includes('STOP'));
    assert.ok(!output.includes('routing-mandatory'));
    assert.ok(!output.includes('MANDATORY'));
  });

  it('is under 300 lines with a reasonable skill list', () => {
    const skills = Array.from({ length: 15 }, (_, i) =>
      makeSkill({ id: `skill-${i}`, name: `Skill ${i}`, description: `Description for skill ${i}.` })
    );
    const output = generateClaudeMd(makeConfig(), skills);
    const lineCount = output.split('\n').length;
    assert.ok(lineCount < 300, `Output was ${lineCount} lines, expected < 300`);
  });

  it('handles null version gracefully', () => {
    const output = generateClaudeMd(makeConfig({ version: null }), []);
    assert.ok(output.includes('Arete vunknown'));
  });

  it('references agent profiles path when skill has profile field', () => {
    const skillWithProfile = makeSkill({ profile: 'executive-coach' });
    const output = generateClaudeMd(makeConfig(), [skillWithProfile]);
    assert.ok(
      output.includes('.agents/profiles/'),
      'Should reference .agents/profiles/ directory'
    );
  });

  // ---------------------------------------------------------------------
  // Step 9 — Active Topics section + idempotency contract
  // ---------------------------------------------------------------------

  describe('Active Topics section (memory arg)', () => {
    it('omits section entirely when memory is undefined (fresh workspace)', () => {
      const output = generateClaudeMd(makeConfig(), []);
      assert.ok(!output.includes('## Active Topics'));
      assert.ok(!output.includes('Reflects memory as of'));
    });

    it('omits section entirely when activeTopics is empty', () => {
      const output = generateClaudeMd(makeConfig(), [], { activeTopics: [] });
      assert.ok(!output.includes('## Active Topics'));
    });

    it('renders section with wikilinks when activeTopics non-empty', () => {
      const output = generateClaudeMd(makeConfig(), [], {
        activeTopics: [
          {
            slug: 'cover-whale-templates',
            area: 'glance-comms',
            status: 'active',
            summary: 'Staging-validated.',
            lastRefreshed: '2026-04-22',
          },
        ],
      });
      assert.match(output, /^## Active Topics$/m);
      assert.match(output, /Reflects memory as of 2026-04-22/);
      assert.match(output, /- \[\[cover-whale-templates\]\] \(glance-comms\) — active — Staging-validated\./);
    });

    it('header date is max(entries[].lastRefreshed), not wall-clock', () => {
      const output = generateClaudeMd(makeConfig(), [], {
        activeTopics: [
          { slug: 'a', status: 'active', summary: '', lastRefreshed: '2026-04-10' },
          { slug: 'b', status: 'active', summary: '', lastRefreshed: '2026-04-22' },
          { slug: 'c', status: 'active', summary: '', lastRefreshed: '2026-04-15' },
        ],
      });
      assert.match(output, /Reflects memory as of 2026-04-22/);
    });
  });

  describe('idempotency contract', () => {
    it('produces byte-equal output for equal (config, skills, memory)', () => {
      const cfg = makeConfig();
      const memory = {
        activeTopics: [
          { slug: 'x', status: 'active', summary: 'ok', lastRefreshed: '2026-04-22' },
        ],
      };
      const a = generateClaudeMd(cfg, [], memory);
      const b = generateClaudeMd(cfg, [], memory);
      assert.strictEqual(a, b);
    });

    it('stays byte-equal across wall-clock days (footer has no Date.now)', () => {
      const original = Date;
      const cfg = makeConfig();
      const memory = {
        activeTopics: [
          { slug: 'x', status: 'active', summary: 'ok', lastRefreshed: '2026-04-22' },
        ],
      };

      // Day 1
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).Date = class extends original {
        constructor() { super('2026-04-23T00:00:00Z'); }
        static now() { return new original('2026-04-23T00:00:00Z').getTime(); }
      };
      const a = generateClaudeMd(cfg, [], memory);

      // Day 2
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).Date = class extends original {
        constructor() { super('2026-05-15T12:00:00Z'); }
        static now() { return new original('2026-05-15T12:00:00Z').getTime(); }
      };
      const b = generateClaudeMd(cfg, [], memory);

      // Restore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).Date = original;

      assert.strictEqual(a, b, 'output must be byte-equal across wall-clock days');
    });

    it('footer contains no ISO timestamp', () => {
      const output = generateClaudeMd(makeConfig(), []);
      // The only date pattern allowed is topic last_refreshed dates
      // (none expected when memory is undefined).
      const isoTimestampRe = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
      assert.ok(!isoTimestampRe.test(output), 'footer must not embed wall-clock ISO timestamp');
    });
  });
});
