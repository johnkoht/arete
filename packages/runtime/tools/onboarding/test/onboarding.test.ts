/**
 * Tests for onboarding tool templates — verifies area setup step is present.
 *
 * These tests verify that the onboarding tool has area creation guidance
 * properly integrated into both TOOL.md and plan.md template.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolDir = join(__dirname, '..');

describe('Onboarding Tool - Area Setup', () => {
  describe('TOOL.md', () => {
    it('contains area setup step in Activation Workflow', () => {
      const toolPath = join(toolDir, 'TOOL.md');
      assert.ok(existsSync(toolPath), 'TOOL.md should exist');

      const content = readFileSync(toolPath, 'utf8');

      // Verify area setup step exists
      assert.ok(
        content.includes('Set up work areas'),
        'TOOL.md should have "Set up work areas" step',
      );

      // Verify it asks about work domains
      assert.ok(
        content.includes('What are your main work domains?'),
        'TOOL.md should ask about work domains',
      );

      // Verify example areas are provided
      assert.ok(
        content.includes('Customer: Acme Corp'),
        'TOOL.md should include Customer example area',
      );
      assert.ok(
        content.includes('Initiative: Platform Migration'),
        'TOOL.md should include Initiative example area',
      );

      // Verify arete create area command is documented
      assert.ok(
        content.includes('arete create area'),
        'TOOL.md should reference arete create area command',
      );
    });

    it('includes area setup as Day 1 activity', () => {
      const toolPath = join(toolDir, 'TOOL.md');
      const content = readFileSync(toolPath, 'utf8');

      // The area setup step should be marked as Day 1
      assert.ok(
        content.includes('(Day 1)'),
        'Area setup should be marked as Day 1 activity',
      );
    });

    it('documents search index update after area creation', () => {
      const toolPath = join(toolDir, 'TOOL.md');
      const content = readFileSync(toolPath, 'utf8');

      // Verify area creation updates search index
      assert.ok(
        content.includes('arete index') || content.includes('search index'),
        'TOOL.md should mention search index update',
      );
    });
  });

  describe('plan.md template', () => {
    it('includes area setup task in Week 1', () => {
      const templatePath = join(toolDir, 'templates', 'plan.md');
      assert.ok(existsSync(templatePath), 'templates/plan.md should exist');

      const content = readFileSync(templatePath, 'utf8');

      // Verify area setup is in Week 1 section
      const week1Start = content.indexOf('### Week 1');
      const week2Start = content.indexOf('### Week 2');
      assert.ok(week1Start !== -1, 'Should have Week 1 section');
      assert.ok(week2Start !== -1, 'Should have Week 2 section');

      const week1Content = content.substring(week1Start, week2Start);
      assert.ok(
        week1Content.includes('Set up work areas'),
        'Week 1 should include "Set up work areas" task',
      );
    });

    it('references arete create area command in Week 1', () => {
      const templatePath = join(toolDir, 'templates', 'plan.md');
      const content = readFileSync(templatePath, 'utf8');

      const week1Start = content.indexOf('### Week 1');
      const week2Start = content.indexOf('### Week 2');
      const week1Content = content.substring(week1Start, week2Start);

      assert.ok(
        week1Content.includes('arete create area'),
        'Week 1 should reference arete create area command',
      );
    });

    it('provides example areas in Week 1 task', () => {
      const templatePath = join(toolDir, 'templates', 'plan.md');
      const content = readFileSync(templatePath, 'utf8');

      const week1Start = content.indexOf('### Week 1');
      const week2Start = content.indexOf('### Week 2');
      const week1Content = content.substring(week1Start, week2Start);

      // Should have at least one example area
      assert.ok(
        week1Content.includes('Customer:') ||
          week1Content.includes('Initiative:') ||
          week1Content.includes('e.g.,'),
        'Week 1 task should provide example areas',
      );
    });
  });
});
