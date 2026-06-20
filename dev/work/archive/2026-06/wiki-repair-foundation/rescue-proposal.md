# Wiki rescue proposal — W4 (wiki-repair-foundation)

Generated: 2026-06-09 · analyzer: scripts/rescue-analysis.ts (worktree wiki-rescue-analysis) · NO LLM calls — fully mechanical + reproducible

Snapshot: 212 pages frozen at `last_refreshed: 2026-04-24` as of 2026-06-09 (plan said 222; the in-flight `topic refresh --all` John started has already rescued the difference — pages still frozen after that catch-up are precisely the ones with NO exact-slug pending sources or not yet reached).

## Executive summary

| Band | Count | Action |
|---|---|---|
| refresh-with-aliases (HIGH) | 3 | bulk-accept → add-aliases + refresh |
| refresh, plain (1 exact pending source) | 2 | bulk-accept → topic refresh (no aliases) |
| merge-into-canonical | 15 | hand-review (11 are absorptions implied by the refresh band's alias claims) |
| archive (HIGH) | 139 | bulk-accept → mv to _archive/ |
| archive (MEDIUM) | 38 | skim — same mv, weaker evidence |
| ambiguous | 14 | hand-review |
| self-rescued mid-analysis | 1 | none — in-flight catch-up refresh got there first (email-template-playbook) |
| **total** | **212** | |

- **Cost estimate**: 30 implied re-integrations × ~1.5¢ ≈ **$0.45** (seed averaged ~1.5¢/integration).
- **Dangling-wikilink delta if all archives+merges applied**: **+177** new dangling links from surviving pages (baseline 149; index.md links excluded — index is regenerated post-apply). Detail at the bottom.

### The headline finding (read this first)

The plan's premise was "knowledge WOULD flow if aliases existed". Mechanically, that is true for only a **handful of broad canonical pages** — because the catch-up `topic refresh --all` (running during this analysis) already routed the post-seed knowledge into the *narrower sub-slug pages*, which are now live. For ~85% of the frozen pages there is **no tag route at all**: their exact slug never recurred in any post-seed source's `topics:` frontmatter, and every token-related tag either belongs to a live page (aliasing it = paid double-integration) or doesn't exist. **Refresh cannot un-stale a page with zero pending sources** (`refresh` is a no-op that does not touch `last_refreshed`), so for the dead majority the ONLY mechanical escape from the 6/24 stale-lint avalanche is the D2 archive move.

### Worked example — `email-templates` (canonical, frozen) vs `default-email-template`
- `email-templates`: verdict **refresh-with-aliases (HIGH)** — 22 pending sources via aliases [pop-email-templates, email-templates-priority, pop-email-templates-go-live, email-template-analytics, email-template-standardization, uk-email-templates, email-template-rollout]; live in-links 2.
- Proposed aliases (frozen/orphan tags it absorbs): `pop-email-templates`, `email-templates-priority`, `pop-email-templates-go-live`, `email-template-analytics`, `email-template-standardization`, `uk-email-templates`, `email-template-rollout` → 22 pending sources, e.g. 2026-02-23-email-template-chat, 2026-02-27-lindsay-john-1on1, 2026-03-02-biweekly-comms-working-group, 2026-03-03-john-jamie (+18 more).
- **The plan's specific suggestion — alias `default-email-template` — is now the duplication route**: `default-email-template` was rescued by the in-flight catch-up TODAY (last_refreshed 2026-06-09) and already carries the weekly-meeting flow (29 sources reachable only via live-page tags: `default-email-template`, `email-template-playbook`). Adding those aliases re-integrates the same sources into `email-templates` at ~1.5¢ each — allowed by design (sources are multi-topic), but it is spend, and the knowledge already lives in the narrower live pages. Analysis verdict: take the 7 frozen-tag aliases (bulk band), and decide by hand whether the broad canonical should ALSO absorb the live `default-email-template` flow (+29 × 1.5¢ ≈ 0.43 USD) or whether `default-email-template` keeps carrying it.

## Bulk-accept — refresh-with-aliases (HIGH)

Aliases listed are tags owned by FROZEN sub-pages (absorbed — see merge band) or orphan tags. Live-page-owned tags are NOT auto-claimed (duplication spend — see hand-review).

| Page | Pending sources | Aliases to add | Evidence |
|---|---|---|---|
| `email-templates` | 22 | `pop-email-templates` `email-templates-priority` `pop-email-templates-go-live` `email-template-analytics` `email-template-standardization` `uk-email-templates` `email-template-rollout` | 2026-02-23-email-template-chat, 2026-02-27-lindsay-john-1on1, 2026-03-02-biweekly-comms-working-group (+19 more) |
| `onboarding` | 4 | `onboarding-week-1` `cover-whale-onboarding` `liberty-mutual-onboarding` `mark-onboarding` | 2026-02-27-lindsay-john-1on1, 2026-03-05-john-jamie, 2026-03-19-cover-whale-email-templaes-sync (+1 more) |
| `snapsheet-migration` | 2 | `pop-snapsheet-to-glance-migration` | 2026-04-14-claude-code-for-reserv-product, 2026-05-20-slack-digest |

## Bulk-accept — plain refresh (1 exact pending source, no aliases needed)

The in-flight `topic refresh --all` may already cover these (it was processing alphabetically during analysis) — re-check `last_refreshed` before running.

| Page | Evidence |
|---|---|
| `large-loss-report` | 1 pending source via exact slug (plain refresh; in-flight catch-up should cover): 2026-06-02-claim-review-doc-walkthrough-doug-austin-ashley-john.md |
| `pop-snapsheet-to-glance-migration` | 1 pending source via exact slug (plain refresh; in-flight catch-up should cover): 2026-05-20-slack-digest.md — NOTE: slug also claimed as alias by [[snapsheet-migration]]; accepting both double-integrates shared sources into two pages (pick one, or accept the duplication) |

## Bulk-accept — archive (HIGH)

| Page | Evidence |
|---|---|
| `60-day-review` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-04-22-john-lindsay-11) |
| `acknowledgment-letter-automation` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 1 (seed: 2026-03-13-john-jamie-looker-and-comms-sync-ad-hoc) |
| `actions-notifications-workflows-terminology` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-22-glance-mvp-weekly) |
| `adjuster-interviews` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-22-john-koht-lindsay-gray) |
| `adjuster-notifications` | 0 rescuable sources, 1 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-22-john-lindsay-11) |
| `adjuster-personas` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-15-john-lindsay-11) |
| `adjuster-ux-vision` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-18-john-lindsay-11) |
| `ai-glance-user-stories` | 0 rescuable sources, 1 live in-links (3 total), seed=1, soft signals 1 (seed: 2026-03-11-john-lindsay-11) |
| `amazon-alignment-tool-delay` | 0 rescuable sources, 1 live in-links (2 total), seed=1, soft signals 1 (seed: 2026-04-15-pop-adjuster-shadow-sam-searcy) |
| `amazon-dsp-user-journey` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-02-27-lindsay-john-1on1) |
| `amazon-marsh-policy-integration` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-03-04-john-lindsay-11) |
| `associated-contacts-ui` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-04-01-john-jamie-duplicate-ph-bug) |
| `attachment-auto-attach` | 0 rescuable sources, 1 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-03-inbound-email-sync) |
| `attachment-sync` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 1 (seed: 2026-03-23-glance-emails-prod-access) |
| `audit-history-paper-trail` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-04-08-glance-mvp-weekly) |
| `automated-receipt-acknowledgment` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 2 (seed: 2026-04-15-pop-adjuster-shadow-angela-smith) |
| `belongings-vs-property-claims` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-16-pop-20-check-in) |
| `california-qualified-manager` | 0 rescuable sources, 1 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-04-21-anthony-john-weekly) |
| `certified-mail-compliance` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-30-escalations-email-comms-sync) |
| `claim-party-id-association` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-04-01-john-jamie-duplicate-ph-bug) |
| `claim-sorted-competitive-threat` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-04-14-claude-code-for-reserv-product) |
| `claim-transfer-workflow` | 0 rescuable sources, 1 live in-links (2 total), seed=1, soft signals 1 (seed: 2026-04-15-pop-adjuster-shadow-sam-searcy) |
| `claims-product-advisory-panel` | 0 rescuable sources, 1 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-03-03-john-jamie) |
| `claude-code-adoption` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 2 (seed: 2026-03-25-john-lindsay-11) |
| `claude-code-rollout` | 0 rescuable sources, 0 live in-links (8 total), seed=2, soft signals 1 (seed: 2026-04-01-claude-code-for-reserv-product (+1 more)) |
| `claude-damage-estimation` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-16-pop-20-check-in) |
| `claude-enterprise-limits` | 0 rescuable sources, 0 live in-links (0 total), seed=1, soft signals 0 (seed: 2026-03-18-john-lindsay-11) |
| `comms-domain-ownership` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-02-27-lindsay-john-1on1) |
| `comms-stakeholder-forum` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-06-tim-john-email-related-features) |
| `communications-tab` | 0 rescuable sources, 1 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-22-john-lindsay-11) |
| `community-member-portal` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 1 (seed: 2026-03-17-pop-glance-emails) |
| `community-portal-accessibility` | 0 rescuable sources, 1 live in-links (3 total), seed=1, soft signals 1 (seed: 2026-04-15-pop-adjuster-shadow-angela-smith) |
| `compliance-admin-panel` | 0 rescuable sources, 1 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-13-kim-john-compliance-letters-emails) |
| `cx-stakeholder-inclusion` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-22-glance-mvp-weekly) |
| `data-quality-view` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-04-14-claude-code-for-reserv-product) |
| `dc-whiteboarding-workshop` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-15-john-lindsay-11) |
| `declination-letters` | 0 rescuable sources, 1 live in-links (4 total), seed=2, soft signals 0 (seed: 2026-03-26-cover-whale-email-templaes-sync (+1 more)) |
| `design-sprint-pop` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-04-15-john-lindsay-11) |
| `dev-tools-repo` | 0 rescuable sources, 0 live in-links (1 total), seed=1, soft signals 0 (seed: 2026-04-01-john-jamie-duplicate-ph-bug) |
| `diary-dropdown-labels` | 0 rescuable sources, 1 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-04-20-pop-adjuster-shadow-sam-knight) |
| `dns-cutover-strategy` | 0 rescuable sources, 1 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-03-inbound-email-sync) |
| `document-center-redesign` | 0 rescuable sources, 1 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-04-22-claim-portal-comms) |
| `document-tagging` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-03-19-cover-whale-email-templaes-sync) |
| `double-bracket-bug` | 0 rescuable sources, 1 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-03-23-glance-emails-prod-overview) |
| `duplicate-policyholder-bug` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-04-01-john-jamie-duplicate-ph-bug) |
| `email-automation-reminders` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-17-pop-glance-emails) |
| `email-cutover-timing` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-30-inbound-email-spam-detection-sync) |
| `email-deliverability` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-06-tim-john-email-related-features) |
| `email-deliverability-looker-report` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-06-tim-john-email-related-features) |
| `email-delivery-status` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 1 (seed: 2026-03-23-glance-emails-prod-access) |
| `email-spam-fix` | 0 rescuable sources, 0 live in-links (0 total), seed=1, soft signals 0 (seed: 2026-03-18-john-lindsay-11) |
| `embedded-help` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-02-24-connect-glance-user-guides) |
| `engineering-team-structure` | 0 rescuable sources, 0 live in-links (1 total), seed=1, soft signals 0 (seed: 2026-04-03-john-lindsay-11) |
| `escalations-tracking` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-30-escalations-email-comms-sync) |
| `feedback-collection` | 0 rescuable sources, 0 live in-links (4 total), seed=2, soft signals 0 (seed: 2026-03-05-john-jamie (+1 more)) |
| `file-note-structured-fields` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-04-08-glance-mvp-weekly) |
| `fillable-forms-digitization` | 0 rescuable sources, 1 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-13-kim-john-compliance-letters-emails) |
| `fraud-identification-gap` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-16-pop-20-check-in) |
| `funds-diversion-risk` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-03-30-inbound-email-spam-detection-sync) |
| `glance-adoption` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-08-pop-snapsheet-functionality-review) |
| `glance-eoy-segmentation` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-02-27-lindsay-john-1on1) |
| `glance-user-guides` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 1 (seed: 2026-02-24-connect-glance-user-guides) |
| `guide-rollout` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-02-24-connect-glance-user-guides) |
| `haiku-opus-architecture` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-15-john-lindsay-11) |
| `health-check-tool` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-03-13-john-jamie-looker-and-comms-sync-ad-hoc) |
| `inbound-triage-inbox` | 0 rescuable sources, 1 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-03-inbound-email-sync) |
| `iso-integration` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-22-glance-mvp-weekly) |
| `khyber-evaluation` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-09-smartcomms-demo) |
| `kyber-vendor-risk` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 1 (seed: 2026-04-08-glance-mvp-weekly) |
| `letter-vendor-evaluation` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 2 (seed: 2026-04-09-smartcomms-demo) |
| `letters-vendor-kyber` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 2 (seed: 2026-03-03-john-jamie) |
| `liability-determination` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-08-pop-snapsheet-functionality-review) |
| `liquid-template-rendering` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-06-sendgrid-email-handling) |
| `lob-mail-delivery` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-09-smartcomms-demo) |
| `lovable-prototyping` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-15-john-lindsay-11) |
| `meeting-consolidation` | 0 rescuable sources, 1 live in-links (1 total), seed=1, soft signals 0 (seed: 2026-04-21-anthony-john-weekly) |
| `ml-roadmap` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-05-john-jamie) |
| `multi-agent-prototype-sprint` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 1 (seed: 2026-04-14-claude-code-for-reserv-product) |
| `multi-agent-strategy` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 1 (seed: 2026-04-22-john-koht-lindsay-gray) |
| `notion-docs` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-02-24-connect-glance-user-guides) |
| `notion-meeting-notes` | 0 rescuable sources, 1 live in-links (1 total), seed=1, soft signals 0 (seed: 2026-04-21-claim-portal-comms) |
| `notion-organization` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-02-26-john-jamie-11) |
| `notion-restructure` | 0 rescuable sources, 1 live in-links (3 total), seed=2, soft signals 0 (seed: 2026-03-25-john-lindsay-11 (+1 more)) |
| `ops-template-process` | 0 rescuable sources, 1 live in-links (1 total), seed=1, soft signals 0 (seed: 2026-03-11-john-lindsay-11) |
| `pantheon-plugin-integration` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-04-08-claude-code-for-reserv-product) |
| `para-directory-structure` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-01-claude-code-for-reserv-product) |
| `personal-diary-replacement` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-22-glance-mvp-weekly) |
| `pilot-testing` | 0 rescuable sources, 0 live in-links (0 total), seed=2, soft signals 0 (seed: 2026-03-31-quick-email-testing-sync (+1 more)) |
| `playwright-mcp-testing` | 0 rescuable sources, 1 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-03-23-glance-emails-prod-overview) |
| `pm-engineering-workflow` | 0 rescuable sources, 1 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-11-john-lindsay-11) |
| `pm-skills-library` | 0 rescuable sources, 0 live in-links (5 total), seed=2, soft signals 1 (seed: 2026-04-01-claude-code-for-reserv-product (+1 more)) |
| `pop-2-0-redesign` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-16-pop-20-check-in) |
| `pop-adjuster-assignment` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 1 (seed: 2026-04-22-glance-mvp-weekly) |
| `pop-adjuster-workflow` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 1 (seed: 2026-04-08-pop-snapsheet-functionality-review) |
| `pop-auto-scope` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-22-john-koht-lindsay-gray) |
| `pop-eu-launch` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-08-glance-mvp-weekly) |
| `pop-release` | 0 rescuable sources, 1 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-12-lindsday-john) |
| `portal-user-sync` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-02-24-email-templates-deep-dive) |
| `prd-skill` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-08-claude-code-for-reserv-product) |
| `product-management-tools` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-02-26-john-jamie-11) |
| `production-ready-column` | 0 rescuable sources, 0 live in-links (0 total), seed=1, soft signals 0 (seed: 2026-04-14-anthony-john-weekly) |
| `project-management-workflow` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-02-26-john-jamie-11) |
| `qmd-semantic-search` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-01-claude-code-for-reserv-product) |
| `recipient-status-indicators` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-03-17-jamie-burk-glance-email-sync) |
| `release-notes-comms` | 0 rescuable sources, 1 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-23-glance-emails-prod-overview) |
| `runyan-board-strategy` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-22-john-koht-lindsay-gray) |
| `sendgrid-block-list` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-06-tim-john-email-related-features) |
| `sendgrid-configuration` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-06-sendgrid-email-handling) |
| `sendgrid-delivery-status` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 1 (seed: 2026-03-17-jamie-burk-glance-email-sync) |
| `series-c-strategy-shift` | 0 rescuable sources, 1 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-04-03-john-lindsay-11) |
| `shared-context-library` | 0 rescuable sources, 0 live in-links (8 total), seed=2, soft signals 0 (seed: 2026-04-01-claude-code-for-reserv-product (+1 more)) |
| `smartcomms-integration` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-09-smartcomms-demo) |
| `smartcoms-integration` | 0 rescuable sources, 1 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-26-cover-whale-email-templaes-sync) |
| `sms-gap` | 0 rescuable sources, 1 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-03-john-jamie) |
| `snapsheet-automation` | 0 rescuable sources, 0 live in-links (4 total), seed=2, soft signals 0 (seed: 2026-03-17-pop-glance-emails (+1 more)) |
| `snapsheet-file-note-sync` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 1 (seed: 2026-03-23-glance-emails-prod-access) |
| `snapsheet-parity` | 0 rescuable sources, 1 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-03-18-john-lindsay-11) |
| `snapsheet-task-replacement` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-08-glance-mvp-weekly) |
| `spam-score-ui` | 0 rescuable sources, 0 live in-links (2 total), seed=1, soft signals 0 (seed: 2026-03-30-inbound-email-spam-detection-sync) |
| `structured-payment-addresses` | 0 rescuable sources, 1 live in-links (4 total), seed=2, soft signals 0 (seed: 2026-04-21-claim-portal-comms (+1 more)) |
| `task-management` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-08-pop-snapsheet-functionality-review) |
| `template-conditional-logic` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-04-09-smartcomms-demo) |
| `template-customization-workarounds` | 0 rescuable sources, 0 live in-links (1 total), seed=1, soft signals 1 (seed: 2026-04-15-pop-adjuster-shadow-angela-smith) |
| `template-field-reordering` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-11-email-feature-review-with-jamie) |
| `template-hotkey-workarounds` | 0 rescuable sources, 0 live in-links (1 total), seed=1, soft signals 1 (seed: 2026-04-20-pop-adjuster-shadow-sam-knight) |
| `template-slug-rename` | 0 rescuable sources, 0 live in-links (1 total), seed=1, soft signals 0 (seed: 2026-04-07-anthony-john-weekly) |
| `template-submission-form` | 0 rescuable sources, 0 live in-links (1 total), seed=2, soft signals 0 (seed: 2026-03-11-coverwhale-template-list-review (+1 more)) |
| `testing-strategy-skill` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 1 (seed: 2026-04-08-claude-code-for-reserv-product) |
| `three-layer-memory-system` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-04-08-claude-code-for-reserv-product) |
| `three-phase-discovery-plan` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-22-glance-mvp-weekly) |
| `tiered-claims-routing` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-16-pop-20-check-in) |
| `toast-notifications` | 0 rescuable sources, 0 live in-links (4 total), seed=1, soft signals 0 (seed: 2026-03-17-jamie-burk-glance-email-sync) |
| `tricera-templates` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-30-escalations-email-comms-sync) |
| `uk-mail-delivery` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-04-09-smartcomms-demo) |
| `user-story-mapping` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 1 (seed: 2026-04-22-john-koht-lindsay-gray) |
| `vercel-deploy-checks` | 0 rescuable sources, 1 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-04-22-claim-portal-comms) |
| `workflow-automation` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-03-04-john-lindsay-11) |
| `workflow-tool-integration` | 0 rescuable sources, 0 live in-links (3 total), seed=1, soft signals 0 (seed: 2026-03-17-pop-glance-emails) |
| `workflows-engine` | 0 rescuable sources, 0 live in-links (5 total), seed=1, soft signals 0 (seed: 2026-03-13-john-jamie-looker-and-comms-sync-ad-hoc) |

