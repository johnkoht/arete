/**
 * Phase 2 chef-orchestrator skill prose smoke tests.
 *
 * Lightweight assertion-only tests that validate the SHIPPED structure
 * of each rewritten SKILL.md against the chef-orchestrator pattern
 * envelope. These do NOT exercise an agent harness — they verify the
 * static prose includes the load-bearing sections an agent harness
 * would consult.
 *
 * Each rewritten skill must:
 * - Have a "Read first" stanza referencing .arete/skills-local/<slug>.md
 * - Reference the four chef-orchestrator patterns from PATTERNS.md
 * - Include a Rollback section citing ARETE_LEGACY_SKILL_PROSE
 * - Have a corresponding SKILL.legacy.md file (MC2 ship gate)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname ?? '', '..', '..', '..', '..');
const SKILLS_DIR = join(REPO_ROOT, 'packages', 'runtime', 'skills');

const CHEF_ORCHESTRATOR_SKILLS = [
  'daily-winddown',
  'weekly-winddown',
  'week-plan',
  'process-meetings',
  'meeting-prep',
] as const;

describe('Phase 2 chef-orchestrator skill prose', () => {
  for (const slug of CHEF_ORCHESTRATOR_SKILLS) {
    describe(slug, () => {
      const skillDir = join(SKILLS_DIR, slug);
      const skillPath = join(skillDir, 'SKILL.md');
      const legacyPath = join(skillDir, 'SKILL.legacy.md');

      it('SKILL.md exists', () => {
        assert.ok(existsSync(skillPath), `${skillPath} missing`);
      });

      it('SKILL.legacy.md exists (MC2 ship gate)', () => {
        assert.ok(
          existsSync(legacyPath),
          `${legacyPath} missing — Phase 2 plan §(e) ship gate violated`,
        );
      });

      it('SKILL.md "Read first" stanza references the APPEND file', () => {
        const content = readFileSync(skillPath, 'utf8');
        // Look for case-insensitive "Read first" + the per-skill APPEND path
        assert.match(
          content,
          /\*\*Read first\*\*/i,
          'Missing "Read first" stanza',
        );
        assert.ok(
          content.includes(`.arete/skills-local/${slug}.md`),
          `Missing reference to .arete/skills-local/${slug}.md`,
        );
      });

      it('SKILL.md references PATTERNS.md', () => {
        const content = readFileSync(skillPath, 'utf8');
        assert.match(content, /PATTERNS\.md/);
      });

      it('SKILL.md references all four chef-orchestrator patterns', () => {
        const content = readFileSync(skillPath, 'utf8');
        // Each pattern name appears at least once. Patterns are
        // canonical names from PATTERNS.md.
        const patterns = [
          'do-all-work-then-engage',
          'curate-with-reason-labels',
          'propose-with-mcp-action',
          'surface-deferred-as-sidecar',
        ];
        for (const pattern of patterns) {
          assert.ok(
            content.includes(pattern),
            `${slug} SKILL.md missing reference to pattern: ${pattern}`,
          );
        }
      });

      it('SKILL.md has Rollback section citing ARETE_LEGACY_SKILL_PROSE', () => {
        const content = readFileSync(skillPath, 'utf8');
        assert.match(content, /## Rollback/);
        assert.ok(
          content.includes('ARETE_LEGACY_SKILL_PROSE'),
          'Missing ARETE_LEGACY_SKILL_PROSE reference in Rollback',
        );
      });

      it('SKILL.md frontmatter has name + description + triggers (when applicable)', () => {
        const content = readFileSync(skillPath, 'utf8');
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        assert.ok(fmMatch, 'No YAML frontmatter found');
        const fm = fmMatch![1];
        assert.match(fm, new RegExp(`^name:\\s*${slug}`, 'm'), 'frontmatter.name missing or wrong');
        assert.match(fm, /^description:\s*\S/m, 'frontmatter.description missing');
      });
    });
  }

  describe('week-plan two-engage variant', () => {
    it('explicitly documents the two-engage pattern', () => {
      const content = readFileSync(
        join(SKILLS_DIR, 'week-plan', 'SKILL.md'),
        'utf8',
      );
      // Per phase plan §(c.3) — week-plan must explicitly document
      // the two-engage variant of do-all-work-then-engage.
      assert.match(content, /two-engage/i, 'Missing two-engage documentation');
      assert.ok(
        content.includes('Engage 1') && content.includes('Engage 2'),
        'Missing Engage 1 / Engage 2 sequence labels',
      );
    });
  });

  describe('PATTERNS.md', () => {
    it('contains all four chef-orchestrator pattern definitions', () => {
      const patternsPath = join(SKILLS_DIR, 'PATTERNS.md');
      assert.ok(existsSync(patternsPath));
      const content = readFileSync(patternsPath, 'utf8');

      // Each pattern has its own ## section
      const headers = [
        '## do-all-work-then-engage',
        '## curate-with-reason-labels',
        '## propose-with-mcp-action',
        '## surface-deferred-as-sidecar',
      ];
      for (const h of headers) {
        assert.ok(
          content.includes(h),
          `PATTERNS.md missing section header: ${h}`,
        );
      }
    });

    it('documents the action verb taxonomy with both modes', () => {
      const patternsPath = join(SKILLS_DIR, 'PATTERNS.md');
      const content = readFileSync(patternsPath, 'utf8');
      assert.match(content, /executable/);
      assert.match(content, /draft-only/);
      // Jira ships as draft-only since no MCP today
      assert.ok(
        content.includes('jira.create_ticket') &&
          content.includes('draft-only'),
        'PATTERNS.md should document Jira as draft-only',
      );
    });

    it('documents the two-engage variant in Pattern 1', () => {
      const patternsPath = join(SKILLS_DIR, 'PATTERNS.md');
      const content = readFileSync(patternsPath, 'utf8');
      assert.match(content, /two-engage/i);
    });
  });
});
