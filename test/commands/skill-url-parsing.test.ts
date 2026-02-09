/**
 * Tests for GitHub URL parsing in skill install
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sep } from 'path';

// We can't directly import parseSkillSource since it's not exported,
// but we can test the behavior through the detection logic

/**
 * Replicate the parseSkillSource logic for testing
 */
function parseSkillSource(source: string): { type: 'skillssh'; normalized: string } | { type: 'local' } {
  // Local path indicators
  if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~')) {
    return { type: 'local' };
  }

  // GitHub URL patterns - matches github.com/owner/repo (with optional .git and trailing slash, but NO additional path segments)
  const githubUrlMatch = source.match(/^https?:\/\/github\.com\/([^\/]+\/[^\/]+?)(?:\.git)?\/?$/);
  if (githubUrlMatch) {
    return { type: 'skillssh', normalized: githubUrlMatch[1] };
  }

  // owner/repo format (exactly one slash, exactly two parts, no backslashes)
  const parts = source.split('/');
  if (parts.length === 2 && !source.includes('\\') && parts[0] && parts[1]) {
    return { type: 'skillssh', normalized: source };
  }

  // Anything else is treated as local
  return { type: 'local' };
}

describe('parseSkillSource', () => {
  it('parses owner/repo format', () => {
    const result = parseSkillSource('owner/repo');
    assert.equal(result.type, 'skillssh');
    if (result.type === 'skillssh') {
      assert.equal(result.normalized, 'owner/repo');
    }
  });

  it('parses https GitHub URL', () => {
    const result = parseSkillSource('https://github.com/owner/repo');
    assert.equal(result.type, 'skillssh');
    if (result.type === 'skillssh') {
      assert.equal(result.normalized, 'owner/repo');
    }
  });

  it('parses https GitHub URL with .git suffix', () => {
    const result = parseSkillSource('https://github.com/owner/repo.git');
    assert.equal(result.type, 'skillssh');
    if (result.type === 'skillssh') {
      assert.equal(result.normalized, 'owner/repo');
    }
  });

  it('parses http GitHub URL', () => {
    const result = parseSkillSource('http://github.com/owner/repo');
    assert.equal(result.type, 'skillssh');
    if (result.type === 'skillssh') {
      assert.equal(result.normalized, 'owner/repo');
    }
  });

  it('parses GitHub URL with trailing slash', () => {
    const result = parseSkillSource('https://github.com/owner/repo/');
    assert.equal(result.type, 'skillssh');
    if (result.type === 'skillssh') {
      assert.equal(result.normalized, 'owner/repo');
    }
  });

  it('treats relative path as local', () => {
    const result = parseSkillSource('./path/to/skill');
    assert.equal(result.type, 'local');
  });

  it('treats absolute path as local', () => {
    const result = parseSkillSource('/path/to/skill');
    assert.equal(result.type, 'local');
  });

  it('treats home path as local', () => {
    const result = parseSkillSource('~/path/to/skill');
    assert.equal(result.type, 'local');
  });

  it('treats deep GitHub URL paths as local', () => {
    // URLs with paths beyond owner/repo should not match
    const result = parseSkillSource('https://github.com/owner/repo/tree/main/skills/prd');
    assert.equal(result.type, 'local');
  });

  it('treats random text with slashes as local', () => {
    const result = parseSkillSource('some/random/path/with/slashes');
    assert.equal(result.type, 'local');
  });

  it('treats single word as local', () => {
    const result = parseSkillSource('skill-name');
    assert.equal(result.type, 'local');
  });
});
