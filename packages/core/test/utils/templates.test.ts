/**
 * Tests for template rendering utility.
 * Ported from scripts/integrations/test_utils.py TestRenderTemplate
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTemplate, renderTemplateString } from '../../src/utils/templates.js';

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