## Skim — archive (MEDIUM)

Same `mv`, weaker evidence (multi-source seed or weak/title-only signals that CANNOT flow mechanically — alias rescue matches source `topics:` frontmatter only; a title mention without a tag has no rescue path short of editing source frontmatter).

| Page | Evidence |
|---|---|
| `ai-claim-narrative` | 0 rescuable sources, seed=1, live in-links 0, soft signals 5 (0 live-dup / 5 weak / 0 title-only) |
| `ai-claims-automation` | 0 rescuable sources, seed=1, live in-links 0, soft signals 4 (0 live-dup / 4 weak / 0 title-only) |
| `ai-tooling` | 0 rescuable sources, seed=8, live in-links 3, soft signals 1 (0 live-dup / 0 weak / 1 title-only) |
| `attorney-rep-logic` | 0 rescuable sources, seed=4, live in-links 1, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `automated-acknowledgment-emails` | 0 rescuable sources, seed=2, live in-links 2, soft signals 1 (0 live-dup / 1 weak / 0 title-only) |
| `claim-narrative-action-plan` | 0 rescuable sources, seed=1, live in-links 0, soft signals 3 (0 live-dup / 3 weak / 0 title-only) |
| `claim-narrative-cost` | 0 rescuable sources, seed=1, live in-links 0, soft signals 4 (0 live-dup / 4 weak / 0 title-only) |
| `claim-narrative-disruption` | 0 rescuable sources, seed=1, live in-links 0, soft signals 4 (0 live-dup / 4 weak / 0 title-only) |
| `claim-narrative-feature-flag` | 0 rescuable sources, seed=1, live in-links 0, soft signals 3 (0 live-dup / 3 weak / 0 title-only) |
| `cx-adjuster-boundaries` | 0 rescuable sources, seed=2, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `cx-communications` | 0 rescuable sources, seed=1, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `default-recipients` | 0 rescuable sources, seed=4, live in-links 0, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `echeck-payment-rejection` | 0 rescuable sources, seed=1, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `email-open-tracking` | 0 rescuable sources, seed=3, live in-links 1, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `email-rollout-kpis` | 0 rescuable sources, seed=2, live in-links 0, soft signals 4 (0 live-dup / 4 weak / 0 title-only) |
| `email-rollout-phasing` | 0 rescuable sources, seed=1, live in-links 0, soft signals 5 (0 live-dup / 5 weak / 0 title-only) |
| `engineer-autonomy` | 0 rescuable sources, seed=1, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `exposure-type-family` | 0 rescuable sources, seed=1, live in-links 0, soft signals 6 (0 live-dup / 6 weak / 0 title-only) |
| `exposure-type-filtering` | 0 rescuable sources, seed=6, live in-links 1, soft signals 1 (0 live-dup / 1 weak / 0 title-only) |
| `glance-staging-access` | 0 rescuable sources, seed=4, live in-links 0, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `import-playbook` | 0 rescuable sources, seed=2, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `intake-interface-prototype` | 0 rescuable sources, seed=1, live in-links 3, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `letter-system-roadmap` | 0 rescuable sources, seed=1, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `marsh-legal-review` | 0 rescuable sources, seed=1, live in-links 3, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `pm-testing-skill` | 0 rescuable sources, seed=1, live in-links 0, soft signals 3 (0 live-dup / 3 weak / 0 title-only) |
| `policy-endorsement` | 0 rescuable sources, seed=1, live in-links 3, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `pop-rollout` | 0 rescuable sources, seed=3, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `quill-editor-formatting` | 0 rescuable sources, seed=7, live in-links 0, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `rich-text-editor` | 0 rescuable sources, seed=1, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `sendgrid-spam-filtering` | 0 rescuable sources, seed=3, live in-links 3, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `snapsheet-license-sync` | 0 rescuable sources, seed=1, live in-links 2, soft signals 1 (0 live-dup / 1 weak / 0 title-only) |
| `state-licensing-compliance` | 0 rescuable sources, seed=1, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `stripe-checkout-prefill` | 0 rescuable sources, seed=1, live in-links 3, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `template-admin-page` | 0 rescuable sources, seed=3, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `template-cleanup` | 0 rescuable sources, seed=9, live in-links 1, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `template-filtering` | 0 rescuable sources, seed=1, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |
| `template-variable-mapping` | 0 rescuable sources, seed=15, live in-links 3, soft signals 1 (0 live-dup / 1 weak / 0 title-only) |
| `voyager-policy-seeding` | 0 rescuable sources, seed=1, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only) |

