/**
 * Chef-orchestrator skill prose smoke tests.
 *
 * Lightweight assertion-only tests that validate the SHIPPED structure
 * of each chef-rewritten SKILL.md against the chef-orchestrator pattern
 * envelope. These do NOT exercise an agent harness — they verify the
 * static prose includes the load-bearing sections an agent harness
 * would consult.
 *
 * Each chef-rewritten skill must:
 * - Have a "Read first" stanza referencing .arete/skills-local/<slug>.md
 * - Reference the four chef-orchestrator patterns from PATTERNS.md
 * - Include a Rollback section (`git revert` of the rewrite commit per
 *   Phase 3 Step 9 / MC5 sunset; the previous `ARETE_LEGACY_SKILL_PROSE`
 *   env var routing was removed when Phase 3 sunset legacy artifacts).
 *
 * Note: pre-MC5-sunset, this suite also asserted `SKILL.legacy.md`
 * presence and `ARETE_LEGACY_SKILL_PROSE` references — both have been
 * removed per Phase 3 plan §(g).
 *
 * Phase 2 shipped 5 chef skills; Phase 4 added 4 more (inbox-triage,
 * email-triage, slack-digest, schedule-meeting). The same envelope
 * checks apply to all 9. Schedule-meeting differs in two ways:
 * (1) it's a two-engage skill so the persist path uses {slug}-{date}.md
 * (with the meeting/person slug, not just date); (2) it's small enough
 * that the sidecar pattern doesn't apply — the curated-view persistence
 * IS the audit trail.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname ?? '', '..', '..', '..', '..');
const SKILLS_DIR = join(REPO_ROOT, 'packages', 'runtime', 'skills');

const PHASE_2_CHEF_SKILLS = [
  'daily-winddown',
  'weekly-winddown',
  'week-plan',
  'process-meetings',
  'meeting-prep',
] as const;

const PHASE_4_CHEF_SKILLS = [
  'inbox-triage',
  'email-triage',
  'slack-digest',
  'schedule-meeting',
] as const;

const CHEF_ORCHESTRATOR_SKILLS = [
  ...PHASE_2_CHEF_SKILLS,
  ...PHASE_4_CHEF_SKILLS,
] as const;

describe('Chef-orchestrator skill prose (Phase 2 + Phase 4)', () => {
  for (const slug of CHEF_ORCHESTRATOR_SKILLS) {
    describe(slug, () => {
      const skillDir = join(SKILLS_DIR, slug);
      const skillPath = join(skillDir, 'SKILL.md');
      const legacyPath = join(skillDir, 'SKILL.legacy.md');

      it('SKILL.md exists', () => {
        assert.ok(existsSync(skillPath), `${skillPath} missing`);
      });

      it('SKILL.legacy.md is GONE post Phase 3 MC5 sunset', () => {
        assert.ok(
          !existsSync(legacyPath),
          `${legacyPath} should NOT exist post Phase 3 MC5 sunset; rollback is via git revert of the Phase 2 rewrite commit`,
        );
      });

      it('SKILL.md "Read first" stanza references the APPEND file', () => {
        const content = readFileSync(skillPath, 'utf8');
        // Look for case-insensitive "Read first" + the per-skill APPEND path
        assert.match(
          content,
          /\*\*Read first\*\*/i,
          'Missing "Read first" stanza',
        );
        assert.ok(
          content.includes(`.arete/skills-local/${slug}.md`),
          `Missing reference to .arete/skills-local/${slug}.md`,
        );
      });

      it('SKILL.md references PATTERNS.md', () => {
        const content = readFileSync(skillPath, 'utf8');
        assert.match(content, /PATTERNS\.md/);
      });

      it('SKILL.md references all four chef-orchestrator patterns', () => {
        const content = readFileSync(skillPath, 'utf8');
        // Each pattern name appears at least once. Patterns are
        // canonical names from PATTERNS.md.
        const patterns = [
          'do-all-work-then-engage',
          'curate-with-reason-labels',
          'propose-with-mcp-action',
          'surface-deferred-as-sidecar',
        ];
        for (const pattern of patterns) {
          assert.ok(
            content.includes(pattern),
            `${slug} SKILL.md missing reference to pattern: ${pattern}`,
          );
        }
      });

      it('SKILL.md has Rollback section pointing at git revert (post MC5 sunset)', () => {
        const content = readFileSync(skillPath, 'utf8');
        assert.match(content, /## Rollback/);
        assert.ok(
          content.includes('git revert'),
          'Rollback section should describe `git revert` of the Phase 2 commit (post MC5 sunset)',
        );
        assert.ok(
          !content.includes('ARETE_LEGACY_SKILL_PROSE'),
          'ARETE_LEGACY_SKILL_PROSE should not appear in SKILL.md post MC5 sunset',
        );
      });

      it('SKILL.md frontmatter has name + description + triggers (when applicable)', () => {
        const content = readFileSync(skillPath, 'utf8');
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        assert.ok(fmMatch, 'No YAML frontmatter found');
        const fm = fmMatch![1];
        assert.match(fm, new RegExp(`^name:\\s*${slug}`, 'm'), 'frontmatter.name missing or wrong');
        assert.match(fm, /^description:\s*\S/m, 'frontmatter.description missing');
      });

      // Phase 3.5 C1 — every chef SKILL.md must instruct the agent to
      // persist the curated view to `now/archive/<skill>/...md` BEFORE
      // engaging the user. AC3.5.7. The Phase 3.5 followup commit
      // (7ca3ea47) moved the path from `now/<skill>-...md` to
      // `now/archive/<skill>/<skill>-...md`.
      it('Phase 3.5 C1 — instructs agent to persist curated view to now/archive/<skill>/...md (AC3.5.7)', () => {
        const content = readFileSync(skillPath, 'utf8');
        // Each skill uses a distinct filename pattern under
        // `now/archive/<skill>/`. Assert the skill-specific filename
        // base appears AND the persist directive is in the prose.
        const expectedPath = (() => {
          switch (slug) {
            case 'daily-winddown':
              return 'now/archive/daily-winddown/winddown-';
            case 'weekly-winddown':
              return 'now/archive/weekly-winddown/weekly-winddown-';
            case 'week-plan':
              return 'now/archive/week-plan/week-plan-';
            case 'process-meetings':
              return 'now/archive/process-meetings/process-meetings-';
            case 'meeting-prep':
              return 'now/archive/meeting-prep/meeting-prep-';
            case 'inbox-triage':
              return 'now/archive/inbox-triage/inbox-triage-';
            case 'email-triage':
              return 'now/archive/email-triage/email-triage-';
            case 'slack-digest':
              return 'now/archive/slack-digest/slack-digest-';
            case 'schedule-meeting':
              return 'now/archive/schedule-meeting/schedule-meeting-';
            default:
              return null;
          }
        })();
        assert.ok(expectedPath, `${slug}: no expected persist path defined`);
        assert.ok(
          content.includes(expectedPath!),
          `${slug} SKILL.md missing persist-path "${expectedPath}"`,
        );
        // Persist directive lives in the prose: "Persist the curated
        // view" is the canonical phrase across the chef skills.
        assert.match(
          content,
          /Persist (the )?(curated|prep|Phase-?4|Step-?3|full Step|full Phase) (view|brief|priorities|output)/i,
          `${slug} missing "Persist the curated/prep view" directive`,
        );
      });

      // Phase 3.5 C2 — every chef SKILL.md must include the
      // strengthened Uncertain-tier rule with at least 3 explicit
      // category examples. AC3.5.8.
      it('Phase 3.5 C2 — Uncertain rule includes the three category examples (AC3.5.8)', () => {
        const content = readFileSync(skillPath, 'utf8');
        for (const example of [
          'needs verification',
          'interesting future',
          'covered elsewhere',
        ]) {
          assert.ok(
            content.includes(example),
            `${slug} SKILL.md missing "${example}" defer-category example`,
          );
        }
        // The framing phrase that makes the rule operative.
        assert.match(
          content,
          /(LOW-confidence|surface to Uncertain)/i,
          `${slug} missing strengthened-Uncertain framing phrase`,
        );
      });
    });
  }

  describe('Phase 3.5 D2 — daily-winddown scans prior sidecar', () => {
    it('daily-winddown SKILL.md instructs to scan prior sidecar and log deferral_disagreement', () => {
      const content = readFileSync(
        join(SKILLS_DIR, 'daily-winddown', 'SKILL.md'),
        'utf8',
      );
      // Step header.
      assert.match(content, /scan previous day's deferred sidecar/i);
      // CLI invocation.
      assert.match(
        content,
        /arete events log deferral-disagreement/,
        'daily-winddown should reference the deferral-disagreement CLI',
      );
      // The pull-back markers.
      assert.match(content, /\[\[pull-back\]\]/);
      assert.match(content, /\[\[defer\]\]/);
    });
  });

  describe('Phase 3.5 followup-5 AC6 — daily-winddown surfaces stale-topic alias candidates', () => {
    it('daily-winddown SKILL.md surfaces stale topics with concrete alias candidates in Uncertain tier', () => {
      const content = readFileSync(
        join(SKILLS_DIR, 'daily-winddown', 'SKILL.md'),
        'utf8',
      );
      // Stale-topic + alias surfacing must be referenced. Regex is
      // intentionally LOOSE (per pre-mortem R9: brittle exact phrasing
      // breaks on small wording tweaks). Just assert the key concepts
      // appear together somewhere in the doc.
      assert.match(
        content,
        /stale.*topic/i,
        'AC6: daily-winddown should mention stale topics',
      );
      assert.match(
        content,
        /alias/i,
        'AC6: daily-winddown should mention alias candidates',
      );
      // The CLI command the user runs to integrate after adding aliases.
      assert.match(
        content,
        /arete topic refresh/,
        'AC6: daily-winddown should reference `arete topic refresh` as the user-facing CLI',
      );
      // The Uncertain-tier surface (not auto-defer).
      assert.match(
        content,
        /Uncertain/,
        'AC6: stale-topic surface should appear in the Uncertain tier',
      );
      // Cap rule: ONE per winddown. Searches loosely for "one" near
      // "winddown" / "per run" / "stale".
      assert.match(
        content,
        /(ONE|one) (per winddown|stale-topic|stale topic)/i,
        'AC6: cap rule (one stale-topic surface per winddown) must be documented',
      );
    });
  });

  describe('week-plan two-engage variant', () => {
    it('explicitly documents the two-engage pattern', () => {
      const content = readFileSync(
        join(SKILLS_DIR, 'week-plan', 'SKILL.md'),
        'utf8',
      );
      // Per phase plan §(c.3) — week-plan must explicitly document
      // the two-engage variant of do-all-work-then-engage.
      assert.match(content, /two-engage/i, 'Missing two-engage documentation');
      assert.ok(
        content.includes('Engage 1') && content.includes('Engage 2'),
        'Missing Engage 1 / Engage 2 sequence labels',
      );
    });
  });

  describe('Phase 8-followup-3 — planning-chain prerequisite checks', () => {
    it('week-plan SKILL.md checks for prior weekly-winddown', () => {
      const content = readFileSync(
        join(SKILLS_DIR, 'week-plan', 'SKILL.md'),
        'utf8',
      );
      // The skill must reference the prerequisite check step + the
      // weekly-winddown archive path + the skip option.
      assert.match(
        content,
        /now\/archive\/weekly-winddown\/weekly-winddown-/,
        'week-plan missing weekly-winddown archive path in prerequisite check',
      );
      assert.match(
        content,
        /Prerequisite check|prerequisite check/i,
        'week-plan missing "Prerequisite check" header',
      );
      // Skip option must be visible.
      assert.match(
        content,
        /\bskip\b/i,
        'week-plan prerequisite check missing skip option',
      );
      // Best-effort framing (never block).
      assert.match(
        content,
        /best-effort|Best-effort|never block/i,
        'week-plan missing best-effort/never-block framing',
      );
    });

    it('daily-plan SKILL.md checks for week-plan + prior-day daily-winddown', () => {
      const content = readFileSync(
        join(SKILLS_DIR, 'daily-plan', 'SKILL.md'),
        'utf8',
      );
      // Two prerequisite paths must appear:
      assert.match(
        content,
        /now\/archive\/week-plan\/week-plan-/,
        'daily-plan missing week-plan archive path in prerequisite check 2a',
      );
      assert.match(
        content,
        /now\/archive\/daily-winddown\/winddown-/,
        'daily-plan missing daily-winddown archive path in prerequisite check 2b',
      );
      // Skip option must be visible.
      assert.match(
        content,
        /\bskip\b/i,
        'daily-plan prerequisite checks missing skip option',
      );
      // Best-effort / never-block framing.
      assert.match(
        content,
        /Best-effort|never block/i,
        'daily-plan missing best-effort/never-block framing',
      );
      // Monday-weekend handling.
      assert.match(
        content,
        /Monday|weekend|Friday/i,
        'daily-plan missing weekend/Monday-fallback handling for prior-day check',
      );
    });
  });

  describe('PATTERNS.md', () => {
    it('contains all four chef-orchestrator pattern definitions', () => {
      const patternsPath = join(SKILLS_DIR, 'PATTERNS.md');
      assert.ok(existsSync(patternsPath));
      const content = readFileSync(patternsPath, 'utf8');

      // Each pattern has its own ## section
      const headers = [
        '## do-all-work-then-engage',
        '## curate-with-reason-labels',
        '## propose-with-mcp-action',
        '## surface-deferred-as-sidecar',
      ];
      for (const h of headers) {
        assert.ok(
          content.includes(h),
          `PATTERNS.md missing section header: ${h}`,
        );
      }
    });

    it('documents the action verb taxonomy with both modes', () => {
      const patternsPath = join(SKILLS_DIR, 'PATTERNS.md');
      const content = readFileSync(patternsPath, 'utf8');
      assert.match(content, /executable/);
      assert.match(content, /draft-only/);
      // Jira ships as draft-only since no MCP today
      assert.ok(
        content.includes('jira.create_ticket') &&
          content.includes('draft-only'),
        'PATTERNS.md should document Jira as draft-only',
      );
    });

    it('documents the two-engage variant in Pattern 1', () => {
      const patternsPath = join(SKILLS_DIR, 'PATTERNS.md');
      const content = readFileSync(patternsPath, 'utf8');
      assert.match(content, /two-engage/i);
    });

    // Phase 7a AC1 — PATTERNS.md gains a "gather-only composition"
    // sub-mode section, parallel to the four chef-orchestrator patterns.
    // Loose regex (not exact phrasing) per the post-Phase-3.5-followup
    // test conventions; brittle exact phrasing breaks on small wording
    // tweaks.
    it('Phase 7a AC1 — documents the gather-only composition sub-mode', () => {
      const patternsPath = join(SKILLS_DIR, 'PATTERNS.md');
      const content = readFileSync(patternsPath, 'utf8');
      // The new section header.
      assert.match(
        content,
        /gather-only composition/i,
        'PATTERNS.md missing "gather-only composition" section',
      );
      // The explicit best-effort prose contract limitation.
      assert.match(
        content,
        /best-effort prose contract/i,
        'PATTERNS.md gather-only section missing "best-effort prose contract" limitation framing',
      );
      // Loop shape conventions — source/counterparty/timestamp/text/evidence.
      assert.match(content, /counterparty/i);
      assert.match(content, /evidence_pointer/i);
      // Invocation marker.
      assert.match(content, /\[gather-only\]/);
    });
  });

  // Phase 7a AC2 — slack-digest SKILL.md gains a "Gather-only mode"
  // section that cites the PATTERNS.md "gather-only composition" anchor.
  // Loose regex per the post-Phase-3.5-followup conventions.
  describe('Phase 7a AC2 — slack-digest gather-only mode', () => {
    it('slack-digest SKILL.md cites the gather-only composition PATTERNS.md anchor', () => {
      const content = readFileSync(
        join(SKILLS_DIR, 'slack-digest', 'SKILL.md'),
        'utf8',
      );
      // The skill-level section header.
      assert.match(
        content,
        /## Gather-only mode/i,
        'slack-digest SKILL.md missing "Gather-only mode" section',
      );
      // Reference to PATTERNS.md gather-only composition anchor (loose).
      assert.match(
        content,
        /gather-only composition/i,
        'slack-digest SKILL.md missing reference to PATTERNS.md gather-only composition anchor',
      );
      // Invocation marker convention.
      assert.match(content, /\[gather-only\]/);
      // JSON output shape — at least the canonical fields.
      assert.match(content, /counterparty/);
      assert.match(content, /evidence_pointer/);
      // Explicit skip list — must mention resources/notes (the
      // failure mode pre-mortem R2 calls out).
      assert.match(content, /resources\/notes/);
    });
  });

  // Phase 7a AC3 — email-triage SKILL.md gains a "Gather-only mode"
  // section that cites the PATTERNS.md "gather-only composition" anchor.
  // Loose regex per the post-Phase-3.5-followup conventions.
  describe('Phase 7a AC3 — email-triage gather-only mode', () => {
    it('email-triage SKILL.md cites the gather-only composition PATTERNS.md anchor', () => {
      const content = readFileSync(
        join(SKILLS_DIR, 'email-triage', 'SKILL.md'),
        'utf8',
      );
      // The skill-level section header.
      assert.match(
        content,
        /## Gather-only mode/i,
        'email-triage SKILL.md missing "Gather-only mode" section',
      );
      // Reference to PATTERNS.md gather-only composition anchor (loose).
      assert.match(
        content,
        /gather-only composition/i,
        'email-triage SKILL.md missing reference to PATTERNS.md gather-only composition anchor',
      );
      // Invocation marker convention.
      assert.match(content, /\[gather-only\]/);
      // JSON output shape — at least the canonical fields.
      assert.match(content, /counterparty/);
      assert.match(content, /evidence_pointer/);
      // Explicit skip list — must mention now/archive/email-triage
      // (analogous to pre-mortem R2 for slack-digest's resources/notes).
      assert.match(content, /now\/archive\/email-triage/);
    });
  });

  // Phase 8-followup-5 (Item A) — slack-digest gather-only mode WRITES
  // `resources/notes/<date>-slack-digest.md` (durable wiki source) but
  // MUST NOT write `now/archive/slack-digest/` (orchestrator owns the
  // composed view). This carve-out was the wrong call in the original
  // Phase 7a contract; the wiki was never seeing today's slack signal
  // on days where the user only ran `/daily-winddown`.
  describe('Phase 8-followup-5 Item A — slack-digest gather-only durable-write carve-out', () => {
    const sdContent = readFileSync(
      join(SKILLS_DIR, 'slack-digest', 'SKILL.md'),
      'utf8',
    );

    it('gather-only mode WRITES resources/notes/ digest file (durable wiki source)', () => {
      // The run/skip table for Step 5b must indicate "yes" (or
      // equivalent) for gather-only mode, AND the prose must explain
      // that the digest is the wiki source consumed by topic refresh.
      assert.match(
        sdContent,
        /durable wiki[- ]source/i,
        'slack-digest should call resources/notes/ digest "durable wiki source"',
      );
      assert.match(
        sdContent,
        /MUST still write/i,
        'slack-digest should explicitly list what MUST still write in gather-only mode',
      );
      assert.match(
        sdContent,
        /arete topic refresh/,
        'slack-digest should reference topic-refresh consumer of the durable digest',
      );
    });

    it('gather-only mode MUST NOT write now/archive/slack-digest/ (orchestrator owns composed view)', () => {
      // The MUST NOT list must call out now/archive/slack-digest/
      // explicitly. Note resources/notes/ should NOT appear in the
      // MUST NOT block — the durable carve-out lifted it out.
      assert.match(
        sdContent,
        /MUST NOT[\s\S]{0,400}now\/archive\/slack-digest/,
        'slack-digest MUST NOT list should still block now/archive/slack-digest/ in gather-only mode',
      );
    });

    it('orchestrator invocation prompt clarifies the resources/notes carve-out', () => {
      const dwContent = readFileSync(
        join(SKILLS_DIR, 'daily-winddown', 'SKILL.md'),
        'utf8',
      );
      // The 1k invocation must not say "Do NOT [...] write to resources/notes/"
      // (that was the bug); it must instead explicitly preserve the
      // resources/notes write as expected behavior.
      const slackInvocation = dwContent.match(
        /Run the slack-digest skill[\s\S]{0,1200}/,
      );
      assert.ok(slackInvocation, 'daily-winddown 1k invocation prompt missing');
      // The corrected prompt mentions the digest file is still written.
      assert.match(
        slackInvocation![0],
        /resources\/notes[\s\S]{0,200}(IS still written|wiki source|durable)/i,
        'daily-winddown 1k invocation should clarify resources/notes/ IS still written in gather-only mode',
      );
    });

    it('1j/1q mtime-snapshot prose explains the resources/notes scope exclusion', () => {
      const dwContent = readFileSync(
        join(SKILLS_DIR, 'daily-winddown', 'SKILL.md'),
        'utf8',
      );
      // The Step 1j prose must mention resources/notes/ as
      // intentionally OUT of mtime-scope (the snapshot covers
      // `now/archive/<sub-skill>/` only).
      assert.match(
        dwContent,
        /resources\/notes[\s\S]{0,300}(expected|carve-out|intentionally|NOT in scope)/i,
        '1j mtime-snapshot prose should explain resources/notes/ is intentionally out of scope',
      );
    });
  });

  // Phase 8-followup-5 (Item C) — weekly-winddown agenda GC step.
  // Daily-winddown's Step 1g cleans up orphan agendas only when daily
  // runs; on Fri/Sat/Sun when weekly-winddown closes the chain,
  // agendas accumulate. User reported 6 orphans spanning 2+ weeks
  // before this step shipped. Mirror Step 1g's principle with a 14d
  // cutoff.
  describe('Phase 8-followup-5 Item C — weekly-winddown agenda GC step', () => {
    const wwContent = readFileSync(
      join(SKILLS_DIR, 'weekly-winddown', 'SKILL.md'),
      'utf8',
    );

    it('SKILL.md has an agenda-GC step (scans now/agendas/)', () => {
      assert.match(
        wwContent,
        /Orphan agenda GC|Agenda GC|agenda-GC|agenda GC|orphan agenda/i,
        'weekly-winddown SKILL.md missing agenda-GC step header/prose',
      );
      assert.match(
        wwContent,
        /now\/agendas\//,
        'weekly-winddown agenda-GC step missing now/agendas/ scan',
      );
    });

    it('GC step uses a date cutoff (default 14 days)', () => {
      assert.match(
        wwContent,
        /14[- ]?day|14d|cutoff/i,
        'weekly-winddown agenda-GC step missing 14-day cutoff reference',
      );
    });

    it('GC step surfaces orphans to the curated view (not silent auto-delete)', () => {
      // Default behavior: list orphan agendas in the review for
      // user approval. Auto-delete is opt-in via APPEND.
      assert.match(
        wwContent,
        /Surface, don't auto-delete|surface.*not.*auto|Carryovers from agenda/i,
        'weekly-winddown agenda-GC should surface orphans (not silently delete)',
      );
    });
  });

  // Phase 8-followup-5 (Item B) — importance taxonomy alignment.
  // Canonical source of truth: packages/core/src/integrations/meetings.ts
  //   export type Importance = 'skip' | 'light' | 'normal' | 'important';
  // SKILL.md prose previously said `heavy | standard | light | skip`
  // (no overlap with `normal | important`). The importance-gating
  // logic could never fire as written. This test guards against
  // recurrence: any chef SKILL.md that quotes specific importance
  // values must use ONLY values from the canonical set.
  describe('Phase 8-followup-5 Item B — importance taxonomy alignment with extractor', () => {
    const CANONICAL_IMPORTANCE = ['skip', 'light', 'normal', 'important'];
    const FORBIDDEN_IMPORTANCE = ['heavy', 'standard'];

    const skillsToCheck = ['daily-winddown', 'weekly-winddown'] as const;

    for (const slug of skillsToCheck) {
      it(`${slug} SKILL.md uses canonical importance taxonomy (not heavy/standard)`, () => {
        const content = readFileSync(
          join(SKILLS_DIR, slug, 'SKILL.md'),
          'utf8',
        );
        // Match `importance: <token>` patterns and confirm token ∈ canonical.
        const importanceMatches = content.matchAll(
          /`?importance:\s*([a-zA-Z]+)`?/g,
        );
        const found = new Set<string>();
        for (const m of importanceMatches) {
          found.add(m[1]);
        }
        for (const forbidden of FORBIDDEN_IMPORTANCE) {
          assert.ok(
            !found.has(forbidden),
            `${slug}: forbidden importance value "${forbidden}" appears in \`importance: ${forbidden}\`. Canonical taxonomy is ${CANONICAL_IMPORTANCE.join(' | ')}.`,
          );
        }
        // Free-text references to "heavy meetings" / "standard meetings"
        // would also be wrong. Check word-bounded usage in importance
        // context.
        assert.doesNotMatch(
          content,
          /\b(heavy|standard) meetings?\b/i,
          `${slug}: "heavy meetings" / "standard meetings" prose contradicts canonical taxonomy`,
        );
        // At least one canonical value should appear, proving the
        // taxonomy is referenced.
        const anyCanonical = CANONICAL_IMPORTANCE.some(
          (v) => content.includes(`importance: ${v}`),
        );
        assert.ok(
          anyCanonical,
          `${slug}: SKILL.md should reference canonical importance values (importance: skip|light|normal|important)`,
        );
      });
    }

    it('canonical taxonomy in source matches what SKILL.md prose expects', () => {
      // Direct read of the source-of-truth file; regression guard if
      // someone tightens the type alias and forgets to update prose.
      const importancePath = join(
        REPO_ROOT,
        'packages',
        'core',
        'src',
        'integrations',
        'meetings.ts',
      );
      const src = readFileSync(importancePath, 'utf8');
      assert.match(
        src,
        /export type Importance =\s*'skip'\s*\|\s*'light'\s*\|\s*'normal'\s*\|\s*'important'/,
        'Importance type drifted — SKILL.md prose assertions also need updating',
      );
    });
  });

  // Phase 8 — daily-winddown becomes the cross-skill chef-orchestrator.
  // These tests guard against prose drift in the Step 1 cross-skill
  // gather, the Step 2 reconciler, the Closed-today narrative section,
  // the proposed-collapse engagement surface, the channel-backfill
  // nudge, and the D8 "always full" framing. Loose regex per the
  // post-Phase-3.5-followup conventions; D7 means there's no end-to-end
  // reconciler test — soak is the validation layer, prose-regex guards
  // against drift.
  describe('Phase 8 — daily-winddown cross-skill chef-orchestrator', () => {
    const dwContent = readFileSync(
      join(SKILLS_DIR, 'daily-winddown', 'SKILL.md'),
      'utf8',
    );

    describe('AC1 — cross-skill gather (Step 1)', () => {
      it('Step 1 header reflects the cross-skill gather rewrite', () => {
        assert.match(
          dwContent,
          /### Step 1 — Cross-skill gather/i,
          'AC1: Step 1 should be renamed "Cross-skill gather"',
        );
      });

      it('invokes slack-digest in [gather-only] mode (Pattern 5)', () => {
        // Pattern 5 invocation marker + skill reference.
        assert.match(
          dwContent,
          /slack-digest skill in `?\[gather-only\]`?/i,
          'AC1: missing slack-digest [gather-only] invocation',
        );
      });

      it('invokes email-triage in [gather-only] mode (Pattern 5)', () => {
        assert.match(
          dwContent,
          /email-triage skill in `?\[gather-only\]`?/i,
          'AC1: missing email-triage [gather-only] invocation',
        );
      });

      it('invokes process-meetings in [gather-only] mode for intent loops', () => {
        assert.match(
          dwContent,
          /process-meetings skill in `?\[gather-only\]`?/i,
          'AC1: missing process-meetings [gather-only] invocation',
        );
      });

      it('pulls forward calendar via arete pull calendar --days 30 --json', () => {
        assert.match(
          dwContent,
          /arete pull calendar --days 30 --json/,
          'AC1: missing forward-30d calendar pull',
        );
      });

      it('pulls backward calendar window via arete pull calendar --days -N', () => {
        // Phase 8-followup-1 (item 2) added negative-integer support to
        // --days in `arete pull calendar`. SKILL.md now uses
        // `arete pull calendar --days -1 --json` for the backward window
        // instead of the original per-day --date workaround.
        assert.match(
          dwContent,
          /arete pull calendar --days -\d+/,
          'AC1: missing backward calendar pull (--days negative-integer; phase-8-followup-1 item 2)',
        );
      });

      it('pulls open commitments via arete commitments list --json', () => {
        assert.match(
          dwContent,
          /arete commitments list --json/,
          'AC1: missing commitments pull',
        );
      });

      it('pulls active areas/epics watchlist via arete areas epics --active --json', () => {
        assert.match(
          dwContent,
          /arete areas epics --active --json/,
          'AC1: missing areas epics watchlist pull',
        );
      });

      it('reads now/week.md as part of cross-skill gather', () => {
        assert.match(
          dwContent,
          /now\/week\.md/,
          'AC1: missing now/week.md read',
        );
      });

      it('pulls channel-coverage audit via arete people audit-channels --json (AC5)', () => {
        assert.match(
          dwContent,
          /arete people audit-channels --json/,
          'AC1/AC5: missing audit-channels pull',
        );
      });

      it('documents the parallel-where-independent gather pattern', () => {
        assert.match(
          dwContent,
          /parallel where independent/i,
          'AC1: missing "parallel where independent" framing',
        );
      });

      it('C5 — mtime-snapshot contract-violation check on now/archive/<skill>/', () => {
        // The pre-snapshot.
        assert.match(
          dwContent,
          /Snapshot now\/archive mtimes|mtime.*snapshot|snapshot.*mtime/i,
          'C5: missing mtime-snapshot framing',
        );
        // The contract-violation language — surfaces in ## Notes when
        // a sub-skill writes during gather-only mode.
        assert.match(
          dwContent,
          /gather-only contract violation/i,
          'C5: missing "gather-only contract violation" detection language',
        );
        // Explicit reference to now/archive paths under inspection.
        assert.match(
          dwContent,
          /now\/archive\/slack-digest/,
          'C5: should snapshot now/archive/slack-digest/',
        );
        assert.match(
          dwContent,
          /now\/archive\/email-triage/,
          'C5: should snapshot now/archive/email-triage/',
        );
      });
    });

    describe('AC2 — three-rule reconciler (Step 2)', () => {
      it('Step 2 is the reconcile-before-staging step', () => {
        assert.match(
          dwContent,
          /### Step 2 — Reconcile/i,
          'AC2: Step 2 should be "Reconcile" (before staging)',
        );
      });

      it('Rule 1 — Intent → fulfilling action elsewhere', () => {
        assert.match(
          dwContent,
          /Rule 1.*Intent.*fulfilling action/i,
          'AC2: missing Rule 1 framing',
        );
      });

      it('Rule 2 — Intent → already-scheduled event', () => {
        assert.match(
          dwContent,
          /Rule 2.*Intent.*already-scheduled event/i,
          'AC2: missing Rule 2 framing',
        );
      });

      it('Rule 3 — Action moot, event passed (cheapest, runs first)', () => {
        assert.match(
          dwContent,
          /Rule 3.*Action moot.*event passed/i,
          'AC2: missing Rule 3 framing',
        );
      });

      it('conservative collapse — concrete evidence only (D1)', () => {
        assert.match(
          dwContent,
          /[Cc]onservative collapse/,
          'AC2: missing "conservative collapse" framing (D1)',
        );
        assert.match(
          dwContent,
          /concrete evidence/i,
          'AC2: missing "concrete evidence" requirement',
        );
      });

      it('fuzzy matches → Uncertain tier (never silently collapsed)', () => {
        assert.match(
          dwContent,
          /never silently collapsed/i,
          'AC2: missing "never silently collapsed" guard',
        );
      });

      it('Rule 2 matches regardless of organizer.self (anchor ai_004)', () => {
        assert.match(
          dwContent,
          /regardless of `?organizer\.self`?/i,
          'AC2: Rule 2 must match regardless of `organizer.self` (anchor ai_004)',
        );
      });

      it('Rule 2 recurring-1:1 guard (R6) drops to Uncertain', () => {
        assert.match(
          dwContent,
          /[Rr]ecurring.*event guard|[Rr]ecurring.*1:1|[Rr]ecurring events with.*generic titles/,
          'AC2: missing recurring-event guard (R6)',
        );
      });

      it('graceful degradation — name-string fallback → Uncertain regardless of topic confidence', () => {
        assert.match(
          dwContent,
          /[Gg]raceful degradation/,
          'AC2: missing graceful-degradation framing',
        );
        assert.match(
          dwContent,
          /name-string|name-match|name string/i,
          'AC2: missing name-string fallback language',
        );
        assert.match(
          dwContent,
          /slack_user_id/,
          'AC2: graceful degradation should reference slack_user_id population gap',
        );
      });
    });

    describe('AC4 — Rule 4 dedup against open commitments (Phase 8 followup-7)', () => {
      it('Rule 4 — Intent → already-tracked open commitment present in Step 2', () => {
        assert.match(
          dwContent,
          /Rule 4.*Intent.*already-tracked.*commitment/i,
          'followup-7 AC1: missing Rule 4 framing in Step 2 reconciler',
        );
      });

      it('Rule 4 cites 0.7 Jaccard threshold (stricter than reconcile()\'s 0.6)', () => {
        assert.match(
          dwContent,
          /0\.7\s+Jaccard|Jaccard.*0\.7/,
          'followup-7 AC1: Rule 4 must cite 0.7 Jaccard threshold literal',
        );
      });

      it('Rule 4 uses arete:commitments/<id> evidence pointer scheme', () => {
        assert.match(
          dwContent,
          /arete:commitments\//,
          'followup-7 AC3: missing arete:commitments/ evidence pointer scheme',
        );
      });

      it('Rule 4 direction guard present (prevents mirror-pair false-collapse)', () => {
        assert.match(
          dwContent,
          /[Dd]irection guard|direction.*match/i,
          'followup-7 AC1: missing direction guard for Rule 4',
        );
      });

      it('Step 2 contains five "#### Rule " sub-sections (was four before phase-10-followup-2 added Rule 5)', () => {
        const ruleHeaderMatches = dwContent.match(/#### Rule /g) ?? [];
        assert.equal(
          ruleHeaderMatches.length,
          5,
          `phase-10-followup-2: expected 5 #### Rule sub-sections (3, 4, 1, 2 + new Rule 5 chef-skip), got ${ruleHeaderMatches.length}`,
        );
      });

      it('rule order is 3 → 4 → 1 → 2 (cheap-first) per F7-D3', () => {
        // Order check: in the Step 2 prose, the rule names must appear
        // in the sequence Rule 3 → Rule 4 → Rule 1 → Rule 2 (cheap-first
        // per F7-D3). Tightened per followup-7 build review-1 — the
        // original /3.*4.*1.*2/s matched random digit sequences anywhere
        // in the file (passed even if Rule 4 were deleted from Step 2).
        assert.match(
          dwContent,
          /Rule 3.{0,400}Rule 4.{0,400}Rule 1.{0,400}Rule 2/s,
          'followup-7 AC1: rule order should be Rule 3 → Rule 4 → Rule 1 → Rule 2 in Step 2 prose',
        );
      });

      it('C1 — recurring-item guard for cadence false-positives (pre-mortem R3)', () => {
        assert.match(
          dwContent,
          /[Rr]ecurring-item guard|recurring meeting|source_meeting\.recurring/,
          'followup-7 C1: missing recurring-item guard (R3 mitigation)',
        );
        assert.match(
          dwContent,
          /5 days|< 5 days|less than 5 days/i,
          'followup-7 C1: recurring guard should reference 5-day age threshold',
        );
      });

      it('C2 — mirror-pair signature exclusion (parser-bug-suspect flag)', () => {
        assert.match(
          dwContent,
          /[Mm]irror-pair signature|mirror-pair.*signature|parser-bug.{0,20}suspect/,
          'followup-7 C2: missing mirror-pair signature exclusion language',
        );
        assert.match(
          dwContent,
          /0\.9|≥0\.9|opposite direction/i,
          'followup-7 C2: mirror-pair signature should reference ≥0.9 overlap + opposite directions',
        );
      });

      it('C3 — Rule 1 precedence over Rule 4 when same commitment is a fulfillment candidate', () => {
        assert.match(
          dwContent,
          /Rule 1.*precedence|prefer.*Rule 1/i,
          'followup-7 C3: missing Rule 1 precedence over Rule 4 cross-rule join',
        );
      });

      it('Rule 4 prose includes doc-pointer to commitments.ts:233-239', () => {
        assert.match(
          dwContent,
          /commitments\.ts:233-239|commitments\.ts.*233/,
          'followup-7 AC2: missing doc-pointer to commitments.ts:233-239 for shared Jaccard logic',
        );
      });

      it('Step 4 output template includes CT4 example for Rule 4 collapse', () => {
        assert.match(
          dwContent,
          /\[CT4\]/,
          'followup-7 AC3: missing CT4 example line in Closed today output template',
        );
      });
    });

    describe('AC3 — Closed today narrative section', () => {
      it('output template contains ## Closed today (proposed) section', () => {
        assert.match(
          dwContent,
          /## Closed today \(proposed\)/,
          'AC3: missing "## Closed today (proposed)" section in template',
        );
      });

      it('each proposed collapse traces evidence pointer (source → fulfillment)', () => {
        assert.match(
          dwContent,
          /Evidence:|evidence pointer|evidence_pointer/i,
          'AC3: missing evidence-pointer language in Closed today rendering',
        );
      });

      it('shows low-confidence Uncertain count separately (backfill-gap visibility)', () => {
        assert.match(
          dwContent,
          /kept in.*Uncertain|Uncertain.*count|low-confidence.*Uncertain/i,
          'AC3: missing Uncertain-count footer for backfill-gap visibility',
        );
      });
    });

    describe('AC4 — proposed-collapse engagement + re-run idempotency (revised post review-1)', () => {
      it('engagement framing is "Approve to commit" (proposed, not auto)', () => {
        assert.match(
          dwContent,
          /Approve to commit/i,
          'AC4: missing "Approve to commit" framing',
        );
      });

      it('CT<n> ID prefix for proposed collapses (user approves CT1, CT3)', () => {
        assert.match(
          dwContent,
          /CT1, CT3|`CT<n>`|CT\d/,
          'AC4: missing CT<n> proposed-collapse ID convention',
        );
      });

      it('re-run idempotency — skip proposals for commitments resolvedAt > today_start', () => {
        // Either "resolvedAt > today_start" or equivalent phrasing.
        assert.match(
          dwContent,
          /resolvedAt > today_start|already resolved earlier today|resolved earlier today/i,
          'AC4 / R7: missing re-run idempotency check (resolvedAt > today_start)',
        );
      });

      it('NO "auto-collapse" framing (review-1 C3 killed dual-behavior)', () => {
        // The phrase "auto-collapse" must NOT appear as an active design
        // choice. It's OK if the prose explicitly says "NEVER
        // auto-collapse" or "should NOT be auto-collapsed" (which we
        // want), but the active-voice "we auto-collapse staged-only
        // items" framing from the original plan must be gone.
        //
        // Phase 8-followup-1 (item 3) tightened this regex per the
        // build-review's C5 concern: the original matched bare "no" /
        // "not" within 120 chars of an "auto-collapse" occurrence,
        // which trivially passes for normal English prose. New rule:
        // require EXPLICIT negation/structural markers, not generic
        // English negation words.
        const re = /auto-collapse/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(dwContent)) !== null) {
          const idx = m.index;
          const window = dwContent.slice(
            Math.max(0, idx - 120),
            idx + 120,
          );
          // Explicit negation / structural markers ONLY:
          // - NEVER, MUST NOT, should NOT, did NOT
          // - "not auto-collapse" / "no auto-collapse" (directly framing the verb)
          // - killed, GONE, removed, dropped
          // - structural markers: "original plan", "review-1 C3"
          assert.match(
            window,
            /NEVER|MUST NOT|should NOT|did NOT|[Nn][Oo][Tt]? auto-collapse|killed|GONE|removed|dropped|original plan|review-1 [Cc]3/,
            `AC4 / C3: "${m[0]}" must appear only in EXPLICIT negation context (per followup-1 item 3); found window: "${window}"`,
          );
        }
      });
    });

    describe('AC5 — channel-backfill nudge in winddown', () => {
      it('audit-channels invocation present (already covered in AC1 but assert again here)', () => {
        assert.match(
          dwContent,
          /arete people audit-channels --json/,
          'AC5: missing audit-channels invocation',
        );
      });

      it('nudge condition < 0.5 slack coverage', () => {
        assert.match(
          dwContent,
          /< 0\.5|slack_coverage.*0\.5|less than half/i,
          'AC5: missing < 0.5 slack-coverage nudge condition',
        );
      });

      it('nudge framing references slack_user_id backfill', () => {
        assert.match(
          dwContent,
          /Backfill via Slack MCP|backfill.*slack_user_id|slack_user_id.*backfill/i,
          'AC5: missing slack_user_id backfill framing',
        );
      });

      it('nudge cap: once per winddown', () => {
        assert.match(
          dwContent,
          /[Cc]ap.*once per winddown|once per winddown/,
          'AC5: missing "once per winddown" cap',
        );
      });
    });

    describe('AC6 — D8 "always full" + AC10/AC11 framing', () => {
      it('D8 always-full framing — no light/full toggle', () => {
        assert.match(
          dwContent,
          /always full/i,
          'AC6 / D8: missing "always full" framing',
        );
      });

      it('AC10 ≤30m informal target referenced', () => {
        assert.match(
          dwContent,
          /AC10.*30|30 min.*median|≤30 min|<= ?30 min|<= ?30m|≤ ?30m/i,
          'AC6: missing AC10 ≤30m informal target',
        );
      });

      it('AC11 45m hard stop referenced', () => {
        assert.match(
          dwContent,
          /AC11.*45|45 min.*hard stop|> ?45 min.*revert|45m.*hard stop|> ?45m|45 min on any single/i,
          'AC6: missing AC11 >45m hard stop',
        );
      });
    });

    describe('phase-10-followup-2 — Rule 5 chef-skip prose', () => {
      it('Rule 5 — chef writes a STRUCTURAL skip subsection present', () => {
        assert.match(
          dwContent,
          /#### Rule 5 — Chef writes a STRUCTURAL skip/,
          'phase-10-followup-2: Rule 5 chef-skip section missing',
        );
      });

      it('mentions staged_item_skip_reason sibling field + setBy provenance union', () => {
        assert.match(
          dwContent,
          /staged_item_skip_reason/,
          'phase-10-followup-2: staged_item_skip_reason field not documented',
        );
        assert.match(
          dwContent,
          /['‘’]chef['‘’].*['‘’]chef-proposed['‘’].*['‘’]user['‘’]|setBy[\s\S]{0,400}chef-proposed/i,
          'phase-10-followup-2: setBy union not documented',
        );
      });

      it('first-week confirm gate (HP3/AC8) prose present', () => {
        assert.match(
          dwContent,
          /\[\[confirm-skip <id>\]\]|first 7 days post-ship|chef-proposed/,
          'phase-10-followup-2: week-1 gate prose missing',
        );
      });

      it('[[unskip <id>]] directive surfaced (with both id-alone and slug-qualified forms)', () => {
        assert.match(
          dwContent,
          /\[\[unskip <id>\]\]|\[\[unskip.*ai_/,
          'phase-10-followup-2: [[unskip]] directive prose missing',
        );
        assert.match(
          dwContent,
          /slug-qualified|<slug>:<id>/,
          'phase-10-followup-2: slug-qualified form not mentioned',
        );
      });

      it('M2 discriminator filter rule for chef-proposed subsection documented', () => {
        assert.match(
          dwContent,
          /setBy ===? ['‘’]chef-proposed['‘’]/,
          'phase-10-followup-2: M2 discriminator filter missing from SKILL.md',
        );
      });

      it('audit log location dev/diary/chef-skip-log.md mentioned', () => {
        assert.match(
          dwContent,
          /chef-skip-log\.md/,
          'phase-10-followup-2: audit log file location not surfaced',
        );
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 13 AC2 — process-meetings area-proposal prose (prose-pinned,
// soak-verified). Load-bearing rules: propose-not-auto-write,
// confirm-or-skip optional never blocking, set-area BEFORE approve.
// ---------------------------------------------------------------------------

describe('process-meetings area-proposal prose (Phase 13 AC2)', () => {
  const skillPath = join(SKILLS_DIR, 'process-meetings', 'SKILL.md');

  it('carries the propose-not-auto-write rule', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /process itself\s*\n?# NEVER writes the area; it only proposes/i);
    assert.match(prose, /Do NOT write the area yourself/);
  });

  it('carries the optional-never-blocking rule (phase-12 R6 shape)', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /Confirm-or-skip is OPTIONAL and\s*\n?NEVER blocking/);
    assert.match(prose, /stays area-less/);
  });

  it('orders set-area BEFORE approve so commitments inherit', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /set-area must run BEFORE approve/);
    const setAreaIdx = prose.indexOf('arete meeting set-area $slug.md');
    const approveIdx = prose.indexOf('arete meeting approve $slug');
    assert.ok(setAreaIdx > -1 && approveIdx > -1);
    assert.ok(setAreaIdx < approveIdx, 'set-area loop appears before the approve loop');
  });

  it('sources proposals from arete meeting process output', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /proposedArea/);
  });
});

// ---------------------------------------------------------------------------
// Phase 12 — /project skill prose (NOT a chef skill; separate envelope).
// Load-bearing rules: read-only open, no LLM in the data path, never
// auto-load a disambiguation tie.
// ---------------------------------------------------------------------------

describe('/project skill prose (Phase 12 AC3)', () => {
  const skillPath = join(SKILLS_DIR, 'project', 'SKILL.md');

  it('exists', () => {
    assert.ok(existsSync(skillPath), `missing ${skillPath}`);
  });

  it('carries the read-only rule (open never writes the README)', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /READ-ONLY/);
    assert.match(prose, /NEVER writes to the project README/i);
    assert.match(prose, /Never write to the project README on open/i);
  });

  it('carries the no-LLM-in-data-path note', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /No LLM in the data path/i);
  });

  it('carries the disambiguation rule (never auto-pick a tie)', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /Never auto-pick/i);
    assert.match(prose, /disambiguation/i);
  });

  it('routes through the CLI data path', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /arete project open/);
  });

  // -------------------------------------------------------------------------
  // Phase 13 AC6 — prose-pinned, soak-verified (string-presence assertions:
  // prose pins the rule, soak verifies the agent follows it).
  // -------------------------------------------------------------------------

  it('AC6: carries the always-show rule for siblings + wiki sections', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(
      prose,
      /ALWAYS show the Sibling-projects and Related-wiki-pages sections when they are present in the CLI output/,
    );
    assert.match(prose, /never drop them as "secondary"/);
    assert.match(prose, /No siblings \/ no wiki pages matched/);
  });

  it('AC6: trigger vocabulary covers load/review/look-at phrasings (punch #13)', () => {
    const prose = readFileSync(skillPath, 'utf8');
    for (const trigger of [
      'load project',
      'load the project',
      'load up',
      'review project',
      'look at project',
      'look at the project',
    ]) {
      assert.ok(prose.includes(`- ${trigger}`), `missing trigger: ${trigger}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 14 — /update-project skill prose (AC1; NOT a chef skill — it
// instantiates the propose-edits-back-to-source-doc pattern). These are
// string-presence assertions: prose pins the rules, the AC2 verb tests +
// AC4 regression wall enforce write-safety in CI, the MC3 soak verifies
// live behavior (honest verification split, stated in-skill).
// ---------------------------------------------------------------------------

describe('/update-project skill prose (Phase 14 AC1)', () => {
  const skillPath = join(SKILLS_DIR, 'update-project', 'SKILL.md');

  it('exists', () => {
    assert.ok(existsSync(skillPath), `missing ${skillPath}`);
  });

  it('propose-not-auto-write rule: everything proposed, nothing applied without approval', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /Never auto-writes/i);
    assert.match(prose, /Everything is proposed; nothing is auto-applied/i);
    assert.match(prose, /Never write without an approved item/i);
  });

  it('reject-leaves-untouched rule (byte-identical README)', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /Rejecting everything leaves the README byte-identical/);
    assert.match(prose, /No "while I was in there"/);
  });

  it('carries the typed proposal menu (all six v1 types incl. commitment claim per OQ3)', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /\*\*Status update\*\*/);
    assert.match(prose, /\*\*Decision \/ learning to log\*\*/);
    assert.match(prose, /\*\*New open question\*\*/);
    assert.match(prose, /\*\*Meeting link\*\*/);
    assert.match(prose, /\*\*Topics-cache refresh\*\*/);
    assert.match(prose, /\*\*Commitment claim\*\*/);
    assert.match(prose, /arete commitments claim <id> --project <slug>/);
  });

  it('references the daily-winddown proposed surface shape', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /## Proposed updates/);
    assert.match(prose, /winddown/i);
  });

  it('carries the June-fixation worked example verbatim', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /June-fixation/);
    assert.match(prose, /propose the goal-date correction; touch nothing else/);
    assert.match(prose, /EOY-2026/);
  });

  it('R1: topics persistence ONLY via the change-gated verb after approval', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /ONLY through `arete project refresh-topics <slug> --apply`/);
    assert.match(prose, /Never hand-edit `topics:`\/`topics_refreshed:`/);
  });

  it('references the propose-edits-back-to-source-doc pattern (AC6/MC4)', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /propose-edits-back-to-source-doc/);
    assert.match(prose, /PATTERNS\.md/);
  });

  it('pre-mortem D2: backfill-provenance hint on machine-inferred source areas', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /area_set_by: backfill/);
    assert.match(prose, /verify this meeting actually belongs/i);
  });

  it('pre-mortem D3: empty-scan message cites the mtime date + day-granularity caveat', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /Nothing new since the README was last touched/);
    assert.match(prose, /day granularity/i);
  });

  it('conversational entry resolves the meeting FIRST, then the same pipeline (decision 5)', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /resolve the meeting first/i);
    assert.match(prose, /One flow, two entry points; no parallel logic/);
  });

  it('disambiguation: never auto-load a tie (reuses /project rules)', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /never auto-load a tie/i);
  });

  it('states the honest verification split (CI enforces verbs; prose+soak cover the skill path)', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /## Verification honesty/);
    assert.match(prose, /LLM-mediated/);
    assert.match(prose, /not CI-proven/);
  });

  it('has a Rollback section', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /## Rollback/);
    assert.match(prose, /git revert/);
  });

  it('/project SKILL.md now points at the live flow (no "future phase" left)', () => {
    const projectProse = readFileSync(join(SKILLS_DIR, 'project', 'SKILL.md'), 'utf8');
    assert.match(projectProse, /update-project\/SKILL\.md/);
    assert.doesNotMatch(projectProse, /future phase/);
  });
});

// ---------------------------------------------------------------------------
// Phase 14 AC5 (stretch) — finalize-project closed-project retro prose.
// Mechanism per phase-14 pre-mortem D5: items/-mediated (OQ1), surfacing
// through briefs + area memory; `arete memory refresh` is the regen verb
// (topic refresh does not consume memory items).
// ---------------------------------------------------------------------------

describe('finalize-project retro prose (Phase 14 AC5)', () => {
  const skillPath = join(SKILLS_DIR, 'finalize-project', 'SKILL.md');

  it('carries the retro step with the exact entry format', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /Closed-Project Retro/);
    assert.match(prose, /## Closed project: Visioning Deck/);
    assert.match(prose, /- \*\*Date\*\*: 2026-06-10/);
    assert.match(prose, /- \*\*Topics\*\*: glance-2-mvp, vision-deck/);
    assert.match(prose, /- \*\*Project\*\*: visioning-deck/);
    assert.match(prose, /MUST include the project's area slug/);
  });

  it('carries the idempotency-scan rule (rerunning finalize never duplicates)', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /scan before write/i);
    assert.match(prose, /never duplicate the retro/i);
  });

  it('runs arete memory refresh (NOT topic refresh) and states why (pre-mortem D5)', () => {
    const prose = readFileSync(skillPath, 'utf8');
    assert.match(prose, /arete memory refresh/);
    assert.match(prose, /`arete topic refresh` does NOT integrate memory items/);
  });
});
