import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyProvenance, applyProvenance } from '../../src/lib/provenance.js';

describe('classifyProvenance', () => {
  it('classifies working/ as draft (the load-bearing scratch signal)', () => {
    assert.equal(classifyProvenance('projects/active/status-letters/working/draft.md'), 'draft');
    assert.equal(classifyProvenance('projects/active/foo/working/v2/notes.md'), 'draft', 'nested under working/');
    // A README inside working/ is still a draft (working/ is checked first).
    assert.equal(classifyProvenance('projects/active/foo/working/README.md'), 'draft');
  });

  it('classifies outputs/ and the project README as published', () => {
    assert.equal(classifyProvenance('projects/active/foo/outputs/prd.md'), 'published');
    assert.equal(classifyProvenance('projects/active/foo/outputs/sub/spec.md'), 'published', 'nested under outputs/');
    assert.equal(classifyProvenance('projects/active/foo/README.md'), 'published');
    // singular output/ (notion-refactor uses this)
    assert.equal(classifyProvenance('projects/active/notion-refactor/output/plan.md'), 'published');
  });

  it('classifies inputs/ as reference (incl. singular)', () => {
    assert.equal(classifyProvenance('projects/active/foo/inputs/competitor-prd.md'), 'reference');
    assert.equal(classifyProvenance('projects/active/notion-refactor/input/ref.md'), 'reference');
  });

  it('leaves the durable long-tail UNLABELED (ranks normally, not penalized)', () => {
    assert.equal(classifyProvenance('projects/active/adjuster-shadowing/discovery.md'), undefined, 'root doc');
    assert.equal(classifyProvenance('projects/active/claims-review/skill/SKILL.md'), undefined, 'skill/');
    assert.equal(classifyProvenance('projects/active/onboarding/plan/30-60-90.md'), undefined, 'plan/');
    assert.equal(classifyProvenance('projects/active/email-rollout/rollout-strategy/PLAYBOOK.md'), undefined);
    assert.equal(classifyProvenance('projects/active/disco/sessions/s01.md'), undefined, 'sessions stay neutral');
  });

  it('handles both archive shapes and Windows separators', () => {
    assert.equal(classifyProvenance('projects/archive/2026-06_glance-comms/working/x.md'), 'draft', 'YYYY-MM_ archive');
    assert.equal(classifyProvenance('projects/archive/2026-06_glance-comms/outputs/x.md'), 'published');
    assert.equal(classifyProvenance('projects/archive/bare-slug/working/x.md'), 'draft', 'bare-slug archive tolerated');
    assert.equal(classifyProvenance('projects\\active\\foo\\working\\x.md'), 'draft', 'backslash separators');
  });

  it('returns undefined for non-project paths (incl. workspace READMEs)', () => {
    assert.equal(classifyProvenance('context/README.md'), undefined);
    assert.equal(classifyProvenance('inbox/README.md'), undefined);
    assert.equal(classifyProvenance('resources/meetings/2026-01-01-foo.md'), undefined);
    assert.equal(classifyProvenance('.arete/memory/topics/status-letters.md'), undefined);
    assert.equal(classifyProvenance('projects/index.md'), undefined, 'not under active|archive/<seg>/');
  });
});

describe('applyProvenance', () => {
  const item = (path: string, score: number) => ({ path, score, title: path, snippet: '' });

  it('stable-sinks drafts below all non-draft results, even higher-scoring ones', () => {
    const results = [
      item('projects/active/foo/working/brainstorm.md', 0.9), // most relevant by BM25, but scratch
      item('projects/active/foo/outputs/prd.md', 0.5),
      item('projects/active/foo/discovery.md', 0.4), // durable root doc, unlabeled
    ];
    const out = applyProvenance(results);
    assert.deepEqual(
      out.map((r) => r.path),
      [
        'projects/active/foo/outputs/prd.md',
        'projects/active/foo/discovery.md',
        'projects/active/foo/working/brainstorm.md',
      ],
      'the working/ draft sinks to the bottom despite the highest score',
    );
    assert.deepEqual(out.map((r) => r.provenance), ['published', undefined, 'draft']);
  });

  it('never mutates the displayed score', () => {
    const results = [item('projects/active/foo/working/a.md', 0.91)];
    const out = applyProvenance(results);
    assert.equal(out[0].score, 0.91);
  });

  it('preserves order when there are no drafts', () => {
    const results = [
      item('resources/meetings/m1.md', 0.8),
      item('projects/active/foo/outputs/prd.md', 0.6),
      item('context/notes.md', 0.5),
    ];
    const out = applyProvenance(results);
    assert.deepEqual(
      out.map((r) => r.path),
      ['resources/meetings/m1.md', 'projects/active/foo/outputs/prd.md', 'context/notes.md'],
    );
    assert.deepEqual(out.map((r) => r.provenance), [undefined, 'published', undefined]);
  });
});