## Hand-review — merge-into-canonical

### Absorptions implied by the refresh band (accepting the refresh band implies these)

The refresh band claims these pages' slugs as aliases on the canonical; their future flow re-routes there. The page file is then archived (its seed synthesis is preserved in `_archive/`).

| Absorbed page | Into | Own evidence |
|---|---|---|
| `cover-whale-onboarding` | `onboarding` | absorbed by [[onboarding]] (alias claim); own flow 0; live in-links 0 (4 total); seed=1 |
| `email-template-analytics` | `email-templates` | absorbed by [[email-templates]] (alias claim); own flow 0; live in-links 0 (6 total); seed=3 |
| `email-template-rollout` | `email-templates` | absorbed by [[email-templates]] (alias claim); own flow 0; live in-links 0 (5 total); seed=1 |
| `email-template-standardization` | `email-templates` | absorbed by [[email-templates]] (alias claim); own flow 0; live in-links 1 (4 total); seed=1 |
| `email-templates-priority` | `email-templates` | absorbed by [[email-templates]] (alias claim); own flow 0; live in-links 0 (4 total); seed=1 |
| `liberty-mutual-onboarding` | `onboarding` | absorbed by [[onboarding]] (alias claim); own flow 0; live in-links 0 (1 total); seed=1 |
| `mark-onboarding` | `onboarding` | absorbed by [[onboarding]] (alias claim); own flow 0; live in-links 1 (3 total); seed=1 |
| `onboarding-week-1` | `onboarding` | absorbed by [[onboarding]] (alias claim); own flow 0; live in-links 0 (1 total); seed=1 |
| `pop-email-templates` | `email-templates` | absorbed by [[email-templates]] (alias claim); own flow 1; live in-links 3 (24 total); seed=15 |
| `pop-email-templates-go-live` | `email-templates` | absorbed by [[email-templates]] (alias claim); own flow 0; live in-links 0 (5 total); seed=1 |
| `uk-email-templates` | `email-templates` | absorbed by [[email-templates]] (alias claim); own flow 0; live in-links 1 (3 total); seed=1 |

### Merges into a LIVE partner page (per-pair decision)

### `claim-transfer-tdd` → merge into `tdd`
- Evidence: this page is the narrower sub-slug of live [[tdd]]; own flow 0; live-successor pending 0; live in-links 1
- Related pages: `tdd` (live) — this-is-sub-slug
- Apply: `arete topic add-aliases tdd claim-transfer-tdd` then archive `claim-transfer-tdd` (mv + ledger).

### `email-rollout-strategy` → merge into `rollout-strategy`
- Evidence: this page is the narrower sub-slug of live [[rollout-strategy]]; own flow 0; live-successor pending 0; live in-links 0
- Related pages: `rollout-strategy` (live) — this-is-sub-slug
- Apply: `arete topic add-aliases rollout-strategy email-rollout-strategy` then archive `email-rollout-strategy` (mv + ledger).

### `fraud-language` → merge into `doi-fraud-language`
- Evidence: this page is BROADER; live [[doi-fraud-language]] is the active sub-topic carrying the flow; own flow 0; live-successor pending 20; live in-links 3
- Related pages: `doi-fraud-language` (live) — this-is-canonical
- Apply: `arete topic add-aliases doi-fraud-language fraud-language` then archive `fraud-language` (mv + ledger).

### `tdd-first-process` → merge into `tdd`
- Evidence: this page is the narrower sub-slug of live [[tdd]]; own flow 0; live-successor pending 0; live in-links 1
- Related pages: `tdd` (live) — this-is-sub-slug
- Apply: `arete topic add-aliases tdd tdd-first-process` then archive `tdd-first-process` (mv + ledger).

## Hand-review — ambiguous

### `audit-history`
- Evidence: flow=1, live-dup=0, weak=0, title-only=0, live in-links 0 (5 total), seed=1
- Pending flow sources: 2026-04-08-glance-mvp-weekly (via aliases `audit-history-paper-trail`)
- Near-miss pages: `audit-history-paper-trail` (this-is-canonical, frozen, j=0.5)
- Proposed action: refresh with aliases — 1-source, low yield, your call

