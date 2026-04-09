import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { jaccardSimilarity, normalizeForJaccard } from '../../src/utils/similarity.js';

describe('jaccardSimilarity', () => {
  it('returns 0 for two empty arrays', () => {
    assert.strictEqual(jaccardSimilarity([], []), 0);
  });

  it('returns 1 for identical arrays', () => {
    assert.strictEqual(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c']), 1);
  });

  it('returns 0 for completely disjoint arrays', () => {
    assert.strictEqual(jaccardSimilarity(['a', 'b'], ['c', 'd']), 0);
  });

  it('returns correct value for partial overlap', () => {
    // intersection = {b, c} = 2, union = {a, b, c, d} = 4 → 0.5
    assert.strictEqual(jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd']), 0.5);
  });

  it('handles duplicate tokens by treating them as sets', () => {
    // Sets: {a, b} and {a, b} → intersection 2, union 2 → 1
    assert.strictEqual(jaccardSimilarity(['a', 'a', 'b'], ['a', 'b', 'b']), 1);
  });

  it('returns 0 when one array is empty and the other is not', () => {
    assert.strictEqual(jaccardSimilarity([], ['a', 'b']), 0);
    assert.strictEqual(jaccardSimilarity(['a', 'b'], []), 0);
  });
});

describe('normalizeForJaccard', () => {
  it('lowercases text', () => {
    assert.deepStrictEqual(normalizeForJaccard('Hello World'), ['hello', 'world']);
  });

  it('strips non-alphanumeric characters', () => {
    assert.deepStrictEqual(normalizeForJaccard("it's a test!"), ['its', 'a', 'test']);
  });

  it('converts newlines to spaces before splitting', () => {
    assert.deepStrictEqual(normalizeForJaccard('line1\nline2\r\nline3'), ['line1', 'line2', 'line3']);
  });

  it('returns empty array for empty string', () => {
    assert.deepStrictEqual(normalizeForJaccard(''), []);
  });

  it('returns empty array for whitespace-only input', () => {
    assert.deepStrictEqual(normalizeForJaccard('   '), []);
  });
});
