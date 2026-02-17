/**
 * Tests for template rendering utility.
 * Ported from scripts/integrations/test_utils.py TestRenderTemplate
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTemplate, renderTemplateString, resolveTemplatePath } from '../../src/utils/templates.js';

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
