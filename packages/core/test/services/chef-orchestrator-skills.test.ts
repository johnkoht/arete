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

      it('pulls backward calendar window (today + yesterday workaround)', () => {
        // The plan accepts the per-day --date workaround since --days -1
        // is not supported. Just check we reference some backward pull.
        assert.match(
          dwContent,
          /arete pull calendar --date/,
          'AC1: missing backward calendar pull (per-day --date workaround)',
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
  });
});
