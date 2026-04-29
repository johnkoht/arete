/**
 * Byte-equality test for the active-topic-slug bias block shared between
 * `meeting-extraction.ts` and the `slack-digest` skill markdown.
 *
 * Why this exists: the slack-digest skill is markdown-authored (no TS pipeline
 * of its own), so prompt regressions are invisible until topic narratives
 * sprawl. The dual-tier sprawl defense (extraction-prompt bias + Jaccard
 * alias-merge) needs both halves to stay in sync. This test reads SKILL.md,
 * extracts the bias block via sentinel comment markers, and asserts byte-
 * equality with the exported `TOPIC_BIAS_BLOCK_PROMPT` constant. Editing one
 * surface without the other fails the test.
 *
 * Failure mode caught: future PR updates the meeting-extraction prompt and
 * forgets to update the skill (or vice versa). The drift is silent without
 * this test.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPIC_BIAS_BLOCK_PROMPT } from '../../src/services/meeting-extraction.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// packages/core/test/runtime/ -> packages/runtime/skills/slack-digest/SKILL.md
const SKILL_MD_PATH = resolve(
  __dirname,
  '../../../runtime/skills/slack-digest/SKILL.md',
);

const START_MARKER = '<!-- BIAS_BLOCK_START -->';
const END_MARKER = '<!-- BIAS_BLOCK_END -->';

/**
 * Extracts the substring strictly between the start and end markers, trimming
 * a single leading/trailing newline (the markers sit on their own lines in the
 * skill markdown).
 */
function extractBiasBlock(content: string): string {
  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);
  assert.notStrictEqual(startIdx, -1, `${START_MARKER} not found in SKILL.md`);
  assert.notStrictEqual(endIdx, -1, `${END_MARKER} not found in SKILL.md`);
  assert.ok(startIdx < endIdx, 'start marker must precede end marker');

  const inner = content.slice(startIdx + START_MARKER.length, endIdx);
  // Markers live on their own lines; strip exactly one surrounding newline.
  return inner.replace(/^\n/, '').replace(/\n$/, '');
}

describe('slack-digest bias block byte-equality', () => {
  it('SKILL.md contains both bias-block sentinel markers exactly once', () => {
    const content = readFileSync(SKILL_MD_PATH, 'utf8');
    const startCount = content.split(START_MARKER).length - 1;
    const endCount = content.split(END_MARKER).length - 1;
    assert.strictEqual(startCount, 1, `${START_MARKER} count`);
    assert.strictEqual(endCount, 1, `${END_MARKER} count`);
  });

  it('bias block in SKILL.md is byte-equal to TOPIC_BIAS_BLOCK_PROMPT', () => {
    const content = readFileSync(SKILL_MD_PATH, 'utf8');
    const skillBiasBlock = extractBiasBlock(content);
    assert.strictEqual(
      skillBiasBlock,
      TOPIC_BIAS_BLOCK_PROMPT,
      'SKILL.md bias block drifted from meeting-extraction.ts TOPIC_BIAS_BLOCK_PROMPT — ' +
        'edit both surfaces together.',
    );
  });

  it('drift detection: a single-character mutation fails the byte-equality assertion', () => {
    // Sanity check that the assertion is load-bearing — a corrupted constant
    // would not equal the file contents.
    const corrupted = TOPIC_BIAS_BLOCK_PROMPT + 'X';
    const content = readFileSync(SKILL_MD_PATH, 'utf8');
    const skillBiasBlock = extractBiasBlock(content);
    assert.notStrictEqual(skillBiasBlock, corrupted);
  });
});