### `contact-prohibited`
- Evidence: flow=0, live-dup=0, weak=0, title-only=0, live in-links 4 (8 total), seed=4
- Linked from live pages: [[adjuster-shadowing]], [[copilot-rollout]], [[cover-whale-templates]], [[signature-logic]]
- Proposed action: rich dormant hub (seed=4, 8 in-links) — the tag vocabulary moved past it but the synthesis is dense. Options: keep frozen (accept one stale-lint nag per winddown after 6/24) or archive (+8 potential dangling links)

### `email-bounce-handling`
- Evidence: flow=0, live-dup=0, weak=12, title-only=0, live in-links 0 (6 total), seed=2
- Weak-overlap sources (j 0.4–0.6 — advisory): 12
- Near-miss pages: `inbound-email-handling` (near-miss, frozen, j=0.5)
- Proposed action: lean archive

### `email-composer-rollout`
- Evidence: flow=0, live-dup=0, weak=22, title-only=0, live in-links 1 (5 total), seed=3
- Weak-overlap sources (j 0.4–0.6 — advisory): 22
- Near-miss pages: `email-rollout-kpis` (near-miss, frozen, j=0.5); `email-rollout-phasing` (near-miss, frozen, j=0.5); `email-rollout-strategy` (near-miss, frozen, j=0.5); `email-template-rollout` (near-miss, frozen, j=0.5)
- Linked from live pages: [[adjuster-shadowing]]
- Proposed action: lean archive

### `email-send-failure-handling`
- Evidence: flow=0, live-dup=0, weak=13, title-only=0, live in-links 0 (4 total), seed=1
- Weak-overlap sources (j 0.4–0.6 — advisory): 13
- Proposed action: lean archive

### `glance-2-discovery`
- Evidence: flow=0, live-dup=0, weak=50, title-only=0, live in-links 0 (6 total), seed=1
- Weak-overlap sources (j 0.4–0.6 — advisory): 50
- Near-miss pages: `glance-2-mvp` (near-miss, live, j=0.5); `glance-2-vision` (near-miss, frozen, j=0.5)
- Proposed action: lean archive

### `glance-2-research-plan`
- Evidence: flow=0, live-dup=0, weak=50, title-only=0, live in-links 0 (5 total), seed=1
- Weak-overlap sources (j 0.4–0.6 — advisory): 50
- Proposed action: lean archive

### `glance-2-vision`
- Evidence: flow=0, live-dup=0, weak=49, title-only=0, live in-links 1 (10 total), seed=2
- Weak-overlap sources (j 0.4–0.6 — advisory): 49
- Near-miss pages: `glance-2-discovery` (near-miss, frozen, j=0.5); `glance-2-mvp` (near-miss, live, j=0.5)
- Linked from live pages: [[signature-logic]]
- Proposed action: rich dormant hub (seed=2, 10 in-links) — the tag vocabulary moved past it but the synthesis is dense. Options: keep frozen (accept one stale-lint nag per winddown after 6/24) or archive (+10 potential dangling links)

### `glance-email-composer`
- Evidence: flow=0, live-dup=0, weak=2, title-only=0, live in-links 7 (47 total), seed=21
- Weak-overlap sources (j 0.4–0.6 — advisory): 2
- Near-miss pages: `email-composer-rollout` (near-miss, frozen, j=0.5)
- Linked from live pages: [[claim-clear]], [[claim-portal-comms]], [[copilot-rollout]], [[cover-whale-templates]], [[dsp-email-tool]], [[rollout-strategy]], [[snapsheet-import-script]]
- Proposed action: rich dormant hub (seed=21, 47 in-links) — the tag vocabulary moved past it but the synthesis is dense. Options: keep frozen (accept one stale-lint nag per winddown after 6/24) or archive (+47 potential dangling links)

### `glance-mvp-scope`
- Evidence: flow=0, live-dup=0, weak=47, title-only=0, live in-links 1 (9 total), seed=2
- Weak-overlap sources (j 0.4–0.6 — advisory): 47
- Near-miss pages: `glance-2-mvp` (near-miss, live, j=0.5)
- Linked from live pages: [[leap-rollout]]
- Proposed action: rich dormant hub (seed=2, 9 in-links) — the tag vocabulary moved past it but the synthesis is dense. Options: keep frozen (accept one stale-lint nag per winddown after 6/24) or archive (+9 potential dangling links)

### `inbound-email-handling`
- Evidence: flow=0, live-dup=0, weak=2, title-only=0, live in-links 8 (35 total), seed=12
- Weak-overlap sources (j 0.4–0.6 — advisory): 2
- Near-miss pages: `email-bounce-handling` (near-miss, frozen, j=0.5)
- Linked from live pages: [[action-mailbox-rails]], [[copilot-rollout]], [[cover-whale-templates]], [[email-template-playbook]], [[leap-rollout]], [[rollout-strategy]], [[signature-logic]], [[snapsheet-import-script]]
- Proposed action: rich dormant hub (seed=12, 35 in-links) — the tag vocabulary moved past it but the synthesis is dense. Options: keep frozen (accept one stale-lint nag per winddown after 6/24) or archive (+35 potential dangling links)

### `looker-reports`
- Evidence: flow=1, live-dup=0, weak=0, title-only=0, live in-links 2 (12 total), seed=5
- Pending flow sources: 2026-04-06-tim-john-email-related-features (via aliases `email-deliverability-looker-report`)
- Near-miss pages: `email-deliverability-looker-report` (this-is-canonical, frozen, j=0.5)
- Linked from live pages: [[copilot-rollout]], [[leap-rollout]]
- Proposed action: refresh with aliases — 1-source, low yield, your call

### `template-attachments`
- Evidence: flow=0, live-dup=0, weak=0, title-only=0, live in-links 4 (11 total), seed=6
- Linked from live pages: [[copilot-rollout]], [[email-template-playbook]], [[leap-rollout]], [[signature-logic]]
- Proposed action: rich dormant hub (seed=6, 11 in-links) — the tag vocabulary moved past it but the synthesis is dense. Options: keep frozen (accept one stale-lint nag per winddown after 6/24) or archive (+11 potential dangling links)

### `variable-mapping-skill`
- Evidence: flow=0, live-dup=0, weak=15, title-only=0, live in-links 2 (3 total), seed=1
- Weak-overlap sources (j 0.4–0.6 — advisory): 15
- Near-miss pages: `template-variable-mapping` (near-miss, frozen, j=0.5)
- Linked from live pages: [[adjuster-shadowing]], [[note-templates-standardization]]
- Proposed action: keep frozen or archive — referenced by live pages, archiving adds dangling links

## Apply commands per band

All commands run from the workspace root (`/Users/john/code/arete-reserv`). D2 = archive by `mv` to `.arete/memory/topics/_archive/` (create dir first; auto-invisible to discovery/active/lint; reversible).

### 1. refresh-with-aliases (bulk band)
```bash
arete topic add-aliases email-templates pop-email-templates email-templates-priority pop-email-templates-go-live email-template-analytics email-template-standardization uk-email-templates email-template-rollout --refresh
arete topic add-aliases onboarding onboarding-week-1 cover-whale-onboarding liberty-mutual-onboarding mark-onboarding --refresh
arete topic add-aliases snapsheet-migration pop-snapsheet-to-glance-migration --refresh
arete topic refresh large-loss-report
arete topic refresh pop-snapsheet-to-glance-migration
```

### 2a. absorptions implied by band 1 (archive the absorbed pages — alias already added above)
```bash
mkdir -p .arete/memory/topics/_archive
mv .arete/memory/topics/cover-whale-onboarding.md .arete/memory/topics/_archive/cover-whale-onboarding.md && echo "cover-whale-onboarding.md -> _archive/cover-whale-onboarding.md (merged into onboarding; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-template-analytics.md .arete/memory/topics/_archive/email-template-analytics.md && echo "email-template-analytics.md -> _archive/email-template-analytics.md (merged into email-templates; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-template-rollout.md .arete/memory/topics/_archive/email-template-rollout.md && echo "email-template-rollout.md -> _archive/email-template-rollout.md (merged into email-templates; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-template-standardization.md .arete/memory/topics/_archive/email-template-standardization.md && echo "email-template-standardization.md -> _archive/email-template-standardization.md (merged into email-templates; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-templates-priority.md .arete/memory/topics/_archive/email-templates-priority.md && echo "email-templates-priority.md -> _archive/email-templates-priority.md (merged into email-templates; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/liberty-mutual-onboarding.md .arete/memory/topics/_archive/liberty-mutual-onboarding.md && echo "liberty-mutual-onboarding.md -> _archive/liberty-mutual-onboarding.md (merged into onboarding; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/mark-onboarding.md .arete/memory/topics/_archive/mark-onboarding.md && echo "mark-onboarding.md -> _archive/mark-onboarding.md (merged into onboarding; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/onboarding-week-1.md .arete/memory/topics/_archive/onboarding-week-1.md && echo "onboarding-week-1.md -> _archive/onboarding-week-1.md (merged into onboarding; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pop-email-templates.md .arete/memory/topics/_archive/pop-email-templates.md && echo "pop-email-templates.md -> _archive/pop-email-templates.md (merged into email-templates; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pop-email-templates-go-live.md .arete/memory/topics/_archive/pop-email-templates-go-live.md && echo "pop-email-templates-go-live.md -> _archive/pop-email-templates-go-live.md (merged into email-templates; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/uk-email-templates.md .arete/memory/topics/_archive/uk-email-templates.md && echo "uk-email-templates.md -> _archive/uk-email-templates.md (merged into email-templates; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
```

