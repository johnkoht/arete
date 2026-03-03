/**
 * Tests for integration section generation utilities.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateIntegrationSection,
  injectIntegrationSection,
  deriveIntegrationFromLegacy,
} from '../../src/utils/integration.js';
import type { SkillIntegration, SkillDefinition } from '../../src/models/index.js';

// ---------------------------------------------------------------------------
// generateIntegrationSection
// ---------------------------------------------------------------------------

describe('generateIntegrationSection', () => {
  it('returns null for undefined outputs (no contextUpdates)', () => {
    const integration: SkillIntegration = {};
    assert.equal(generateIntegrationSection('my-skill', integration), null);
  });

  it('returns null for empty outputs array (no contextUpdates)', () => {
    const integration: SkillIntegration = { outputs: [] };
    assert.equal(generateIntegrationSection('my-skill', integration), null);
  });

  it('returns null when all outputs are type:none', () => {
    const integration: SkillIntegration = {
      outputs: [{ type: 'none' }, { type: 'none' }],
    };
    assert.equal(generateIntegrationSection('my-skill', integration), null);
  });

  it('returns null when outputs is undefined and contextUpdates is empty', () => {
    const integration: SkillIntegration = { contextUpdates: [] };
    assert.equal(generateIntegrationSection('my-skill', integration), null);
  });

  // --- project type ---

  it('generates correct markdown for project output type with template', () => {
    const integration: SkillIntegration = {
      outputs: [
        {
          type: 'project',
          path: 'projects/active/{name}/',
          template: 'analysis',
          index: true,
        },
      ],
    };
    const result = generateIntegrationSection('competitive-analysis', integration);
    assert.ok(result !== null, 'should return a string');
    assert.ok(result.includes('## Areté Integration'));
    assert.ok(result.includes("After completing this skill's workflow:"));
    assert.ok(result.includes('`projects/active/{name}/` using project template'));
    assert.ok(result.includes('arete template resolve --skill competitive-analysis --variant analysis'));
    assert.ok(result.includes('arete index'));
  });

  it('generates project output without template line when template is not set', () => {
    const integration: SkillIntegration = {
      outputs: [{ type: 'project', path: 'projects/active/{name}/', index: true }],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    assert.ok(result.includes('using project template'));
    assert.ok(!result.includes('arete template resolve'));
  });

  it('uses default project path when path is not set', () => {
    const integration: SkillIntegration = {
      outputs: [{ type: 'project' }],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    assert.ok(result.includes('`projects/active/{name}/`'));
  });

  // --- resource type ---

  it('generates correct markdown for resource output type', () => {
    const integration: SkillIntegration = {
      outputs: [
        { type: 'resource', path: 'resources/research/', template: 'report', index: true },
      ],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    assert.ok(result.includes('`resources/research/`'));
    assert.ok(!result.includes('using project template'));
    assert.ok(result.includes('arete template resolve --skill my-skill --variant report'));
    assert.ok(result.includes('arete index'));
  });

  it('uses default resource path when path is not set', () => {
    const integration: SkillIntegration = {
      outputs: [{ type: 'resource' }],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    assert.ok(result.includes('`resources/`'));
  });

  // --- context type ---

  it('generates correct markdown for context output type', () => {
    const integration: SkillIntegration = {
      outputs: [{ type: 'context', path: 'context/competitive-landscape.md' }],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    assert.ok(result.includes('`context/competitive-landscape.md`'));
    assert.ok(!result.includes('using project template'));
    assert.ok(!result.includes('arete index'));
  });

  it('uses default context path when path is not set', () => {
    const integration: SkillIntegration = {
      outputs: [{ type: 'context' }],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    assert.ok(result.includes('`context/`'));
  });

  // --- indexing ---

  it('does not include indexing line when index is false or undefined', () => {
    const integration: SkillIntegration = {
      outputs: [{ type: 'resource', path: 'resources/notes/', index: false }],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    assert.ok(!result.includes('arete index'));
  });

  it('includes indexing line when any output has index:true', () => {
    const integration: SkillIntegration = {
      outputs: [
        { type: 'context', path: 'context/foo.md', index: false },
        { type: 'resource', path: 'resources/bar/', index: true },
      ],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    assert.ok(result.includes('arete index'));
  });

  it('includes indexing only once even when multiple outputs have index:true', () => {
    const integration: SkillIntegration = {
      outputs: [
        { type: 'project', path: 'projects/active/{name}/', index: true },
        { type: 'resource', path: 'resources/summary/', index: true },
      ],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    const count = (result.match(/arete index/g) ?? []).length;
    assert.equal(count, 1);
  });

  // --- contextUpdates ---

  it('includes context updates section when contextUpdates provided', () => {
    const integration: SkillIntegration = {
      outputs: [{ type: 'project', path: 'projects/active/{name}/' }],
      contextUpdates: [
        'Update `context/competitive-landscape.md` with key findings',
        'Update `context/market-overview.md` with positioning',
      ],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    assert.ok(result.includes('**Context updates**:'));
    assert.ok(result.includes('- Update `context/competitive-landscape.md` with key findings'));
    assert.ok(result.includes('- Update `context/market-overview.md` with positioning'));
  });

  it('generates section from contextUpdates alone (no meaningful outputs)', () => {
    const integration: SkillIntegration = {
      contextUpdates: ['Update `context/foo.md` with latest data'],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    assert.ok(result.includes('**Context updates**:'));
    assert.ok(result.includes('Update `context/foo.md` with latest data'));
  });

  // --- workspace-relative paths ---

  it('uses workspace-relative paths (not skill-relative)', () => {
    const integration: SkillIntegration = {
      outputs: [{ type: 'project', path: 'projects/active/{name}/' }],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    // Must not use absolute or packages/ paths
    assert.ok(!result.includes('packages/'));
    assert.ok(!result.includes('.agents/skills/'));
    // Must use workspace-relative paths
    assert.ok(result.includes('projects/active/{name}/'));
  });

  // --- template CLI command format ---

  it('uses arete template resolve CLI command for templates', () => {
    const integration: SkillIntegration = {
      outputs: [{ type: 'resource', path: 'resources/report/', template: 'weekly-report' }],
    };
    const result = generateIntegrationSection('reporting-skill', integration);
    assert.ok(result !== null);
    assert.ok(result.includes('arete template resolve --skill reporting-skill --variant weekly-report'));
  });

  // --- type:none mixed with real outputs ---

  it('skips type:none outputs and processes remaining', () => {
    const integration: SkillIntegration = {
      outputs: [
        { type: 'none' },
        { type: 'resource', path: 'resources/output/', index: true },
      ],
    };
    const result = generateIntegrationSection('my-skill', integration);
    assert.ok(result !== null);
    assert.ok(result.includes('`resources/output/`'));
    assert.ok(result.includes('arete index'));
  });
});

// ---------------------------------------------------------------------------
// injectIntegrationSection
// ---------------------------------------------------------------------------

describe('injectIntegrationSection', () => {
  const MARKER_START = '<!-- ARETE_INTEGRATION_START -->';
  const MARKER_END = '<!-- ARETE_INTEGRATION_END -->';

  const sampleSection = '## Areté Integration\n\nAfter completing this skill\'s workflow:\n\n**Output**: Save to `projects/active/{name}/` using project template.';

  it('appends section with markers when no markers exist', () => {
    const content = '# My Skill\n\nThis is the skill description.';
    const result = injectIntegrationSection(content, sampleSection);
    assert.ok(result.includes(MARKER_START));
    assert.ok(result.includes(MARKER_END));
    assert.ok(result.includes(sampleSection));
    assert.ok(result.startsWith('# My Skill'));
    // markers come at the end
    const startIdx = result.indexOf(MARKER_START);
    assert.ok(startIdx > content.length - 1);
  });

  it('separates appended section with blank line', () => {
    const content = '# My Skill\n\nDescription.';
    const result = injectIntegrationSection(content, sampleSection);
    assert.ok(result.includes('Description.\n\n' + MARKER_START));
  });

  it('replaces existing section when markers are present', () => {
    const original = `# My Skill\n\nDescription.\n\n${MARKER_START}\n## Areté Integration\n\nOLD CONTENT\n${MARKER_END}`;
    const newSection = '## Areté Integration\n\nNEW CONTENT';
    const result = injectIntegrationSection(original, newSection);
    assert.ok(result.includes('NEW CONTENT'));
    assert.ok(!result.includes('OLD CONTENT'));
    assert.ok(result.includes(MARKER_START));
    assert.ok(result.includes(MARKER_END));
  });

  it('is idempotent: inject twice produces same result', () => {
    const content = '# My Skill\n\nDescription.';
    const first = injectIntegrationSection(content, sampleSection);
    const second = injectIntegrationSection(first, sampleSection);
    assert.equal(second, first);
  });

  it('is idempotent when replacing with same section', () => {
    const content = '# My Skill\n\nDescription.';
    const once = injectIntegrationSection(content, sampleSection);
    const twice = injectIntegrationSection(once, sampleSection);
    const thrice = injectIntegrationSection(twice, sampleSection);
    assert.equal(twice, once);
    assert.equal(thrice, once);
  });

  it('removes existing section when section is null and markers found', () => {
    const withSection = `# My Skill\n\nDescription.\n\n${MARKER_START}\n${sampleSection}\n${MARKER_END}`;
    const result = injectIntegrationSection(withSection, null);
    assert.ok(!result.includes(MARKER_START));
    assert.ok(!result.includes(MARKER_END));
    assert.ok(!result.includes('## Areté Integration'));
    assert.ok(result.includes('# My Skill'));
    assert.ok(result.includes('Description.'));
  });

  it('returns content unchanged when section is null and no markers', () => {
    const content = '# My Skill\n\nDescription.';
    const result = injectIntegrationSection(content, null);
    assert.equal(result, content);
  });

  it('does not duplicate markers on repeated injection', () => {
    const content = '# Skill\n\nContent.';
    const injected = injectIntegrationSection(content, sampleSection);
    const injectedAgain = injectIntegrationSection(injected, sampleSection);
    const startCount = (injectedAgain.match(/ARETE_INTEGRATION_START/g) ?? []).length;
    const endCount = (injectedAgain.match(/ARETE_INTEGRATION_END/g) ?? []).length;
    assert.equal(startCount, 1);
    assert.equal(endCount, 1);
  });

  it('preserves content after markers when replacing', () => {
    const afterSection = '\n\n## Additional Notes\n\nSome extra content.';
    const withSection = `# My Skill\n\nDescription.\n\n${MARKER_START}\n${sampleSection}\n${MARKER_END}${afterSection}`;
    const newSection = '## Areté Integration\n\nNEW';
    const result = injectIntegrationSection(withSection, newSection);
    assert.ok(result.includes('## Additional Notes'));
    assert.ok(result.includes('NEW'));
    assert.ok(!result.includes('OLD'));
  });

  it('removes markers and restores clean content (null section, content before)', () => {
    const content = '# My Skill\n\nDescription.';
    const withSection = injectIntegrationSection(content, sampleSection);
    const restored = injectIntegrationSection(withSection, null);
    assert.equal(restored, content);
  });
});

// ---------------------------------------------------------------------------
// deriveIntegrationFromLegacy
// ---------------------------------------------------------------------------

describe('deriveIntegrationFromLegacy', () => {
  function makeSkill(overrides: Partial<SkillDefinition>): SkillDefinition {
    return {
      id: 'test-skill',
      name: 'Test Skill',
      description: 'A test skill',
      path: '.agents/skills/test-skill/SKILL.md',
      triggers: ['test'],
      category: 'other',
      ...overrides,
    };
  }

  it('returns undefined when createsProject is not set', () => {
    const def = makeSkill({});
    assert.equal(deriveIntegrationFromLegacy(def), undefined);
  });

  it('returns undefined when createsProject is false', () => {
    const def = makeSkill({ createsProject: false });
    assert.equal(deriveIntegrationFromLegacy(def), undefined);
  });

  it('returns integration when createsProject is true (no template)', () => {
    const def = makeSkill({ createsProject: true });
    const result = deriveIntegrationFromLegacy(def);
    assert.ok(result !== undefined);
    assert.ok(Array.isArray(result.outputs));
    assert.equal(result.outputs!.length, 1);
    const output = result.outputs![0];
    assert.equal(output.type, 'project');
    assert.equal(output.path, 'projects/active/{name}/');
    assert.equal(output.index, true);
    assert.equal(output.template, undefined);
  });

  it('maps createsProject:true + projectTemplate → correct SkillIntegration', () => {
    const def = makeSkill({ createsProject: true, projectTemplate: 'analysis' });
    const result = deriveIntegrationFromLegacy(def);
    assert.ok(result !== undefined);
    const output = result.outputs![0];
    assert.equal(output.type, 'project');
    assert.equal(output.path, 'projects/active/{name}/');
    assert.equal(output.template, 'analysis');
    assert.equal(output.index, true);
  });

  it('returns workspace-relative path in output', () => {
    const def = makeSkill({ createsProject: true, projectTemplate: 'project' });
    const result = deriveIntegrationFromLegacy(def);
    assert.ok(result !== undefined);
    const output = result.outputs![0];
    assert.ok(output.path?.startsWith('projects/'));
    assert.ok(!output.path?.startsWith('/'));
    assert.ok(!output.path?.startsWith('packages/'));
  });

  it('does not modify other def fields', () => {
    const def = makeSkill({
      createsProject: true,
      projectTemplate: 'analysis',
      intelligence: ['context', 'memory'],
    });
    const result = deriveIntegrationFromLegacy(def);
    assert.ok(result !== undefined);
    // Only outputs is set; no extra fields from the def leak in
    assert.equal(result.contextUpdates, undefined);
  });
});
