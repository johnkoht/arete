/**
 * Tests for template rendering utility.
 * Ported from scripts/integrations/test_utils.py TestRenderTemplate
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTemplate, renderTemplateString, resolveTemplatePath, resolveTemplateContent, TEMPLATE_REGISTRY } from '../../src/utils/templates.js';

describe('renderTemplate', () => {
  it('basic substitution', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'arete-tmpl-'));
    try {
      const templatePath = join(tmp, 'template.md');
      await writeFile(
        templatePath,
        '# {title}\n\nBy {author}',
        'utf-8'
      );
      const result = await renderTemplate(templatePath, {
        title: 'Hello',
        author: 'Alice',
      });
      assert.equal(result, '# Hello\n\nBy Alice');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('missing variable left as is', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'arete-tmpl-'));
    try {
      const templatePath = join(tmp, 'template.md');
      await writeFile(
        templatePath,
        '# {title}\n\n{missing}',
        'utf-8'
      );
      const result = await renderTemplate(templatePath, { title: 'Hello' });
      assert.equal(result, '# Hello\n\n{missing}');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('null value becomes empty', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'arete-tmpl-'));
    try {
      const templatePath = join(tmp, 'template.md');
      await writeFile(templatePath, 'Value: {key}', 'utf-8');
      const result = await renderTemplate(templatePath, { key: null });
      assert.equal(result, 'Value: ');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('nonexistent template raises', async () => {
    await assert.rejects(
      () => renderTemplate('/nonexistent/template.md', {}),
      /Template not found/
    );
  });

  it('empty variables', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'arete-tmpl-'));
    try {
      const templatePath = join(tmp, 'template.md');
      await writeFile(templatePath, 'No vars here', 'utf-8');
      const result = await renderTemplate(templatePath, {});
      assert.equal(result, 'No vars here');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('renderTemplateString', () => {
  it('basic substitution', () => {
    const result = renderTemplateString('# {title}\n\nBy {author}', {
      title: 'Hello',
      author: 'Alice',
    });
    assert.equal(result, '# Hello\n\nBy Alice');
  });
});

describe('resolveTemplatePath', () => {
  async function makeWorkspace(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'arete-resolve-'));
    await mkdir(join(root, 'templates', 'outputs', 'create-prd'), { recursive: true });
    await mkdir(join(root, '.agents', 'skills', 'create-prd', 'templates'), { recursive: true });
    await mkdir(join(root, 'templates', 'outputs'), { recursive: true });
    return root;
  }

  it('returns null when no template exists at any level', async () => {
    const root = await makeWorkspace();
    try {
      const result = await resolveTemplatePath(root, 'create-prd', 'prd-simple');
      assert.equal(result, null);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns legacy fallback when only that exists', async () => {
    const root = await makeWorkspace();
    try {
      const legacyPath = join(root, 'templates', 'outputs', 'prd-simple.md');
      await writeFile(legacyPath, '# legacy', 'utf-8');
      const result = await resolveTemplatePath(root, 'create-prd', 'prd-simple');
      assert.equal(result, legacyPath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns skill-local when only that exists', async () => {
    const root = await makeWorkspace();
    try {
      const skillLocalPath = join(root, '.agents', 'skills', 'create-prd', 'templates', 'prd-simple.md');
      await writeFile(skillLocalPath, '# skill-local', 'utf-8');
      const result = await resolveTemplatePath(root, 'create-prd', 'prd-simple');
      assert.equal(result, skillLocalPath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns workspace override when only that exists', async () => {
    const root = await makeWorkspace();
    try {
      const overridePath = join(root, 'templates', 'outputs', 'create-prd', 'prd-simple.md');
      await writeFile(overridePath, '# override', 'utf-8');
      const result = await resolveTemplatePath(root, 'create-prd', 'prd-simple');
      assert.equal(result, overridePath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('prefers workspace override over skill-local (both exist)', async () => {
    const root = await makeWorkspace();
    try {
      const overridePath = join(root, 'templates', 'outputs', 'create-prd', 'prd-simple.md');
      const skillLocalPath = join(root, '.agents', 'skills', 'create-prd', 'templates', 'prd-simple.md');
      await writeFile(overridePath, '# override', 'utf-8');
      await writeFile(skillLocalPath, '# skill-local', 'utf-8');
      const result = await resolveTemplatePath(root, 'create-prd', 'prd-simple');
      assert.equal(result, overridePath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('prefers skill-local over legacy fallback (both exist)', async () => {
    const root = await makeWorkspace();
    try {
      const skillLocalPath = join(root, '.agents', 'skills', 'create-prd', 'templates', 'prd-simple.md');
      const legacyPath = join(root, 'templates', 'outputs', 'prd-simple.md');
      await writeFile(skillLocalPath, '# skill-local', 'utf-8');
      await writeFile(legacyPath, '# legacy', 'utf-8');
      const result = await resolveTemplatePath(root, 'create-prd', 'prd-simple');
      assert.equal(result, skillLocalPath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('prefers workspace override over all others when all three exist', async () => {
    const root = await makeWorkspace();
    try {
      const overridePath = join(root, 'templates', 'outputs', 'create-prd', 'prd-simple.md');
      const skillLocalPath = join(root, '.agents', 'skills', 'create-prd', 'templates', 'prd-simple.md');
      const legacyPath = join(root, 'templates', 'outputs', 'prd-simple.md');
      await writeFile(overridePath, '# override', 'utf-8');
      await writeFile(skillLocalPath, '# skill-local', 'utf-8');
      await writeFile(legacyPath, '# legacy', 'utf-8');
      const result = await resolveTemplatePath(root, 'create-prd', 'prd-simple');
      assert.equal(result, overridePath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('TEMPLATE_REGISTRY', () => {
  it('contains all expected skills', () => {
    const skills = Object.keys(TEMPLATE_REGISTRY);
    assert.ok(skills.includes('create-prd'), 'registry has create-prd');
    assert.ok(skills.includes('prepare-meeting-agenda'), 'registry has prepare-meeting-agenda');
    assert.ok(skills.includes('discovery'), 'registry has discovery');
    assert.ok(skills.includes('competitive-analysis'), 'registry has competitive-analysis');
    assert.ok(skills.includes('construct-roadmap'), 'registry has construct-roadmap');
    assert.ok(skills.includes('week-plan'), 'registry has week-plan');
    assert.ok(skills.includes('quarter-plan'), 'registry has quarter-plan');
  });

  it('every entry has at least one variant', () => {
    for (const [skill, variants] of Object.entries(TEMPLATE_REGISTRY)) {
      assert.ok(Array.isArray(variants) && variants.length > 0, `${skill} must have at least one variant`);
    }
  });

  it('create-prd has expected variants', () => {
    assert.deepEqual(TEMPLATE_REGISTRY['create-prd'], ['prd-simple', 'prd-regular', 'prd-full', 'project']);
  });

  it('prepare-meeting-agenda has all five meeting types', () => {
    const variants = TEMPLATE_REGISTRY['prepare-meeting-agenda'];
    for (const type of ['one-on-one', 'leadership', 'customer', 'dev-team', 'other']) {
      assert.ok(variants.includes(type), `prepare-meeting-agenda missing variant: ${type}`);
    }
  });
});

describe('resolveTemplateContent', () => {
  it('returns null when no template exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arete-content-'));
    try {
      const result = await resolveTemplateContent(root, 'create-prd', 'prd-simple');
      assert.equal(result, null);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns path and content for skill-local template', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arete-content-'));
    try {
      const skillDir = join(root, '.agents', 'skills', 'create-prd', 'templates');
      await mkdir(skillDir, { recursive: true });
      const skillPath = join(skillDir, 'prd-simple.md');
      await writeFile(skillPath, '# Simple PRD\n## Problem\n', 'utf-8');

      const result = await resolveTemplateContent(root, 'create-prd', 'prd-simple');
      assert.ok(result !== null);
      assert.equal(result.path, skillPath);
      assert.equal(result.content, '# Simple PRD\n## Problem\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns workspace override content when both override and skill-local exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arete-content-'));
    try {
      const overrideDir = join(root, 'templates', 'outputs', 'create-prd');
      const skillDir = join(root, '.agents', 'skills', 'create-prd', 'templates');
      await mkdir(overrideDir, { recursive: true });
      await mkdir(skillDir, { recursive: true });

      const overridePath = join(overrideDir, 'prd-simple.md');
      await writeFile(overridePath, '# My Custom PRD\n## Problem\n', 'utf-8');
      await writeFile(join(skillDir, 'prd-simple.md'), '# Default PRD\n## Overview\n', 'utf-8');

      const result = await resolveTemplateContent(root, 'create-prd', 'prd-simple');
      assert.ok(result !== null);
      assert.equal(result.path, overridePath);
      assert.equal(result.content, '# My Custom PRD\n## Problem\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