### 2b. merges into live partners (after hand-review approval, per pair)
```bash
arete topic add-aliases tdd claim-transfer-tdd --refresh && \
  mv .arete/memory/topics/claim-transfer-tdd.md .arete/memory/topics/_archive/claim-transfer-tdd.md && \
  echo "claim-transfer-tdd.md -> _archive/claim-transfer-tdd.md (merged into tdd; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
arete topic add-aliases rollout-strategy email-rollout-strategy --refresh && \
  mv .arete/memory/topics/email-rollout-strategy.md .arete/memory/topics/_archive/email-rollout-strategy.md && \
  echo "email-rollout-strategy.md -> _archive/email-rollout-strategy.md (merged into rollout-strategy; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
arete topic add-aliases doi-fraud-language fraud-language --refresh && \
  mv .arete/memory/topics/fraud-language.md .arete/memory/topics/_archive/fraud-language.md && \
  echo "fraud-language.md -> _archive/fraud-language.md (merged into doi-fraud-language; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
arete topic add-aliases tdd tdd-first-process --refresh && \
  mv .arete/memory/topics/tdd-first-process.md .arete/memory/topics/_archive/tdd-first-process.md && \
  echo "tdd-first-process.md -> _archive/tdd-first-process.md (merged into tdd; alias added) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
```

