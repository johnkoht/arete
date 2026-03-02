import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRelationshipHealth,
  type HealthIndicator,
  type RelationshipHealth,
} from '../../src/services/person-health.js';

/** Helper: create a date string N days before the reference date. */
function daysAgo(n: number, ref: Date): string {
  const d = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
  d.setUTCDate(d.getUTCDate() - n);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const REF = new Date('2026-03-01T12:00:00Z');

describe('computeRelationshipHealth', () => {
  // -------------------------------------------------------------------
  // Empty / never met
  // -------------------------------------------------------------------
  it('returns dormant for empty meeting dates', () => {
    const result = computeRelationshipHealth([], 0, REF);
    assert.equal(result.lastMet, null);
    assert.equal(result.daysSinceLastMet, null);
    assert.equal(result.meetingsLast30Days, 0);
    assert.equal(result.meetingsLast90Days, 0);
    assert.equal(result.openLoopCount, 0);
    assert.equal(result.indicator, 'dormant');
  });

  it('returns dormant for empty array with open items', () => {
    const result = computeRelationshipHealth([], 5, REF);
    assert.equal(result.indicator, 'dormant');
    assert.equal(result.openLoopCount, 5);
  });

  // -------------------------------------------------------------------
  // Single meeting
  // -------------------------------------------------------------------
  it('returns active for a single meeting 3 days ago', () => {
    const result = computeRelationshipHealth([daysAgo(3, REF)], 1, REF);
    assert.equal(result.lastMet, daysAgo(3, REF));
    assert.equal(result.daysSinceLastMet, 3);
    assert.equal(result.meetingsLast30Days, 1);
    assert.equal(result.meetingsLast90Days, 1);
    assert.equal(result.openLoopCount, 1);
    assert.equal(result.indicator, 'active');
  });

  // -------------------------------------------------------------------
  // Multiple meetings
  // -------------------------------------------------------------------
  it('picks the most recent meeting date', () => {
    const dates = [daysAgo(50, REF), daysAgo(10, REF), daysAgo(25, REF)];
    const result = computeRelationshipHealth(dates, 0, REF);
    assert.equal(result.lastMet, daysAgo(10, REF));
    assert.equal(result.daysSinceLastMet, 10);
    assert.equal(result.indicator, 'active');
  });

  it('counts meetings in 30d and 90d windows correctly', () => {
    const dates = [
      daysAgo(5, REF),   // within 30 and 90
      daysAgo(20, REF),  // within 30 and 90
      daysAgo(45, REF),  // within 90 only
      daysAgo(80, REF),  // within 90 only
      daysAgo(100, REF), // outside both
    ];
    const result = computeRelationshipHealth(dates, 2, REF);
    assert.equal(result.meetingsLast30Days, 2);
    assert.equal(result.meetingsLast90Days, 4);
    assert.equal(result.openLoopCount, 2);
  });

  it('handles daily meetings (many dates)', () => {
    const dates: string[] = [];
    for (let i = 0; i < 60; i++) {
      dates.push(daysAgo(i, REF));
    }
    const result = computeRelationshipHealth(dates, 0, REF);
    assert.equal(result.daysSinceLastMet, 0);
    assert.equal(result.indicator, 'active');
    assert.equal(result.meetingsLast30Days, 31); // 0..30 inclusive
    assert.equal(result.meetingsLast90Days, 60);
  });

  // -------------------------------------------------------------------
  // Boundary dates (exact thresholds)
  // -------------------------------------------------------------------
  it('active at exactly 14 days', () => {
    const result = computeRelationshipHealth([daysAgo(14, REF)], 0, REF);
    assert.equal(result.daysSinceLastMet, 14);
    assert.equal(result.indicator, 'active');
  });

  it('regular at 15 days (just past active threshold)', () => {
    const result = computeRelationshipHealth([daysAgo(15, REF)], 0, REF);
    assert.equal(result.daysSinceLastMet, 15);
    assert.equal(result.indicator, 'regular');
  });

  it('regular at exactly 30 days', () => {
    const result = computeRelationshipHealth([daysAgo(30, REF)], 0, REF);
    assert.equal(result.daysSinceLastMet, 30);
    assert.equal(result.indicator, 'regular');
  });

  it('cooling at 31 days (just past regular threshold)', () => {
    const result = computeRelationshipHealth([daysAgo(31, REF)], 0, REF);
    assert.equal(result.daysSinceLastMet, 31);
    assert.equal(result.indicator, 'cooling');
  });

  it('cooling at exactly 60 days', () => {
    const result = computeRelationshipHealth([daysAgo(60, REF)], 0, REF);
    assert.equal(result.daysSinceLastMet, 60);
    assert.equal(result.indicator, 'cooling');
  });

  it('dormant at 61 days (just past cooling threshold)', () => {
    const result = computeRelationshipHealth([daysAgo(61, REF)], 0, REF);
    assert.equal(result.daysSinceLastMet, 61);
    assert.equal(result.indicator, 'dormant');
  });

  it('dormant at 365 days', () => {
    const result = computeRelationshipHealth([daysAgo(365, REF)], 0, REF);
    assert.equal(result.daysSinceLastMet, 365);
    assert.equal(result.indicator, 'dormant');
  });

  // -------------------------------------------------------------------
  // Meeting today
  // -------------------------------------------------------------------
  it('meeting today = 0 days since last met, active', () => {
    const result = computeRelationshipHealth([daysAgo(0, REF)], 0, REF);
    assert.equal(result.daysSinceLastMet, 0);
    assert.equal(result.lastMet, daysAgo(0, REF));
    assert.equal(result.indicator, 'active');
    assert.equal(result.meetingsLast30Days, 1);
    assert.equal(result.meetingsLast90Days, 1);
  });

  // -------------------------------------------------------------------
  // openLoopCount passthrough
  // -------------------------------------------------------------------
  it('passes through openLoopCount correctly', () => {
    const result = computeRelationshipHealth([daysAgo(5, REF)], 42, REF);
    assert.equal(result.openLoopCount, 42);
  });

  // -------------------------------------------------------------------
  // Invalid date strings
  // -------------------------------------------------------------------
  it('ignores invalid date strings', () => {
    const result = computeRelationshipHealth(['not-a-date', '2026-13-01', ''], 0, REF);
    assert.equal(result.lastMet, null);
    assert.equal(result.indicator, 'dormant');
  });

  it('uses valid dates even when mixed with invalid ones', () => {
    const result = computeRelationshipHealth(
      ['invalid', daysAgo(10, REF), 'also-bad'],
      1,
      REF,
    );
    assert.equal(result.daysSinceLastMet, 10);
    assert.equal(result.indicator, 'active');
    assert.equal(result.meetingsLast30Days, 1);
  });

  // -------------------------------------------------------------------
  // Default referenceDate (no pin)
  // -------------------------------------------------------------------
  it('defaults referenceDate to now when not provided', () => {
    // Meeting far in the past — should be dormant regardless of exact "now"
    const result = computeRelationshipHealth(['2020-01-01'], 0);
    assert.equal(result.indicator, 'dormant');
    assert.ok(result.daysSinceLastMet !== null && result.daysSinceLastMet > 60);
  });

  // -------------------------------------------------------------------
  // Type exports compile check (compile-time, not runtime)
  // -------------------------------------------------------------------
  it('exported types are usable', () => {
    const indicator: HealthIndicator = 'active';
    const health: RelationshipHealth = {
      lastMet: '2026-01-01',
      daysSinceLastMet: 10,
      meetingsLast30Days: 2,
      meetingsLast90Days: 5,
      openLoopCount: 1,
      indicator: 'regular',
    };
    assert.equal(indicator, 'active');
    assert.equal(health.indicator, 'regular');
  });

  // -------------------------------------------------------------------
  // 30-day boundary for meetingsLast30Days count
  // -------------------------------------------------------------------
  it('includes meeting at exactly 30 days in meetingsLast30Days', () => {
    const result = computeRelationshipHealth([daysAgo(30, REF)], 0, REF);
    assert.equal(result.meetingsLast30Days, 1);
  });

  it('excludes meeting at 31 days from meetingsLast30Days', () => {
    const result = computeRelationshipHealth([daysAgo(31, REF)], 0, REF);
    assert.equal(result.meetingsLast30Days, 0);
  });

  // -------------------------------------------------------------------
  // 90-day boundary for meetingsLast90Days count
  // -------------------------------------------------------------------
  it('includes meeting at exactly 90 days in meetingsLast90Days', () => {
    const result = computeRelationshipHealth([daysAgo(90, REF)], 0, REF);
    assert.equal(result.meetingsLast90Days, 1);
  });

  it('excludes meeting at 91 days from meetingsLast90Days', () => {
    const result = computeRelationshipHealth([daysAgo(91, REF)], 0, REF);
    assert.equal(result.meetingsLast90Days, 0);
  });
});
