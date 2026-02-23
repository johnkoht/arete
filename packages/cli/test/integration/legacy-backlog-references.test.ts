import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(join(__dirname, '..', '..', '..', '..'));

type SearchTarget = {
  dir: string;
  extensions: string[];
};

const SEARCH_TARGETS: SearchTarget[] = [
  { dir: '.cursor/rules', extensions: ['.md', '.mdc'] },
  { dir: '.agents/sources', extensions: ['.md'] },
  { dir: '.agents/skills', extensions: ['.md'] },
];

const LEGACY_PATTERNS = [/dev\/work\/backlog\//g, /dev\/backlog\//g, /\/plan backlog\b/g];

function listFiles(root: string, extensions: string[]): string[] {
  if (!statExists(root)) return [];

  const files: string[] = [];
  const entries = readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, extensions));
      continue;
    }

    if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(fullPath);
    }
  }

  return files;
}

function statExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

describe('legacy backlog references', () => {
  it('does not contain stale backlog paths in active rules/skills/sources', () => {
    const violations: string[] = [];

    for (const target of SEARCH_TARGETS) {
      const absoluteDir = join(REPO_ROOT, target.dir);
      const files = listFiles(absoluteDir, target.extensions);

      for (const file of files) {
        const content = readFileSync(file, 'utf8');
        for (const pattern of LEGACY_PATTERNS) {
          if (pattern.test(content)) {
            const relativePath = file.replace(`${REPO_ROOT}/`, '');
            violations.push(`${relativePath} matches ${pattern}`);
            pattern.lastIndex = 0;
          }
          pattern.lastIndex = 0;
        }
      }
    }

    // Regression guard: keep docs/rules aligned with plans-only lifecycle.
    assert.deepEqual(violations, []);
  });
});