### 3. archive (HIGH bulk + accepted MEDIUM)
```bash
mkdir -p .arete/memory/topics/_archive
mv .arete/memory/topics/60-day-review.md .arete/memory/topics/_archive/60-day-review.md && echo "60-day-review.md -> _archive/60-day-review.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/acknowledgment-letter-automation.md .arete/memory/topics/_archive/acknowledgment-letter-automation.md && echo "acknowledgment-letter-automation.md -> _archive/acknowledgment-letter-automation.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/actions-notifications-workflows-terminology.md .arete/memory/topics/_archive/actions-notifications-workflows-terminology.md && echo "actions-notifications-workflows-terminology.md -> _archive/actions-notifications-workflows-terminology.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/adjuster-interviews.md .arete/memory/topics/_archive/adjuster-interviews.md && echo "adjuster-interviews.md -> _archive/adjuster-interviews.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/adjuster-notifications.md .arete/memory/topics/_archive/adjuster-notifications.md && echo "adjuster-notifications.md -> _archive/adjuster-notifications.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/adjuster-personas.md .arete/memory/topics/_archive/adjuster-personas.md && echo "adjuster-personas.md -> _archive/adjuster-personas.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/adjuster-ux-vision.md .arete/memory/topics/_archive/adjuster-ux-vision.md && echo "adjuster-ux-vision.md -> _archive/adjuster-ux-vision.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/ai-glance-user-stories.md .arete/memory/topics/_archive/ai-glance-user-stories.md && echo "ai-glance-user-stories.md -> _archive/ai-glance-user-stories.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/amazon-alignment-tool-delay.md .arete/memory/topics/_archive/amazon-alignment-tool-delay.md && echo "amazon-alignment-tool-delay.md -> _archive/amazon-alignment-tool-delay.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/amazon-dsp-user-journey.md .arete/memory/topics/_archive/amazon-dsp-user-journey.md && echo "amazon-dsp-user-journey.md -> _archive/amazon-dsp-user-journey.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/amazon-marsh-policy-integration.md .arete/memory/topics/_archive/amazon-marsh-policy-integration.md && echo "amazon-marsh-policy-integration.md -> _archive/amazon-marsh-policy-integration.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/associated-contacts-ui.md .arete/memory/topics/_archive/associated-contacts-ui.md && echo "associated-contacts-ui.md -> _archive/associated-contacts-ui.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/attachment-auto-attach.md .arete/memory/topics/_archive/attachment-auto-attach.md && echo "attachment-auto-attach.md -> _archive/attachment-auto-attach.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/attachment-sync.md .arete/memory/topics/_archive/attachment-sync.md && echo "attachment-sync.md -> _archive/attachment-sync.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/audit-history-paper-trail.md .arete/memory/topics/_archive/audit-history-paper-trail.md && echo "audit-history-paper-trail.md -> _archive/audit-history-paper-trail.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/automated-receipt-acknowledgment.md .arete/memory/topics/_archive/automated-receipt-acknowledgment.md && echo "automated-receipt-acknowledgment.md -> _archive/automated-receipt-acknowledgment.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/belongings-vs-property-claims.md .arete/memory/topics/_archive/belongings-vs-property-claims.md && echo "belongings-vs-property-claims.md -> _archive/belongings-vs-property-claims.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/california-qualified-manager.md .arete/memory/topics/_archive/california-qualified-manager.md && echo "california-qualified-manager.md -> _archive/california-qualified-manager.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/certified-mail-compliance.md .arete/memory/topics/_archive/certified-mail-compliance.md && echo "certified-mail-compliance.md -> _archive/certified-mail-compliance.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/claim-party-id-association.md .arete/memory/topics/_archive/claim-party-id-association.md && echo "claim-party-id-association.md -> _archive/claim-party-id-association.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/claim-sorted-competitive-threat.md .arete/memory/topics/_archive/claim-sorted-competitive-threat.md && echo "claim-sorted-competitive-threat.md -> _archive/claim-sorted-competitive-threat.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/claim-transfer-workflow.md .arete/memory/topics/_archive/claim-transfer-workflow.md && echo "claim-transfer-workflow.md -> _archive/claim-transfer-workflow.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/claims-product-advisory-panel.md .arete/memory/topics/_archive/claims-product-advisory-panel.md && echo "claims-product-advisory-panel.md -> _archive/claims-product-advisory-panel.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/claude-code-adoption.md .arete/memory/topics/_archive/claude-code-adoption.md && echo "claude-code-adoption.md -> _archive/claude-code-adoption.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/claude-code-rollout.md .arete/memory/topics/_archive/claude-code-rollout.md && echo "claude-code-rollout.md -> _archive/claude-code-rollout.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/claude-damage-estimation.md .arete/memory/topics/_archive/claude-damage-estimation.md && echo "claude-damage-estimation.md -> _archive/claude-damage-estimation.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/claude-enterprise-limits.md .arete/memory/topics/_archive/claude-enterprise-limits.md && echo "claude-enterprise-limits.md -> _archive/claude-enterprise-limits.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/comms-domain-ownership.md .arete/memory/topics/_archive/comms-domain-ownership.md && echo "comms-domain-ownership.md -> _archive/comms-domain-ownership.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/comms-stakeholder-forum.md .arete/memory/topics/_archive/comms-stakeholder-forum.md && echo "comms-stakeholder-forum.md -> _archive/comms-stakeholder-forum.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/communications-tab.md .arete/memory/topics/_archive/communications-tab.md && echo "communications-tab.md -> _archive/communications-tab.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/community-member-portal.md .arete/memory/topics/_archive/community-member-portal.md && echo "community-member-portal.md -> _archive/community-member-portal.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/community-portal-accessibility.md .arete/memory/topics/_archive/community-portal-accessibility.md && echo "community-portal-accessibility.md -> _archive/community-portal-accessibility.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/compliance-admin-panel.md .arete/memory/topics/_archive/compliance-admin-panel.md && echo "compliance-admin-panel.md -> _archive/compliance-admin-panel.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/cx-stakeholder-inclusion.md .arete/memory/topics/_archive/cx-stakeholder-inclusion.md && echo "cx-stakeholder-inclusion.md -> _archive/cx-stakeholder-inclusion.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/data-quality-view.md .arete/memory/topics/_archive/data-quality-view.md && echo "data-quality-view.md -> _archive/data-quality-view.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/dc-whiteboarding-workshop.md .arete/memory/topics/_archive/dc-whiteboarding-workshop.md && echo "dc-whiteboarding-workshop.md -> _archive/dc-whiteboarding-workshop.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/declination-letters.md .arete/memory/topics/_archive/declination-letters.md && echo "declination-letters.md -> _archive/declination-letters.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/design-sprint-pop.md .arete/memory/topics/_archive/design-sprint-pop.md && echo "design-sprint-pop.md -> _archive/design-sprint-pop.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/dev-tools-repo.md .arete/memory/topics/_archive/dev-tools-repo.md && echo "dev-tools-repo.md -> _archive/dev-tools-repo.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/diary-dropdown-labels.md .arete/memory/topics/_archive/diary-dropdown-labels.md && echo "diary-dropdown-labels.md -> _archive/diary-dropdown-labels.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/dns-cutover-strategy.md .arete/memory/topics/_archive/dns-cutover-strategy.md && echo "dns-cutover-strategy.md -> _archive/dns-cutover-strategy.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/document-center-redesign.md .arete/memory/topics/_archive/document-center-redesign.md && echo "document-center-redesign.md -> _archive/document-center-redesign.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/document-tagging.md .arete/memory/topics/_archive/document-tagging.md && echo "document-tagging.md -> _archive/document-tagging.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/double-bracket-bug.md .arete/memory/topics/_archive/double-bracket-bug.md && echo "double-bracket-bug.md -> _archive/double-bracket-bug.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/duplicate-policyholder-bug.md .arete/memory/topics/_archive/duplicate-policyholder-bug.md && echo "duplicate-policyholder-bug.md -> _archive/duplicate-policyholder-bug.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-automation-reminders.md .arete/memory/topics/_archive/email-automation-reminders.md && echo "email-automation-reminders.md -> _archive/email-automation-reminders.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-cutover-timing.md .arete/memory/topics/_archive/email-cutover-timing.md && echo "email-cutover-timing.md -> _archive/email-cutover-timing.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-deliverability.md .arete/memory/topics/_archive/email-deliverability.md && echo "email-deliverability.md -> _archive/email-deliverability.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-deliverability-looker-report.md .arete/memory/topics/_archive/email-deliverability-looker-report.md && echo "email-deliverability-looker-report.md -> _archive/email-deliverability-looker-report.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-delivery-status.md .arete/memory/topics/_archive/email-delivery-status.md && echo "email-delivery-status.md -> _archive/email-delivery-status.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-spam-fix.md .arete/memory/topics/_archive/email-spam-fix.md && echo "email-spam-fix.md -> _archive/email-spam-fix.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/embedded-help.md .arete/memory/topics/_archive/embedded-help.md && echo "embedded-help.md -> _archive/embedded-help.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/engineering-team-structure.md .arete/memory/topics/_archive/engineering-team-structure.md && echo "engineering-team-structure.md -> _archive/engineering-team-structure.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/escalations-tracking.md .arete/memory/topics/_archive/escalations-tracking.md && echo "escalations-tracking.md -> _archive/escalations-tracking.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/feedback-collection.md .arete/memory/topics/_archive/feedback-collection.md && echo "feedback-collection.md -> _archive/feedback-collection.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/file-note-structured-fields.md .arete/memory/topics/_archive/file-note-structured-fields.md && echo "file-note-structured-fields.md -> _archive/file-note-structured-fields.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/fillable-forms-digitization.md .arete/memory/topics/_archive/fillable-forms-digitization.md && echo "fillable-forms-digitization.md -> _archive/fillable-forms-digitization.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/fraud-identification-gap.md .arete/memory/topics/_archive/fraud-identification-gap.md && echo "fraud-identification-gap.md -> _archive/fraud-identification-gap.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/funds-diversion-risk.md .arete/memory/topics/_archive/funds-diversion-risk.md && echo "funds-diversion-risk.md -> _archive/funds-diversion-risk.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/glance-adoption.md .arete/memory/topics/_archive/glance-adoption.md && echo "glance-adoption.md -> _archive/glance-adoption.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/glance-eoy-segmentation.md .arete/memory/topics/_archive/glance-eoy-segmentation.md && echo "glance-eoy-segmentation.md -> _archive/glance-eoy-segmentation.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/glance-user-guides.md .arete/memory/topics/_archive/glance-user-guides.md && echo "glance-user-guides.md -> _archive/glance-user-guides.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/guide-rollout.md .arete/memory/topics/_archive/guide-rollout.md && echo "guide-rollout.md -> _archive/guide-rollout.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/haiku-opus-architecture.md .arete/memory/topics/_archive/haiku-opus-architecture.md && echo "haiku-opus-architecture.md -> _archive/haiku-opus-architecture.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/health-check-tool.md .arete/memory/topics/_archive/health-check-tool.md && echo "health-check-tool.md -> _archive/health-check-tool.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/inbound-triage-inbox.md .arete/memory/topics/_archive/inbound-triage-inbox.md && echo "inbound-triage-inbox.md -> _archive/inbound-triage-inbox.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/iso-integration.md .arete/memory/topics/_archive/iso-integration.md && echo "iso-integration.md -> _archive/iso-integration.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/khyber-evaluation.md .arete/memory/topics/_archive/khyber-evaluation.md && echo "khyber-evaluation.md -> _archive/khyber-evaluation.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/kyber-vendor-risk.md .arete/memory/topics/_archive/kyber-vendor-risk.md && echo "kyber-vendor-risk.md -> _archive/kyber-vendor-risk.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/letter-vendor-evaluation.md .arete/memory/topics/_archive/letter-vendor-evaluation.md && echo "letter-vendor-evaluation.md -> _archive/letter-vendor-evaluation.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/letters-vendor-kyber.md .arete/memory/topics/_archive/letters-vendor-kyber.md && echo "letters-vendor-kyber.md -> _archive/letters-vendor-kyber.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/liability-determination.md .arete/memory/topics/_archive/liability-determination.md && echo "liability-determination.md -> _archive/liability-determination.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/liquid-template-rendering.md .arete/memory/topics/_archive/liquid-template-rendering.md && echo "liquid-template-rendering.md -> _archive/liquid-template-rendering.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/lob-mail-delivery.md .arete/memory/topics/_archive/lob-mail-delivery.md && echo "lob-mail-delivery.md -> _archive/lob-mail-delivery.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/lovable-prototyping.md .arete/memory/topics/_archive/lovable-prototyping.md && echo "lovable-prototyping.md -> _archive/lovable-prototyping.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/meeting-consolidation.md .arete/memory/topics/_archive/meeting-consolidation.md && echo "meeting-consolidation.md -> _archive/meeting-consolidation.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/ml-roadmap.md .arete/memory/topics/_archive/ml-roadmap.md && echo "ml-roadmap.md -> _archive/ml-roadmap.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/multi-agent-prototype-sprint.md .arete/memory/topics/_archive/multi-agent-prototype-sprint.md && echo "multi-agent-prototype-sprint.md -> _archive/multi-agent-prototype-sprint.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/multi-agent-strategy.md .arete/memory/topics/_archive/multi-agent-strategy.md && echo "multi-agent-strategy.md -> _archive/multi-agent-strategy.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/notion-docs.md .arete/memory/topics/_archive/notion-docs.md && echo "notion-docs.md -> _archive/notion-docs.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/notion-meeting-notes.md .arete/memory/topics/_archive/notion-meeting-notes.md && echo "notion-meeting-notes.md -> _archive/notion-meeting-notes.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/notion-organization.md .arete/memory/topics/_archive/notion-organization.md && echo "notion-organization.md -> _archive/notion-organization.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/notion-restructure.md .arete/memory/topics/_archive/notion-restructure.md && echo "notion-restructure.md -> _archive/notion-restructure.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/ops-template-process.md .arete/memory/topics/_archive/ops-template-process.md && echo "ops-template-process.md -> _archive/ops-template-process.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pantheon-plugin-integration.md .arete/memory/topics/_archive/pantheon-plugin-integration.md && echo "pantheon-plugin-integration.md -> _archive/pantheon-plugin-integration.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/para-directory-structure.md .arete/memory/topics/_archive/para-directory-structure.md && echo "para-directory-structure.md -> _archive/para-directory-structure.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/personal-diary-replacement.md .arete/memory/topics/_archive/personal-diary-replacement.md && echo "personal-diary-replacement.md -> _archive/personal-diary-replacement.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pilot-testing.md .arete/memory/topics/_archive/pilot-testing.md && echo "pilot-testing.md -> _archive/pilot-testing.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/playwright-mcp-testing.md .arete/memory/topics/_archive/playwright-mcp-testing.md && echo "playwright-mcp-testing.md -> _archive/playwright-mcp-testing.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pm-engineering-workflow.md .arete/memory/topics/_archive/pm-engineering-workflow.md && echo "pm-engineering-workflow.md -> _archive/pm-engineering-workflow.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pm-skills-library.md .arete/memory/topics/_archive/pm-skills-library.md && echo "pm-skills-library.md -> _archive/pm-skills-library.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pop-2-0-redesign.md .arete/memory/topics/_archive/pop-2-0-redesign.md && echo "pop-2-0-redesign.md -> _archive/pop-2-0-redesign.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pop-adjuster-assignment.md .arete/memory/topics/_archive/pop-adjuster-assignment.md && echo "pop-adjuster-assignment.md -> _archive/pop-adjuster-assignment.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pop-adjuster-workflow.md .arete/memory/topics/_archive/pop-adjuster-workflow.md && echo "pop-adjuster-workflow.md -> _archive/pop-adjuster-workflow.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pop-auto-scope.md .arete/memory/topics/_archive/pop-auto-scope.md && echo "pop-auto-scope.md -> _archive/pop-auto-scope.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pop-eu-launch.md .arete/memory/topics/_archive/pop-eu-launch.md && echo "pop-eu-launch.md -> _archive/pop-eu-launch.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pop-release.md .arete/memory/topics/_archive/pop-release.md && echo "pop-release.md -> _archive/pop-release.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/portal-user-sync.md .arete/memory/topics/_archive/portal-user-sync.md && echo "portal-user-sync.md -> _archive/portal-user-sync.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/prd-skill.md .arete/memory/topics/_archive/prd-skill.md && echo "prd-skill.md -> _archive/prd-skill.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/product-management-tools.md .arete/memory/topics/_archive/product-management-tools.md && echo "product-management-tools.md -> _archive/product-management-tools.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/production-ready-column.md .arete/memory/topics/_archive/production-ready-column.md && echo "production-ready-column.md -> _archive/production-ready-column.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/project-management-workflow.md .arete/memory/topics/_archive/project-management-workflow.md && echo "project-management-workflow.md -> _archive/project-management-workflow.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/qmd-semantic-search.md .arete/memory/topics/_archive/qmd-semantic-search.md && echo "qmd-semantic-search.md -> _archive/qmd-semantic-search.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/recipient-status-indicators.md .arete/memory/topics/_archive/recipient-status-indicators.md && echo "recipient-status-indicators.md -> _archive/recipient-status-indicators.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/release-notes-comms.md .arete/memory/topics/_archive/release-notes-comms.md && echo "release-notes-comms.md -> _archive/release-notes-comms.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/runyan-board-strategy.md .arete/memory/topics/_archive/runyan-board-strategy.md && echo "runyan-board-strategy.md -> _archive/runyan-board-strategy.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/sendgrid-block-list.md .arete/memory/topics/_archive/sendgrid-block-list.md && echo "sendgrid-block-list.md -> _archive/sendgrid-block-list.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/sendgrid-configuration.md .arete/memory/topics/_archive/sendgrid-configuration.md && echo "sendgrid-configuration.md -> _archive/sendgrid-configuration.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/sendgrid-delivery-status.md .arete/memory/topics/_archive/sendgrid-delivery-status.md && echo "sendgrid-delivery-status.md -> _archive/sendgrid-delivery-status.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/series-c-strategy-shift.md .arete/memory/topics/_archive/series-c-strategy-shift.md && echo "series-c-strategy-shift.md -> _archive/series-c-strategy-shift.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/shared-context-library.md .arete/memory/topics/_archive/shared-context-library.md && echo "shared-context-library.md -> _archive/shared-context-library.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/smartcomms-integration.md .arete/memory/topics/_archive/smartcomms-integration.md && echo "smartcomms-integration.md -> _archive/smartcomms-integration.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/smartcoms-integration.md .arete/memory/topics/_archive/smartcoms-integration.md && echo "smartcoms-integration.md -> _archive/smartcoms-integration.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/sms-gap.md .arete/memory/topics/_archive/sms-gap.md && echo "sms-gap.md -> _archive/sms-gap.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/snapsheet-automation.md .arete/memory/topics/_archive/snapsheet-automation.md && echo "snapsheet-automation.md -> _archive/snapsheet-automation.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/snapsheet-file-note-sync.md .arete/memory/topics/_archive/snapsheet-file-note-sync.md && echo "snapsheet-file-note-sync.md -> _archive/snapsheet-file-note-sync.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/snapsheet-parity.md .arete/memory/topics/_archive/snapsheet-parity.md && echo "snapsheet-parity.md -> _archive/snapsheet-parity.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/snapsheet-task-replacement.md .arete/memory/topics/_archive/snapsheet-task-replacement.md && echo "snapsheet-task-replacement.md -> _archive/snapsheet-task-replacement.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/spam-score-ui.md .arete/memory/topics/_archive/spam-score-ui.md && echo "spam-score-ui.md -> _archive/spam-score-ui.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/structured-payment-addresses.md .arete/memory/topics/_archive/structured-payment-addresses.md && echo "structured-payment-addresses.md -> _archive/structured-payment-addresses.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/task-management.md .arete/memory/topics/_archive/task-management.md && echo "task-management.md -> _archive/task-management.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/template-conditional-logic.md .arete/memory/topics/_archive/template-conditional-logic.md && echo "template-conditional-logic.md -> _archive/template-conditional-logic.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/template-customization-workarounds.md .arete/memory/topics/_archive/template-customization-workarounds.md && echo "template-customization-workarounds.md -> _archive/template-customization-workarounds.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/template-field-reordering.md .arete/memory/topics/_archive/template-field-reordering.md && echo "template-field-reordering.md -> _archive/template-field-reordering.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/template-hotkey-workarounds.md .arete/memory/topics/_archive/template-hotkey-workarounds.md && echo "template-hotkey-workarounds.md -> _archive/template-hotkey-workarounds.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/template-slug-rename.md .arete/memory/topics/_archive/template-slug-rename.md && echo "template-slug-rename.md -> _archive/template-slug-rename.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/template-submission-form.md .arete/memory/topics/_archive/template-submission-form.md && echo "template-submission-form.md -> _archive/template-submission-form.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/testing-strategy-skill.md .arete/memory/topics/_archive/testing-strategy-skill.md && echo "testing-strategy-skill.md -> _archive/testing-strategy-skill.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/three-layer-memory-system.md .arete/memory/topics/_archive/three-layer-memory-system.md && echo "three-layer-memory-system.md -> _archive/three-layer-memory-system.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/three-phase-discovery-plan.md .arete/memory/topics/_archive/three-phase-discovery-plan.md && echo "three-phase-discovery-plan.md -> _archive/three-phase-discovery-plan.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/tiered-claims-routing.md .arete/memory/topics/_archive/tiered-claims-routing.md && echo "tiered-claims-routing.md -> _archive/tiered-claims-routing.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/toast-notifications.md .arete/memory/topics/_archive/toast-notifications.md && echo "toast-notifications.md -> _archive/toast-notifications.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/tricera-templates.md .arete/memory/topics/_archive/tricera-templates.md && echo "tricera-templates.md -> _archive/tricera-templates.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/uk-mail-delivery.md .arete/memory/topics/_archive/uk-mail-delivery.md && echo "uk-mail-delivery.md -> _archive/uk-mail-delivery.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/user-story-mapping.md .arete/memory/topics/_archive/user-story-mapping.md && echo "user-story-mapping.md -> _archive/user-story-mapping.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/vercel-deploy-checks.md .arete/memory/topics/_archive/vercel-deploy-checks.md && echo "vercel-deploy-checks.md -> _archive/vercel-deploy-checks.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/workflow-automation.md .arete/memory/topics/_archive/workflow-automation.md && echo "workflow-automation.md -> _archive/workflow-automation.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/workflow-tool-integration.md .arete/memory/topics/_archive/workflow-tool-integration.md && echo "workflow-tool-integration.md -> _archive/workflow-tool-integration.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/workflows-engine.md .arete/memory/topics/_archive/workflows-engine.md && echo "workflows-engine.md -> _archive/workflows-engine.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/ai-claim-narrative.md .arete/memory/topics/_archive/ai-claim-narrative.md && echo "ai-claim-narrative.md -> _archive/ai-claim-narrative.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/ai-claims-automation.md .arete/memory/topics/_archive/ai-claims-automation.md && echo "ai-claims-automation.md -> _archive/ai-claims-automation.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/ai-tooling.md .arete/memory/topics/_archive/ai-tooling.md && echo "ai-tooling.md -> _archive/ai-tooling.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/attorney-rep-logic.md .arete/memory/topics/_archive/attorney-rep-logic.md && echo "attorney-rep-logic.md -> _archive/attorney-rep-logic.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/automated-acknowledgment-emails.md .arete/memory/topics/_archive/automated-acknowledgment-emails.md && echo "automated-acknowledgment-emails.md -> _archive/automated-acknowledgment-emails.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/claim-narrative-action-plan.md .arete/memory/topics/_archive/claim-narrative-action-plan.md && echo "claim-narrative-action-plan.md -> _archive/claim-narrative-action-plan.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/claim-narrative-cost.md .arete/memory/topics/_archive/claim-narrative-cost.md && echo "claim-narrative-cost.md -> _archive/claim-narrative-cost.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/claim-narrative-disruption.md .arete/memory/topics/_archive/claim-narrative-disruption.md && echo "claim-narrative-disruption.md -> _archive/claim-narrative-disruption.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/claim-narrative-feature-flag.md .arete/memory/topics/_archive/claim-narrative-feature-flag.md && echo "claim-narrative-feature-flag.md -> _archive/claim-narrative-feature-flag.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/cx-adjuster-boundaries.md .arete/memory/topics/_archive/cx-adjuster-boundaries.md && echo "cx-adjuster-boundaries.md -> _archive/cx-adjuster-boundaries.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/cx-communications.md .arete/memory/topics/_archive/cx-communications.md && echo "cx-communications.md -> _archive/cx-communications.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/default-recipients.md .arete/memory/topics/_archive/default-recipients.md && echo "default-recipients.md -> _archive/default-recipients.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/echeck-payment-rejection.md .arete/memory/topics/_archive/echeck-payment-rejection.md && echo "echeck-payment-rejection.md -> _archive/echeck-payment-rejection.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-open-tracking.md .arete/memory/topics/_archive/email-open-tracking.md && echo "email-open-tracking.md -> _archive/email-open-tracking.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-rollout-kpis.md .arete/memory/topics/_archive/email-rollout-kpis.md && echo "email-rollout-kpis.md -> _archive/email-rollout-kpis.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/email-rollout-phasing.md .arete/memory/topics/_archive/email-rollout-phasing.md && echo "email-rollout-phasing.md -> _archive/email-rollout-phasing.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/engineer-autonomy.md .arete/memory/topics/_archive/engineer-autonomy.md && echo "engineer-autonomy.md -> _archive/engineer-autonomy.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/exposure-type-family.md .arete/memory/topics/_archive/exposure-type-family.md && echo "exposure-type-family.md -> _archive/exposure-type-family.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/exposure-type-filtering.md .arete/memory/topics/_archive/exposure-type-filtering.md && echo "exposure-type-filtering.md -> _archive/exposure-type-filtering.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/glance-staging-access.md .arete/memory/topics/_archive/glance-staging-access.md && echo "glance-staging-access.md -> _archive/glance-staging-access.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/import-playbook.md .arete/memory/topics/_archive/import-playbook.md && echo "import-playbook.md -> _archive/import-playbook.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/intake-interface-prototype.md .arete/memory/topics/_archive/intake-interface-prototype.md && echo "intake-interface-prototype.md -> _archive/intake-interface-prototype.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/letter-system-roadmap.md .arete/memory/topics/_archive/letter-system-roadmap.md && echo "letter-system-roadmap.md -> _archive/letter-system-roadmap.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/marsh-legal-review.md .arete/memory/topics/_archive/marsh-legal-review.md && echo "marsh-legal-review.md -> _archive/marsh-legal-review.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pm-testing-skill.md .arete/memory/topics/_archive/pm-testing-skill.md && echo "pm-testing-skill.md -> _archive/pm-testing-skill.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/policy-endorsement.md .arete/memory/topics/_archive/policy-endorsement.md && echo "policy-endorsement.md -> _archive/policy-endorsement.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/pop-rollout.md .arete/memory/topics/_archive/pop-rollout.md && echo "pop-rollout.md -> _archive/pop-rollout.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/quill-editor-formatting.md .arete/memory/topics/_archive/quill-editor-formatting.md && echo "quill-editor-formatting.md -> _archive/quill-editor-formatting.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/rich-text-editor.md .arete/memory/topics/_archive/rich-text-editor.md && echo "rich-text-editor.md -> _archive/rich-text-editor.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/sendgrid-spam-filtering.md .arete/memory/topics/_archive/sendgrid-spam-filtering.md && echo "sendgrid-spam-filtering.md -> _archive/sendgrid-spam-filtering.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/snapsheet-license-sync.md .arete/memory/topics/_archive/snapsheet-license-sync.md && echo "snapsheet-license-sync.md -> _archive/snapsheet-license-sync.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/state-licensing-compliance.md .arete/memory/topics/_archive/state-licensing-compliance.md && echo "state-licensing-compliance.md -> _archive/state-licensing-compliance.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/stripe-checkout-prefill.md .arete/memory/topics/_archive/stripe-checkout-prefill.md && echo "stripe-checkout-prefill.md -> _archive/stripe-checkout-prefill.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/template-admin-page.md .arete/memory/topics/_archive/template-admin-page.md && echo "template-admin-page.md -> _archive/template-admin-page.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/template-cleanup.md .arete/memory/topics/_archive/template-cleanup.md && echo "template-cleanup.md -> _archive/template-cleanup.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/template-filtering.md .arete/memory/topics/_archive/template-filtering.md && echo "template-filtering.md -> _archive/template-filtering.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/template-variable-mapping.md .arete/memory/topics/_archive/template-variable-mapping.md && echo "template-variable-mapping.md -> _archive/template-variable-mapping.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
mv .arete/memory/topics/voyager-policy-seeding.md .arete/memory/topics/_archive/voyager-policy-seeding.md && echo "voyager-policy-seeding.md -> _archive/voyager-policy-seeding.md (archived) $(date +%F)" >> .arete/memory/topics/_archive/LEDGER.md
```

