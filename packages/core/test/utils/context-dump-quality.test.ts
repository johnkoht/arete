import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContextDumpArtifacts,
  buildContextDumpQualityReport,
} from '../../src/utils/context-dump-quality.js';

describe('context dump quality utilities', () => {
  it('builds draft artifacts with evidence references for all input channels', () => {
    const artifacts = buildContextDumpArtifacts([
      {
        type: 'website',
        source: 'acme.com',
        content: 'Acme helps B2B teams ship faster with workflow analytics and onboarding support.',
      },
      {
        type: 'paste',
        source: 'chat',
        content: 'Top goal this quarter is improve activation and reduce onboarding friction.',
      },
      {
        type: 'folder',
        source: 'inputs/onboarding-dump',
        content: 'User interviews mention setup confusion and unclear success criteria.',
      },
    ]);

    assert.equal(artifacts.length, 3);
    assert.ok(artifacts[0].title.includes('[DRAFT]'));
    assert.ok(artifacts[1].title.includes('Strategy Summary'));
    assert.ok(artifacts[2].title.includes('Review Checklist'));
    assert.ok(artifacts.every((artifact) => artifact.evidenceRefs.length === 3));
  });

  it('returns non-blocking report with zero-quality metrics when no extractable facts are present', () => {
    const report = buildContextDumpQualityReport([
      {
        type: 'paste',
        source: 'chat',
        content: 'ok',
      },
    ]);

    assert.equal(report.artifacts.length, 3);
    assert.equal(report.completenessScore, 0);
    assert.ok(report.evidenceCoverageScore > 0);
    assert.ok(report.extractionQualityScore >= 0);
  });

  it('improves extraction quality score with richer multi-source inputs', () => {
    const sparse = buildContextDumpQualityReport([
      {
        type: 'paste',
        source: 'chat',
        content: 'brief note only',
      },
    ]);

    const rich = buildContextDumpQualityReport([
      {
        type: 'website',
        source: 'acme.com',
        content: 'Acme provides onboarding automation. Customers are product managers at growth-stage SaaS firms. The mission is to reduce time-to-first-value in the first 30 minutes.',
      },
      {
        type: 'folder',
        source: 'inputs/onboarding-dump',
        content: 'Research notes: Users report confusion during setup and ask for clearer guidance. Strategy docs prioritize activation and second-skill usage.',
      },
      {
        type: 'paste',
        source: 'chat',
        content: 'Quarter goal: improve completion rate from 45% to 60% while preserving review-first trust.',
      },
    ]);

    assert.ok(rich.extractionQualityScore >= sparse.extractionQualityScore);
    assert.ok(rich.completenessScore >= sparse.completenessScore);
  });
});