### 4. post-apply
```bash
arete index            # regenerate index.md (archived pages drop out)
arete topic lint       # measure dangling-link delta vs baseline 149
```

### Rollback ledger format (`.arete/memory/topics/_archive/LEDGER.md`)
```
<page>.md -> _archive/<page>.md (archived|merged into <canonical>) <YYYY-MM-DD>
```
Rollback = `mv` the file back per ledger line, remove any alias added in the same line's merge, re-run `arete index`.

## Appendix — dangling-link fallout detail

`[[archived-page]] ← surviving pages that link to it`. Note: many of the linking "survivors" below are themselves ambiguous-band frozen pages — if those also get archived in the sitting, the actual delta shrinks below the headline number.

- [[60-day-review]] ← glance-2-vision
- [[actions-notifications-workflows-terminology]] ← glance-2-discovery
- [[adjuster-interviews]] ← glance-2-research-plan
- [[adjuster-notifications]] ← glance-2-vision, signature-logic
- [[adjuster-ux-vision]] ← glance-mvp-scope
- [[ai-glance-user-stories]] ← adjuster-shadowing
- [[amazon-alignment-tool-delay]] ← task-queue-cleanup
- [[attachment-auto-attach]] ← action-mailbox-rails, inbound-email-handling
- [[amazon-marsh-policy-integration]] ← glance-mvp-scope
- [[california-qualified-manager]] ← signature-logic
- [[claim-sorted-competitive-threat]] ← pop-snapsheet-to-glance-migration
- [[claim-transfer-workflow]] ← adjuster-shadowing
- [[claims-product-advisory-panel]] ← inbound-email-handling, rollout-strategy
- [[community-member-portal]] ← glance-email-composer
- [[comms-stakeholder-forum]] ← email-bounce-handling
- [[communications-tab]] ← glance-2-vision, signature-logic
- [[community-portal-accessibility]] ← adjuster-shadowing
- [[compliance-admin-panel]] ← doi-fraud-language
- [[cx-stakeholder-inclusion]] ← glance-2-discovery
- [[data-quality-view]] ← pop-snapsheet-to-glance-migration
- [[declination-letters]] ← signature-logic
- [[diary-dropdown-labels]] ← glance-notes-redesign
- [[dns-cutover-strategy]] ← action-mailbox-rails, inbound-email-handling
- [[document-center-redesign]] ← claim-portal-comms
- [[document-tagging]] ← snapsheet-migration
- [[double-bracket-bug]] ← default-email-template
- [[email-deliverability-looker-report]] ← email-bounce-handling
- [[email-deliverability]] ← email-bounce-handling
- [[feedback-collection]] ← contact-prohibited
- [[funds-diversion-risk]] ← inbound-email-handling
- [[fillable-forms-digitization]] ← doi-fraud-language
- [[glance-adoption]] ← audit-history
- [[health-check-tool]] ← looker-reports
- [[inbound-triage-inbox]] ← action-mailbox-rails, inbound-email-handling
- [[iso-integration]] ← glance-2-discovery
- [[liability-determination]] ← audit-history
- [[letters-vendor-kyber]] ← inbound-email-handling
- [[liquid-template-rendering]] ← email-bounce-handling
- [[multi-agent-strategy]] ← glance-2-research-plan
- [[meeting-consolidation]] ← signature-logic
- [[multi-agent-prototype-sprint]] ← pop-snapsheet-to-glance-migration
- [[notion-meeting-notes]] ← claim-portal-comms
- [[ops-template-process]] ← cover-whale-templates
- [[notion-restructure]] ← email-composer-rollout, email-template-playbook
- [[personal-diary-replacement]] ← glance-2-discovery
- [[pm-engineering-workflow]] ← adjuster-shadowing
- [[playwright-mcp-testing]] ← default-email-template
- [[pop-adjuster-workflow]] ← audit-history
- [[pop-adjuster-assignment]] ← glance-2-discovery
- [[pop-auto-scope]] ← glance-2-research-plan
- [[pop-release]] ← leap-rollout
- [[portal-user-sync]] ← glance-email-composer, snapsheet-migration
- [[release-notes-comms]] ← default-email-template
- [[recipient-status-indicators]] ← email-send-failure-handling
- [[sendgrid-block-list]] ← email-bounce-handling
- [[sendgrid-delivery-status]] ← email-send-failure-handling
- [[runyan-board-strategy]] ← glance-2-research-plan
- [[sendgrid-configuration]] ← email-bounce-handling
- [[series-c-strategy-shift]] ← adjuster-shadowing
- [[sms-gap]] ← inbound-email-handling, rollout-strategy
- [[smartcoms-integration]] ← cover-whale-templates
- [[snapsheet-file-note-sync]] ← glance-email-composer
- [[snapsheet-automation]] ← template-attachments
- [[snapsheet-parity]] ← leap-rollout
- [[task-management]] ← audit-history
- [[structured-payment-addresses]] ← claim-portal-comms
- [[template-field-reordering]] ← contact-prohibited
- [[three-phase-discovery-plan]] ← glance-2-discovery
- [[toast-notifications]] ← email-send-failure-handling
- [[user-story-mapping]] ← glance-2-research-plan
- [[vercel-deploy-checks]] ← claim-portal-comms
- [[workflow-automation]] ← glance-mvp-scope, snapsheet-migration
- [[workflows-engine]] ← looker-reports
- [[ai-claim-narrative]] ← glance-mvp-scope
- [[ai-tooling]] ← claim-review-automation, cover-whale-templates, glance-2-mvp, glance-mvp-scope
- [[attorney-rep-logic]] ← contact-prohibited, copilot-rollout
- [[automated-acknowledgment-emails]] ← contact-prohibited, copilot-rollout, leap-rollout, looker-reports
- [[claim-narrative-feature-flag]] ← pop-snapsheet-to-glance-migration
- [[cx-adjuster-boundaries]] ← adjuster-shadowing, email-composer-rollout, note-templates-standardization
- [[cx-communications]] ← adjuster-shadowing, signature-logic
- [[default-recipients]] ← template-attachments
- [[echeck-payment-rejection]] ← adjuster-shadowing, glance-notes-redesign
- [[email-open-tracking]] ← signature-logic, snapsheet-migration
- [[email-rollout-kpis]] ← email-composer-rollout
- [[engineer-autonomy]] ← adjuster-shadowing, leap-rollout
- [[exposure-type-filtering]] ← snapsheet-import-script
- [[import-playbook]] ← inbound-email-handling, signature-logic, snapsheet-import-script
- [[intake-interface-prototype]] ← adjuster-shadowing, leap-rollout, note-templates-standardization, variable-mapping-skill
- [[letter-system-roadmap]] ← doi-fraud-language, signature-logic
- [[marsh-legal-review]] ← amazon-pilot, claim-clear-pause, claim-portal-comms
- [[policy-endorsement]] ← amazon-pilot, claim-clear-pause, claim-portal-comms
- [[pop-rollout]] ← adjuster-shadowing, contact-prohibited, signature-logic
- [[quill-editor-formatting]] ← template-attachments
- [[rich-text-editor]] ← claim-clear, claim-portal-comms
- [[sendgrid-spam-filtering]] ← action-mailbox-rails, signature-logic, snapsheet-import-script
- [[snapsheet-license-sync]] ← claim-portal-comms, email-signature-logic
- [[stripe-checkout-prefill]] ← amazon-pilot, claim-clear, claim-portal-comms
- [[state-licensing-compliance]] ← doi-fraud-language, signature-logic
- [[template-admin-page]] ← cover-whale-templates, looker-reports, signature-logic
- [[template-cleanup]] ← glance-email-composer, snapsheet-import-script, template-attachments
- [[template-filtering]] ← leap-rollout, signature-logic
- [[template-variable-mapping]] ← copilot-rollout, email-send-failure-handling, glance-email-composer, signature-logic, snapsheet-import-script, snapsheet-migration
- [[voyager-policy-seeding]] ← claim-clear, claim-portal-comms
- [[claim-transfer-tdd]] ← claim-portal-comms
- [[email-rollout-strategy]] ← email-bounce-handling
- [[email-template-standardization]] ← default-email-template
- [[email-template-analytics]] ← email-composer-rollout
- [[email-template-rollout]] ← glance-2-vision
- [[fraud-language]] ← cover-whale-templates, glance-2-vision, inbound-email-handling, rollout-strategy, signature-logic
- [[liberty-mutual-onboarding]] ← glance-email-composer
- [[mark-onboarding]] ← claim-portal-comms
- [[pop-email-templates]] ← copilot-rollout, cover-whale-templates, glance-email-composer, glance-mvp-scope, inbound-email-handling, snapsheet-import-script, snapsheet-migration
- [[tdd-first-process]] ← signature-logic
- [[uk-email-templates]] ← default-email-template
