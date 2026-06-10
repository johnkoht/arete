# Wiki rescue proposal v2 — W4 (wiki-repair-foundation)

Generated: 2026-06-09 · analyzer: scripts/rescue-analysis.ts v2 (worktree wiki-rescue-analysis) · NO LLM calls — fully mechanical + reproducible

**Why v2**: John falsified the v1 archive band — `acknowledgment-letter-automation` was archive-HIGH ("0 rescuable sources") while 6 post-May meetings discuss it in their *bodies* with zero tagging, and active projects reference the content. v1 measured **taggability**, not **life** — it inherited the exact tagging blindness the wiki-repair fixed. v2 adds a body-mention scan and an active-project scan, and re-bands asymmetrically (doubt → KEEP: false-keep = one capped lint nag; false-archive = a discarded landing pad).

Frozen set recomputed live: **196** pages at `last_refreshed: 2026-04-24` (v1 snapshot had 212; the 6/09 catch-up `topic refresh --all` rescued 16 of those since — 48 pages total now carry `last_refreshed: 2026-06-09`).

## Executive summary

| Band | v2 count | v1 count | Action |
|---|---|---|---|
| refresh-with-aliases (HIGH) | 3 | 3 | bulk-accept → add-aliases + refresh |
| refresh, plain | 3 | 2 | bulk-accept → topic refresh |
| merge-into-canonical | 7 | 15 | hand-review |
| **starved-taggable (NEW)** | **120** | — | rescue: alias/vocabulary fix — body mentions exist, tags never did |
| **project-fed (NEW)** | **23** | — | keep frozen — landing pads for the projects→wiki flow (Phase-12 / published-doc-sync input) |
| archive (HIGH) | 26 | 139 | bulk-accept → mv to `.arete/archive/topics/` (OUTSIDE indexed tree) |
| archive (MEDIUM) | 14 | 38 | skim — same mv, weaker evidence |
| ambiguous | 0 | 14 | hand-review |
| self-rescued since v1 | 16 | 1 | none — catch-up refresh got there |
| **total** | **196** | **212** | |

- **Headline movement**: **125 of v1's 177 archive-band pages show life** the v1 instrument could not see (104 starved-taggable + 21 project-fed). They would have been discarded landing pads.
- **Cost**: $0.26 (refresh bands only) → $0.33 if all starved-band routable-now aliases are also accepted (5 additional integrations × ~1.5¢). Forward aliases are free (they route FUTURE flow).
- **Dangling-wikilink delta if all archives+merges applied**: **+139** (v1 was +177; smaller because fewer pages leave the tree).

### v1 → v2 movement table

| v1 band \ v2 band | refresh-with-aliases | refresh-plain | merge-into-canonical | starved-taggable | project-fed | archive-HIGH | archive-MEDIUM | ambiguous | self-rescued-since-v1 |
|---|---|---|---|---|---|---|---|---|---|
| refresh-with-aliases (3) | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| refresh-plain (2) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| merge-into-canonical (15) | 0 | 0 | 7 | 6 | 1 | 0 | 0 | 0 | 1 |
| archive-HIGH (139) | 1 | 0 | 0 | 89 | 20 | 26 | 1 | 0 | 2 |
| archive-MEDIUM (38) | 0 | 3 | 0 | 15 | 1 | 0 | 13 | 0 | 6 |
| ambiguous (14) | 0 | 0 | 0 | 10 | 1 | 0 | 0 | 0 | 3 |
| self-rescued (1) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

### The falsification case, re-run — `acknowledgment-letter-automation`

- v1: archive-HIGH ("0 rescuable sources"). v2: **starved-taggable (HIGH) — DUAL-SIGNAL (body mentions AND active-project references)**.
- Body mentions in 11 post-seed sources: 2026-04-27-biweekly-comms-working-group, 2026-05-01-slack-digest, 2026-05-05-email-templates-weekly, 2026-05-07-slack-digest, 2026-05-28-biweekly-comms-working-group, 2026-06-01-apd-leaders-and-team-leads-sync (+5 more).
- Active projects referencing the content: `adjuster-shadowing-discovery`, `claims-review-generator`, `glance-comms`.
  - 2026-04-27-biweekly-comms-working-group (bigram): "I mean, Nick can probably back me up on this, but we tried to do that with acknowledgment letters, and Nick ended up building a template himself that had all of"
  - 2026-05-05-email-templates-weekly (bigram): "Okay, so tomorrow Luke will finish the review of all the Fox and Teno liability legal liability templates. I think it's 13 left, which were of course specific t"
  - 2026-05-28-biweekly-comms-working-group (bigram): "This would be like all since at acknowledgments, status letters, and section 111."
- Routable-now aliases (tags carried by the mentioning sources, orphan/frozen-owned): none.
- Forward aliases (vocabulary the sources actually use): `acknowledgment-letter`.

### What v2 changes conceptually

v1 asked "can a tag route knowledge here?" — an instrument that only sees `topics:` frontmatter. But the frozen pages exist precisely because tagging failed them once already, and topics fed mainly by PROJECT work will *always* look dead to a meetings/digests-only instrument (projects do not flow to the wiki — deferred feature). v2 asks "is the topic alive anywhere John works?" and only archives on zero across ALL signals: untaggable AND unmentioned AND unreferenced.

## Bulk-accept — refresh-with-aliases (HIGH)

| Page | Pending sources | Aliases to add | Evidence |
|---|---|---|---|
| `email-templates` | 8 | `email-templates-priority` `pop-email-templates-go-live` `email-template-analytics` `email-template-standardization` `uk-email-templates` `email-template-rollout` | 2026-02-27-lindsay-john-1on1, 2026-03-05-john-jamie, 2026-03-13-john-jamie-looker-and-comms-sync-ad-hoc (+5 more) |
| `onboarding` | 4 | `onboarding-week-1` `cover-whale-onboarding` `liberty-mutual-onboarding` `mark-onboarding` | 2026-02-27-lindsay-john-1on1, 2026-03-05-john-jamie, 2026-03-19-cover-whale-email-templaes-sync (+1 more) |
| `glance-adoption` | 2 | — (exact slug) | 2026-06-09-email-templates-weekly, 2026-06-09-monthly-all-hands |

## Bulk-accept — plain refresh

| Page | Evidence |
|---|---|
| `claim-narrative-action-plan` | 1 pending source via exact slug (plain refresh): 2026-06-09-karl-john-adjuster-email-feedback.md |
| `cx-communications` | 1 pending source via exact slug (plain refresh): 2026-06-09-monthly-all-hands.md |
| `state-licensing-compliance` | 1 pending source via exact slug (plain refresh): 2026-06-09-glance-20-compliance-workshop-heather-kim.md |

## Rescue — starved-taggable (NEW band; the email-templates pattern)

Body mentions exist in post-seed meetings/digests but the slug (or any claimable alias) was never tagged. These are RESCUE, not archive. Two lever types per page: **routable-now** aliases (orphan/frozen tags already on the mentioning sources — adding them integrates those sources immediately, ~1.5¢ each) and **forward** aliases (the vocabulary the sources actually use — free; routes future flow once tagging picks them up).

| Page | Mentions (srcs) | Dual | Routable-now aliases | Forward aliases | Evidence |
|---|---|---|---|---|---|
| `multi-agent-prototype-sprint` | 58 | YES (adjuster-shadowing-discovery, ai-tooling, claims-workspace-discovery, glance-2-mvp, status-letter-automation) | — | `multi-agent` `prototype-sprint` | 2026-04-27-biweekly-comms-working-group, 2026-04-27-email-design-jam (+56 more): "- Pull out of file notes; version with paper trail; expose to Copilot/multi-agent.…" |
| `multi-agent-strategy` | 56 | YES (adjuster-shadowing-discovery, ai-tooling, glance-2-mvp, status-letter-automation) | — | `multi-agent` | 2026-04-27-biweekly-comms-working-group, 2026-04-27-email-design-jam (+54 more): "- Pull out of file notes; version with paper trail; expose to Copilot/multi-agent.…" |
| `claim-party-id-association` | 38 | YES (adjuster-shadowing-discovery, claims-review-generator, claims-workspace-discovery, glance-2-mvp, glance-comms, inbound-emails-prd, status-letter-automation) | — | `claim-party` | 2026-04-27-email-design-jam, 2026-04-28-anthony-john-weekly (+36 more): "Then I know we got to hop, we're done in a minute or so. But anything else on emails? I di…" |
| `glance-mvp-scope` | 33 | YES (adjuster-shadowing-discovery, claims-workspace-discovery, glance-2-mvp, status-letter-automation, task-management-v1) | — | `glance-mvp` `mvp-scope` | 2026-04-28-monthly-operations-product-planning-delivery, 2026-04-28-slack-digest (+31 more): "So that's something we're trying to do some discovery on right now. So I'm knee-deep in ki…" |
| `notion-docs` | 33 | YES (adjuster-shadowing-discovery, ai-tooling, claims-review-generator, glance-2-mvp, glance-comms, notion-refactor, product-analytics-playbook-project) | — | `notion-doc` | 2026-04-28-monthly-operations-product-planning-delivery, 2026-04-29-claude-code-for-reserv-product (+31 more): "- ai_002: Share Notion doc of shadow findings with the team…" |
| `user-story-mapping` | 33 | YES (claims-workspace-discovery, glance-2-mvp) | — | `story-mapping` `user-story` | 2026-04-27-slack-digest, 2026-04-28-anthony-john-weekly (+31 more): "- John is running a discovery session this week — interviewing adjusters on their mental m…" |
| `engineering-team-structure` | 32 | YES (ai-tooling, claims-workspace-discovery) | — | `engineering-team` `team-structure` | 2026-04-28-email-templates-weekly, 2026-04-29-claude-code-for-reserv-product (+30 more): "- [ ] Propose claim blacklisting problem to engineering team and surface potential solutio…" |
| `claim-narrative-feature-flag` | 28 | YES (glance-comms, status-letter-automation) | `feature-flags` | `feature-flag` | 2026-04-27-biweekly-comms-working-group, 2026-04-27-data-eng-product-sync (+26 more): "- John to ping Jamie in Slack about implementing an email-sending role instead of relying …" |
| `email-composer-rollout` | 23 | YES (adjuster-shadowing-discovery, claims-workspace-discovery, glance-2-mvp, glance-comms, inbound-emails-prd, status-letter-automation) | — | `email-composer` | 2026-04-27-biweekly-comms-working-group, 2026-04-27-john-koht-sean-mccleary-sync (+21 more): "- Walk through the [Notion roadmap board](https://www.notion.so/reservclaims/Email-Compose…" |
| `attachment-auto-attach` | 21 | YES (adjuster-shadowing-discovery, glance-2-mvp, glance-comms, inbound-emails-prd) | — | `auto-attach` `attachments-auto` | 2026-04-27-email-design-jam, 2026-04-28-email-templates-weekly (+19 more): "- Per-claim auto-attach vs. unmatched inbox (triage queue)?…" |
| `personal-diary-replacement` | 21 | YES (adjuster-shadowing-discovery, claims-workspace-discovery, glance-2-mvp, task-management-v1) | — | `personal-diary` | 2026-04-29-john-lindsay-11, 2026-04-30-adjuster-inteview-bobbi-vasquez (+19 more): "Yeah, it's almost like a personal... I almost want to equate this. Sorry, the dog's barkin…" |
| `amazon-dsp-user-journey` | 20 | YES (adjuster-shadowing-discovery, glance-2-mvp, glance-comms, inbound-emails-prd) | `dsp-listing` | `dsp-user` `amazon-dsp` `user-journey` | 2026-04-27-biweekly-comms-working-group, 2026-04-28-email-templates-weekly (+18 more): "- **SMS out of scope for now** — DSP user records add complexity; email-only focus.…" |
| `community-member-portal` | 16 | YES (adjuster-shadowing-discovery, claims-workspace-discovery, glance-2-mvp) | — | `community-member` | 2026-04-29-tech-demos, 2026-04-30-adjuster-inteview-devin-dunaway (+14 more): "Sure, I'll just do a quick show of the redesign of the third-party view and claim portal o…" |
| `task-management` | 16 | YES (adjuster-shadowing-discovery, claims-workspace-discovery, glance-2-mvp, task-management-v1) | — | — | 2026-04-28-monthly-operations-product-planning-delivery, 2026-04-29-glance-mvp-weekly (+14 more): "- de_005: Full adjuster adoption of Glance for comms is blocked until action items/task ma…" |
| `amazon-alignment-tool-delay` | 15 | YES (adjuster-shadowing-discovery, claims-workspace-discovery, glance-2-mvp) | `alignment-tool-redesign` | `alignment-tool` `amazon-alignment` | 2026-04-27-biweekly-comms-working-group, 2026-04-28-email-templates-weekly (+13 more): "So now it just makes sense as a role the same way as you have access to the alignment tool…" |
| `claude-code-adoption` | 13 | YES (ai-tooling, claims-review-generator, glance-2-mvp) | — | `claude-code` | 2026-04-28-slack-digest, 2026-04-29-claude-code-for-reserv-product (+11 more): "# Claude Code for Reserv Product…" |
| `claude-code-rollout` | 13 | YES (ai-tooling, claims-review-generator, glance-2-mvp) | — | `claude-code` | 2026-04-28-slack-digest, 2026-04-29-claude-code-for-reserv-product (+11 more): "# Claude Code for Reserv Product…" |
| `adjuster-interviews` | 12 | YES (claims-workspace-discovery, glance-2-mvp) | — | `adjuster-interview` | 2026-04-27-slack-digest, 2026-04-29-glance-mvp-weekly (+10 more): "- Adjuster interviews underway — re-interviewing shadow cohort priority + new candidates (…" |
| `data-quality-view` | 12 | YES (adjuster-shadowing-discovery, glance-2-mvp, glance-comms, status-letter-automation) | — | `data-quality` | 2026-04-29-john-lindsay-11, 2026-04-29-tech-demos (+10 more): "Yeah, but then there's things like the way that multi agentt is now is when you go to the …" |
| `design-sprint-pop` | 12 | YES (claims-workspace-discovery, glance-2-mvp) | — | `design-sprint` | 2026-04-28-slack-digest, 2026-04-29-glance-20-discovery-sync (+10 more): "**Purpose**: Engineering partner kickoff for the Glance 2.0 discovery process. You're the …" |
| `acknowledgment-letter-automation` | 11 | YES (adjuster-shadowing-discovery, claims-review-generator, glance-comms) | — | `acknowledgment-letter` | 2026-04-27-biweekly-comms-working-group, 2026-05-01-slack-digest (+9 more): "I mean, Nick can probably back me up on this, but we tried to do that with acknowledgment …" |
| `dev-tools-repo` | 11 | YES (adjuster-shadowing-discovery, ai-tooling, product-analytics-playbook-project) | — | `dev-tool-repo` `dev-tool` `tool-repo` | 2026-04-27-john-koht-sean-mccleary-sync, 2026-04-29-claude-code-for-reserv-product (+9 more): "- Repo-access / ops boundary: who owns granting access (e.g., Lindsay → dev-tools repo)? W…" |
| `claims-product-advisory-panel` | 10 | YES (claims-review-generator, claims-workspace-discovery) | — | `claim-product` `advisory-panel` | 2026-04-30-dev-ai, 2026-05-05-slack-digest (+8 more): "- le_002: Pre-loading shared domain context (org chart, acronyms, product stack, claim lif…" |
| `email-bounce-handling` | 10 | YES (glance-comms) | — | `email-bounce` `bounce-handling` | 2026-04-27-biweekly-comms-working-group, 2026-04-28-anthony-john-weekly (+8 more): "The Comms Working Group discussed default email template strategy, Copilot integration for…" |
| `email-deliverability-looker-report` | 10 | YES (glance-comms) | — | `email-deliverability` `looker-report` | 2026-04-27-biweekly-comms-working-group, 2026-04-28-email-templates-weekly (+8 more): "The Comms Working Group discussed default email template strategy, Copilot integration for…" |
| `inbound-triage-inbox` | 10 | YES (adjuster-shadowing-discovery, glance-2-mvp, inbound-emails-prd) | — | `triage-inbox` `inbound-triage` | 2026-04-27-email-design-jam, 2026-05-06-john-lindsay-11 (+8 more): "- Per-claim auto-attach vs. unmatched inbox (triage queue)?…" |
| `liability-determination` | 10 | YES (adjuster-shadowing-discovery, claims-review-generator, claims-workspace-discovery, glance-2-mvp, glance-comms) | — | — | 2026-04-30-adjuster-inteview-devin-dunaway, 2026-05-01-adjuster-inteview-brett-hughes (+8 more): "- File notes from RS stating there has been liability determination — helps them evaluate …" |
| `cover-whale-onboarding` | 9 | YES (adjuster-shadowing-discovery, glance-comms, inbound-emails-prd) | — | `cover-whale` | 2026-04-27-john-koht-sean-mccleary-sync, 2026-04-28-email-templates-weekly (+7 more): "- Current usage — creating teams like "Cover Whale Adjusters" and Pop teams (adjusters, te…" |
| `exposure-type-family` | 9 | YES (glance-comms) | — | `type-family` | 2026-04-27-biweekly-comms-working-group, 2026-04-28-email-templates-weekly (+7 more): "- [ ] Check how list templates endpoint handles partial parameters (e.g., blank account co…" |
| `glance-staging-access` | 9 | YES (glance-2-mvp, glance-comms) | — | `staging-access` `glance-staging` | 2026-05-04-slack-digest, 2026-05-11-biweekly-comms-working-group (+7 more): "Dashboard... I do have access on staging at least. Okay, cool. I actually lied.…" |
| `attorney-rep-logic` | 8 | YES (adjuster-shadowing-discovery, glance-2-mvp, status-letter-automation) | — | `attorney-rep` | 2026-04-29-glance-mvp-weekly, 2026-05-08-pop-user-story-mapping-workshop (+6 more): "They're conditional based off of things that multi-agent might predict like if multi-agent…" |
| `automated-acknowledgment-emails` | 8 | YES (adjuster-shadowing-discovery, claims-workspace-discovery, glance-2-mvp, glance-comms, inbound-emails-prd) | — | `acknowledgment-email` `automated-acknowledgment-email` `automated-acknowledgment` | 2026-04-27-email-design-jam, 2026-05-01-slack-digest (+6 more): "Then we just put the template here instead of the exposure. But yeah, which I think is fin…" |
| `claim-transfer-workflow` | 8 | YES (adjuster-shadowing-discovery, glance-2-mvp) | — | `claim-transfer` | 2026-05-08-pop-user-story-mapping-workshop, 2026-05-15-slack-digest (+6 more): "So right now we would look to like. Okay, so let's say Sam called out today. So I would go…" |
| `file-note-structured-fields` | 8 | YES (adjuster-shadowing-discovery, claims-review-generator, glance-2-mvp) | — | `structured-fields` `notes-structured` `file-notes-structured-fields` | 2026-04-27-biweekly-comms-working-group, 2026-04-30-shadow-sessions-debrief (+6 more): "- Concern raised: do templated notes reinforce note-abuse vs. building structured fields?…" |
| `three-phase-discovery-plan` | 8 | YES (claims-workspace-discovery, glance-2-mvp, inbound-emails-prd) | — | `discovery-plan` `three-phase` `phase-discovery` | 2026-04-27-slack-digest, 2026-04-28-monthly-operations-product-planning-delivery (+6 more): "Monthly ops-product planning meeting covered Tess financial system updates (address requir…" |
| `ai-tooling` | 7 | YES (ai-tooling, glance-2-mvp) | — | — | 2026-04-29-claude-code-for-reserv-product, 2026-04-30-dev-ai (+5 more): "- **Project**: [projects/active/ai-tooling/ai-tooling.md](../../projects/active/ai-tooling…" |
| `amazon-marsh-policy-integration` | 7 | YES (glance-2-mvp) | — | `marsh` `policy-integration` | 2026-04-29-claim-portal-comms, 2026-05-04-doi-language-logic (+5 more): "- Claim Clear partial release for Amazon is scheduled for Friday, with Rachael driving las…" |
| `audit-history-paper-trail` | 7 | YES (glance-2-mvp) | — | `paper-trail` `audit-history` | 2026-04-27-biweekly-comms-working-group, 2026-04-27-email-design-jam (+5 more): "- Pull out of file notes; version with paper trail; expose to Copilot/multi-agent.…" |
| `belongings-vs-property-claims` | 7 | YES (adjuster-shadowing-discovery, ai-tooling, claims-review-generator, claims-workspace-discovery, glance-2-mvp, glance-comms) | — | `property-claim` | 2026-04-27-email-design-jam, 2026-04-28-email-templates-weekly (+5 more): "Yeah, usually that's going to cover... I guess there could be multiple exposures for the s…" |
| `email-delivery-status` | 7 | YES (glance-comms) | — | `delivery-status` `email-delivery` | 2026-04-27-biweekly-comms-working-group, 2026-04-28-anthony-john-weekly (+5 more): "The Comms Working Group discussed default email template strategy, Copilot integration for…" |
| `liquid-template-rendering` | 7 | YES (glance-comms) | — | `template-rendering` `liquid-template` | 2026-04-27-biweekly-comms-working-group, 2026-05-04-doi-language-logic (+5 more): "We can go either way. It could be in the list of templates that's returned, and it will al…" |
| `california-qualified-manager` | 6 | YES (claims-review-generator, glance-comms) | — | `qualified-manager` `california-qualified` | 2026-04-27-biweekly-comms-working-group, 2026-04-27-john-koht-sean-mccleary-sync (+4 more): "- **Signature v1 simplified** — always include license #, default Heather for CA fallback,…" |
| `double-bracket-bug` | 6 | YES (glance-comms) | — | `double-brackets` | 2026-05-04-doi-language-logic, 2026-05-05-email-templates-weekly (+4 more): "The biggest unlock is that Glance email templates already have placeholder variables (e.g.…" |
| `email-deliverability` | 6 | YES (glance-comms) | — | — | 2026-04-27-biweekly-comms-working-group, 2026-04-28-monthly-operations-product-planning-delivery (+4 more): "The Comms Working Group discussed default email template strategy, Copilot integration for…" |
| `health-check-tool` | 6 | YES (glance-2-mvp) | — | `health-check` | 2026-05-04-eric-john-glance-20-design-sprint-onboarding, 2026-05-04-product-managers-internal-bi-weekly (+4 more): "I think last year when people talked about Glance 2, and I wasn't here. So I have no idea.…" |
| `ml-roadmap` | 6 | YES (glance-2-mvp) | — | — | 2026-04-29-claude-code-for-reserv-product, 2026-04-29-glance-mvp-weekly (+4 more): "Lindsay is now installed on the reserv-pm workspace and will write the offer-accepted-in-p…" |
| `pop-adjuster-assignment` | 6 | YES (claims-review-generator, glance-2-mvp) | — | `adjuster-assignment` | 2026-04-27-john-koht-sean-mccleary-sync, 2026-05-27-john-bavitha (+4 more): "John Koht and Sean McCleary synced on how Teams are being used in Glance for feature flag …" |
| `product-management-tools` | 6 | YES (glance-2-mvp) | — | `product-management` | 2026-04-29-glance-mvp-weekly, 2026-04-29-interview-ciara-gawdiak-change-management-lead (+4 more): "There's no product management, no designers, and somebody comes in and we're like, "Deloit…" |
| `project-management-workflow` | 6 | YES (task-management-v1) | — | `project-management` | 2026-04-29-glance-mvp-weekly, 2026-04-30-shadow-sessions-debrief (+4 more): "- John owns organization and project management of Glance 2.0 in Notion, with full autonom…" |
| `recipient-status-indicators` | 6 | YES (glance-2-mvp, status-letter-automation) | — | `recipient-status` `status-indicator` | 2026-04-27-biweekly-comms-working-group, 2026-04-30-adjuster-inteview-bobbi-vasquez (+4 more): "The email status right now. But we don't show the recipient status. So, every email has a …" |
| `sendgrid-delivery-status` | 6 | YES (glance-comms) | — | `delivery-status` `sendgrid-delivery` | 2026-04-27-biweekly-comms-working-group, 2026-04-28-anthony-john-weekly (+4 more): "The Comms Working Group discussed default email template strategy, Copilot integration for…" |
| `shared-context-library` | 6 | YES (ai-tooling, glance-2-mvp) | — | `shared-context` `context-library` | 2026-04-29-claude-code-for-reserv-product, 2026-04-29-interview-ciara-gawdiak-change-management-lead (+4 more): "- A key architectural concern was raised: tech and business teams risk maintaining separat…" |
| `tdd-first-process` | 6 |  | — | `tdd-first` | 2026-04-28-anthony-john-weekly, 2026-05-28-biweekly-comms-working-group (+4 more): "- The TDD-first shift you advocated for on 4/21 — are we doing it well? What's missing? (s…" |
| `workflow-automation` | 6 | YES (adjuster-shadowing-discovery, glance-2-mvp) | — | — | 2026-05-01-adjuster-inteview-brett-hughes, 2026-05-01-glance-20-workspace-mvp-prototype (+4 more): "Nick confirmed that Workflow automations can use exposure-first-opened events to trigger t…" |
| `email-template-rollout` | 5 | YES (glance-comms) | — | — | 2026-04-27-biweekly-comms-working-group, 2026-04-28-email-templates-weekly (+3 more): "- Email template rollout process has been streamlined — all templates sync to staging and …" |
| `prd-skill` | 5 | YES (ai-tooling) | — | — | 2026-04-29-claude-code-for-reserv-product, 2026-04-30-dev-ai (+3 more): "- Discuss the PRD skill — structure, templates, when to use which…" |
| `production-ready-column` | 5 | YES (glance-2-mvp, glance-comms) | — | `production-ready` | 2026-04-27-biweekly-comms-working-group, 2026-05-04-product-managers-internal-bi-weekly (+3 more): "- Email template rollout process has been streamlined — all templates sync to staging and …" |
| `tiered-claims-routing` | 5 | YES (inbound-emails-prd) | — | `claim-routing` | 2026-04-30-glance-email-templates-weekly, 2026-05-05-anthony-john-inbound-email-reply-to-prd-review (+3 more): "Because you estimated that. Then there's inbound email, which says inbound email routing t…" |
| `variable-mapping-skill` | 5 | YES (glance-comms) | — | `variable-mapping` | 2026-04-30-john-koht-luke-rodgers-11, 2026-05-05-email-templates-weekly (+3 more): "Yeah. Let me see if I can... This was in it, so I don't know... I will... Is this a skill …" |
| `adjuster-notifications` | 4 | YES (glance-2-mvp, glance-comms, inbound-emails-prd) | — | `adjuster-notification` | 2026-04-30-adjuster-inteview-devin-dunaway, 2026-05-29-slack-digest (+2 more): "We would take all the information from Snapsheet and Glance. And as of right now, I use Sn…" |
| `audit-history` | 4 | YES (glance-2-mvp) | — | — | 2026-05-28-confidentialhidden-notes-in-glance, 2026-06-01-drafts-alignment-status-letters (+2 more): "The central decision is that Glance cannot support confidential or hidden notes — anything…" |
| `looker-reports` | 4 |  | — | `looker-report` | 2026-04-28-email-templates-weekly, 2026-04-29-claude-code-for-reserv-product (+2 more): "So I don't feel comfortable saying, "Yeah, we can use the looker report to do that," becau…" |
| `pantheon-plugin-integration` | 4 | YES (ai-tooling) | — | `pantheon` `pantheon-plugin` | 2026-04-29-claude-code-for-reserv-product, 2026-04-30-slack-digest (+2 more): "I have been whitelisting though, like Matthew whitelisted in Pantheon and then I've just b…" |
| `quill-editor-formatting` | 4 | YES (adjuster-shadowing-discovery) | — | `quill-editor` | 2026-04-27-biweekly-comms-working-group, 2026-04-27-email-design-jam (+2 more): "#### Quill editor EOL (5min)…" |
| `release-notes-comms` | 4 | YES (adjuster-shadowing-discovery, ai-tooling, glance-2-mvp) | — | `release-notes` | 2026-05-06-interview-kimberly-rose-change-management-lead, 2026-05-14-slack-digest (+2 more): "- Current feedback mechanisms at Reserv include bi-weekly release notes, Slack blasts, pos…" |
| `rich-text-editor` | 4 | YES (adjuster-shadowing-discovery, glance-2-mvp, glance-comms) | — | `rich-text` `text-editor` | 2026-05-13-glance-20-multiagent-design-vision-workshop, 2026-05-26-anthony-john-weekly (+2 more): "- Adjusters strongly prefer dense, text-rich, minimal-click interfaces — no one in shadowi…" |
| `smartcomms-integration` | 4 |  | — | `smartcomms` | 2026-04-27-biweekly-comms-working-group, 2026-05-04-doi-language-logic (+2 more): "- **Letters/Lob deprioritized** for 2026 — emails + SMS take priority. (Frames Khyber / Sm…" |
| `snapsheet-parity` | 4 | YES (adjuster-shadowing-discovery, glance-2-mvp, inbound-emails-prd, task-management-v1) | — | — | 2026-04-29-tech-demos, 2026-06-05-john-koht-jamie-burk-project-alignment (+2 more): "So there was a create API service that we had to update to have additional fields that are…" |
| `ai-glance-user-stories` | 3 |  | — | `user-stories` | 2026-04-27-biweekly-comms-working-group, 2026-06-08-biweekly-comms-working-group (+1 more): "Yeah. So let's see. Let me... I have a couple of user stories on that. It's my Jira tab.…" |
| `contact-prohibited` | 3 | YES (status-letter-automation) | — | — | 2026-05-28-biweekly-comms-working-group, 2026-06-01-drafts-alignment-status-letters (+1 more): "- **Draft emails** — Agreed as a manual fallback for automated emails blocked by edge case…" |
| `email-cutover-timing` | 3 |  | — | `cutover-timing` `email-cutover` | 2026-04-28-email-templates-weekly, 2026-05-05-anthony-john-inbound-email-reply-to-prd-review (+1 more): "- Production cutover timing — still EOW?…" |
| `exposure-type-filtering` | 3 |  | — | `type-filtering` | 2026-05-13-glance-20-multiagent-design-vision-workshop, 2026-05-28-doi-sync (+1 more): "Yeah, I think maybe we should do some type of filtering.…" |
| `iso-integration` | 3 | YES (adjuster-shadowing-discovery) | — | — | 2026-05-04-product-managers-internal-bi-weekly, 2026-05-08-adjuster-shadowing-session-lindsay-calar (+1 more): "- Section 111 and Medicare reporting emerged as top QA priorities, requiring discovery int…" |
| `notion-organization` | 3 |  | — | — | 2026-04-29-glance-mvp-weekly, 2026-04-30-slack-digest (+1 more): "- John owns organization and project management of Glance 2.0 in Notion, with full autonom…" |
| `uk-email-templates` | 3 | YES (glance-comms) | `email-template-rollout` | `uk-email-template` | 2026-05-26-email-templates-weekly, 2026-05-27-quick-notion-sync (+1 more): "- Justin to send John and Anthony the UK email template.  - _Justin Dahlgren_…" |
| `60-day-review` | 2 |  | — | — | 2026-04-29-john-lindsay-11, 2026-05-06-john-lindsay-11: "- 60-day reviews: Lindsay noted they carry little weight for product/knowledge workers; pe…" |
| `actions-notifications-workflows-terminology` | 2 | YES (adjuster-shadowing-discovery, glance-2-mvp) | — | `action-notification` `notification-workflow` | 2026-04-29-john-lindsay-11, 2026-05-12-slack-digest: "So, like, what does that look like? Or like, how do we engineer notifications? Action plan…" |
| `adjuster-personas` | 2 | YES (claims-workspace-discovery, glance-2-mvp) | — | — | 2026-05-04-slack-digest, 2026-05-06-reserv-product-walkthrough-w-runyon: "- Different adjuster personas require different experiences: BI adjusters handle claims op…" |
| `adjuster-ux-vision` | 2 |  | — | `ux-vision` | 2026-05-04-james-glance-prototype-feedback, 2026-05-28-john-nate-pre-runyon-checkin: "The team aligned on a directional UX vision for Glance 2.0: adjusters should operate prima…" |
| `community-portal-accessibility` | 2 | YES (adjuster-shadowing-discovery, glance-2-mvp) | — | `community-portal` | 2026-04-29-tech-demos, 2026-05-06-cj-lindsay-multiagent-and-glance-20-vision-pre-session: "Sure, I'll just do a quick show of the redesign of the third-party view and claim portal o…" |
| `dc-whiteboarding-workshop` | 2 | YES (glance-2-mvp) | — | — | 2026-04-29-glance-mvp-weekly, 2026-04-29-john-lindsay-11: "- DC whiteboarding workshop — date still pending (commitment 45ef9b64) — lock today?…" |
| `echeck-payment-rejection` | 2 | YES (adjuster-shadowing-discovery) | — | `echeck-payment` | 2026-05-04-product-managers-internal-bi-weekly, 2026-05-07-slack-digest: "- Payments: ECHECK viability declining as JP Morgan Chase and other major banks refuse it …" |
| `liberty-mutual-onboarding` | 2 | YES (glance-comms) | — | `liberty` `liberty-mutual` | 2026-06-02-claim-portal-comms, 2026-06-05-claim-review-template-internal-strategy-meeting: "- Anthony is hitting blockers adding general liability cause-of-loss codes in Liberty, uns…" |
| `pop-auto-scope` | 2 | YES (claims-workspace-discovery, glance-2-mvp, inbound-emails-prd) | — | `auto-scope` | 2026-05-28-product-analytics-playbook, 2026-06-08-biweekly-comms-working-group: "The playbook is being consolidated into a Claude skill rather than the Notion doc. John bu…" |
| `sendgrid-block-list` | 2 |  | — | `block-list` | 2026-04-27-email-design-jam, 2026-05-28-biweekly-comms-working-group: "- **Deliverability UI** (PLAT-10050): hover-explanations on bounce status; surface SendGri…" |
| `series-c-strategy-shift` | 2 | YES (glance-2-mvp) | — | `series-c` | 2026-04-29-glance-mvp-weekly, 2026-06-01-product-managers-internal-bi-weekly: "- Series C: CJ announcing Monday; his vision statements reinforce 'at your fingertips' AI-…" |
| `snapsheet-automation` | 2 | YES (glance-2-mvp) | — | — | 2026-05-01-slack-digest, 2026-06-08-john-philip-glance-20-tasks-roadmap-review: "- New task creation triggers were identified for messages, pass/pay decisions, and missing…" |
| `template-conditional-logic` | 2 | YES (claims-review-generator) | — | `template-conditional` `conditional-logic` | 2026-04-27-biweekly-comms-working-group, 2026-05-04-doi-language-logic: "- POP accounts don't use the word "claim," so the default template's claim details section…" |
| `template-filtering` | 2 | YES (glance-comms) | — | — | 2026-04-27-biweekly-comms-working-group, 2026-05-11-biweekly-comms-working-group: "- Jamie to write up a quick spec on how template filtering should work if the existing per…" |
| `three-layer-memory-system` | 2 | YES (ai-tooling) | — | `three-layer` `memory-system` | 2026-04-29-claude-code-for-reserv-product, 2026-05-06-ai-tooling-memory-system-feedback: "- Discuss the memory system — three-layer structure, how observations build into collabora…" |
| `ai-claim-narrative` | 1 | YES (glance-2-mvp) | — | — | 2026-05-06-ai-tooling-memory-system-feedback: "So AI claim narrative for example, you can see it was there has a current state, why scope…" |
| `associated-contacts-ui` | 1 |  | — | `contact-ui` | 2026-04-29-glance-mvp-weekly: "The most consequential decision was that POP action plans in Glance 2.0 will be powered by…" |
| `claim-sorted-competitive-threat` | 1 | YES (glance-2-mvp, glance-comms) | — | `claim-sorted` | 2026-06-01-alignment-tool-mocks: "So instead of having a row that we use as the collapse, if they're not really going to be …" |
| `claude-damage-estimation` | 1 |  | — | `damage-estimation` | 2026-04-30-adjuster-inteview-devin-dunaway: "- Auto property damage estimation may have its own action-item shape, its own state primit…" |
| `communications-tab` | 1 | YES (claims-workspace-discovery) | — | — | 2026-04-27-email-design-jam: "Yeah, there we go. Okay, I don't think you could see it, but one of these, like, blue tabs…" |
| `dns-cutover-strategy` | 1 | YES (inbound-emails-prd) | — | `dns-cutover` | 2026-04-27-email-design-jam: "- DNS cutover sequencing once an account flips to Glance inbound — how do we avoid a windo…" |
| `document-center-redesign` | 1 |  | — | `document-center` | 2026-04-29-tech-demos: "- Connor showed a redesigned third-party claim portal view featuring cards, a resolution t…" |
| `fillable-forms-digitization` | 1 |  | — | `fillable-form` | 2026-05-04-slack-digest: "DOI/fraud language placement scoping for emails. Kim clarified fraud language requirements…" |
| `glance-2-discovery` | 1 |  | — | — | 2026-04-29-glance-20-discovery-sync: "<!-- Merged from now/agendas/2026-04-29-glance-2-discovery-sync.md -->…" |
| `glance-2-research-plan` | 1 | YES (glance-2-mvp) | — | `research-plan` | 2026-06-04-runyon-reserv-research-checkin: "So yeah, the next week we'll be shaping up the research plan too. So some of these concept…" |
| `glance-2-vision` | 1 |  | — | — | 2026-05-06-reserv-product-walkthrough-w-runyon: "Glance today is still a supplement to Snapsheet — adjusters only open it for specific task…" |
| `glance-user-guides` | 1 | YES (ai-tooling, glance-comms) | — | `user-guide` | 2026-04-30-dev-ai: "John Koht has built out a shared context and skills repository in the dev tools repo for t…" |
| `import-playbook` | 1 | YES (glance-comms) | — | — | 2026-05-27-quick-notion-sync: "- [ ] Variable mapping + drops section in import playbook (open)…" |
| `khyber-evaluation` | 1 |  | — | `khyber` | 2026-04-27-biweekly-comms-working-group: "- **Letters/Lob deprioritized** for 2026 — emails + SMS take priority. (Frames Khyber / Sm…" |
| `kyber-vendor-risk` | 1 | YES (ai-tooling) | — | `kyber` | 2026-05-29-doi-language-into-glance: "- **Status letters** (for Anthony + Nick call): Kyber 15/30d benchmark — statutory or reco…" |
| `letters-vendor-kyber` | 1 | YES (ai-tooling) | — | `kyber` | 2026-05-29-doi-language-into-glance: "- **Status letters** (for Anthony + Nick call): Kyber 15/30d benchmark — statutory or reco…" |
| `lob-mail-delivery` | 1 |  | — | `mail-delivery` | 2026-05-15-slack-digest: "### 2. #inc-google-group-mail-delivery (John ↔ Mayra Guillotte)…" |
| `lovable-prototyping` | 1 |  | — | — | 2026-05-28-confirmed-runyon-reserv-immersion-session: "So John has shared some of them, and we can get into that in like the tech talk section of…" |
| `mark-onboarding` | 1 |  | — | — | 2026-06-09-anthony-john-weekly: "- Bandwidth across recipient-table TDD + Mark onboarding + inbound (parked)…" |
| `pilot-testing` | 1 |  | — | — | 2026-04-29-glance-mvp-weekly: "For the pilot testing that we're doing right now, okay? Or whos when did when who said tha…" |
| `pm-engineering-workflow` | 1 | YES (notion-refactor) | — | `engineering-workflow` | 2026-05-04-glance-figma: "- Engineering: Backend workflow definition (flexible per-account configs) identified as th…" |
| `pop-rollout` | 1 | YES (claims-workspace-discovery, product-analytics-playbook-project) | — | — | 2026-05-15-product-analytics: "- Glance 2.0 POP rollout will be the first feature to pilot a rigorous hypothesis-driven p…" |
| `sendgrid-spam-filtering` | 1 | YES (inbound-emails-prd) | — | `sendgrid-spam` | 2026-04-27-email-design-jam: "- Spam / SendGrid spam check fields — turn on?…" |
| `sms-gap` | 1 |  | — | — | 2026-05-28-biweekly-comms-working-group: "The Comms Working Group reviewed shipped work (LEAP, Foxen, Signature V1 defaults, fraud l…" |
| `spam-score-ui` | 1 |  | — | `spam-score` | 2026-05-11-biweekly-comms-working-group: "- Spam check testing strategy discussed: Tim suggested capturing a real Sendgrid payload, …" |
| `template-slug-rename` | 1 | YES (claims-review-generator) | — | `template-slug` | 2026-05-11-biweekly-comms-working-group: "- Adjust how it calls `render template` (slug vs. no-slug)?…" |
| `template-submission-form` | 1 | YES (adjuster-shadowing-discovery, glance-2-mvp) | — | `submission-form` | 2026-05-01-glance-20-workspace-mvp-prototype: "- Architecture: Action plan items should be database-backed so system events (calls, email…" |
| `uk-mail-delivery` | 1 |  | — | `mail-delivery` | 2026-05-15-slack-digest: "### 2. #inc-google-group-mail-delivery (John ↔ Mayra Guillotte)…" |
| `vercel-deploy-checks` | 1 |  | — | `vercel` | 2026-05-04-eric-john-glance-20-design-sprint-onboarding: "- Ephemeral environments: Eric finishing Vercel migration, then per-PR preview deploys ava…" |
| `workflows-engine` | 1 | YES (adjuster-shadowing-discovery, claims-workspace-discovery, status-letter-automation) | — | `workflow-engine` | 2026-05-29-glance-20-tech-feasibility-roadmap-nick-anthony-john: "- Use a background job querying eligible claims to fire custom 'needs status letter' event…" |

## Keep-frozen — project-fed (NEW band; NOT archived)

Active-project references but no/min meeting-body mentions. These pages are **landing pads** waiting on the projects→wiki flow (deferred feature). Archiving them would discard exactly the pages that flow needs. This list is direct input to the Phase-12 / published-doc-sync prioritization.

| Page | Projects | Evidence |
|---|---|---|
| `claude-enterprise-limits` | `ai-tooling` | ai-tooling/ai-tooling.md: "| 2026-04-01 | Enterprise Claude access stays limited until usage guidelines and rollout plan establ" |
| `comms-domain-ownership` | `adjuster-shadowing-discovery`, `glance-comms` | adjuster-shadowing-discovery/working/context-brief.md: "- **project**: Glance Communications — Domain Ownership (active) — `/Users/john/code/arete-reserv/pr" |
| `declination-letters` | `claims-review-generator` | claims-review-generator/working/batch-everyspan/fac-132-brr-copilot.md: "Tim Ryan — *INFERRED.* A file note dated 08/18/2025 quotes a direct email from Tim Ryan to Michelle " |
| `diary-dropdown-labels` | `adjuster-shadowing-discovery`, `glance-2-mvp` | adjuster-shadowing-discovery/outputs/synthesis.md: "| Personal Excel diary (claim # + what waiting for) | Snapsheet diary doesn't show *what* waiting fo" |
| `document-tagging` | `adjuster-shadowing-discovery`, `glance-2-mvp` | adjuster-shadowing-discovery/sessions/jessica-jones.md: "| Glance Operations | Payment authorization, document tagging/labeling, Copilot AI | Dropdown defaul" |
| `email-automation-reminders` | `glance-2-mvp` | glance-2-mvp/runyon/stakeholders.md: "- POP TL (Indiana). Operational owner. Familiar with current Snapsheet automation (acknowledgment + " |
| `email-open-tracking` | `glance-2-mvp` | glance-2-mvp/runyon/adjuster-glossary.md: "**Tabs-per-DSP.** Jamie Phillips's Excel structure for bulk rental claims — one tab per DSP, trackin" |
| `email-send-failure-handling` | `glance-2-mvp` | glance-2-mvp/prototypes/2026-05-12_pop-mvp-data/README.md: "| 6 anti-pattern flags wired across the surface | Replay-derived | Each flag corresponds to a real h" |
| `email-spam-fix` | `inbound-emails-prd` | inbound-emails-prd/README.md: "- 2026-03-30 Inbound Email Spam Detection sync (Tim Gray, John Koht)" |
| `email-templates-priority` | `glance-comms` | glance-comms/rollout-strategy/data/eu-template-gap-analysis.md: "## Section 5: High-Priority Templates (by Usage)" |
| `fraud-identification-gap` | `glance-comms` | glance-comms/working/variable-mapping-process.md: "### Gap Identification Prompt" |
| `funds-diversion-risk` | `inbound-emails-prd` | inbound-emails-prd/README.md: "Adjusters can't fully leave Snapsheet because inbound email lives there. Today, replies to Glance-se" |
| `glance-eoy-segmentation` | `adjuster-shadowing-discovery` | adjuster-shadowing-discovery/discovery.md: "**Context**: Adjusters currently work primarily in Snapsheet with some Glance usage. EOY 2026 goal i" |
| `ops-template-process` | `glance-comms` | glance-comms/working/email-template-playbook.md: "| Dave Wiedenheft | Ops — template quality |" |
| `para-directory-structure` | `ai-tooling`, `glance-comms` | ai-tooling/ai-tooling.md: "| 2026-04-01 | Directory structure leans toward PARA framework |" |
| `pm-skills-library` | `ai-tooling` | ai-tooling/ai-tooling.md: "**Goal:** Build out AI tools that PMs (and eventually other Reserv teams) can use — shared context l" |
| `pop-release` | `adjuster-shadowing-discovery`, `glance-2-mvp` | adjuster-shadowing-discovery/outputs/synthesis.md: "- **E-check rejection at major banks (2 of 4 explicit)**: Angela (credit unions and big banks) + Sam" |
| `qmd-semantic-search` | `adjuster-shadowing-discovery`, `ai-tooling` | adjuster-shadowing-discovery/ORCHESTRATE.md: "# Semantic search for related past learnings" |
| `runyan-board-strategy` | `glance-2-mvp` | glance-2-mvp/working/notion-prototype-page/meeting-notes/lindsay-arc.md: "Lindsay and John aligned on a research strategy for Glance 2.0 against the backdrop of a Runyan/boar" |
| `template-customization-workarounds` | `adjuster-shadowing-discovery` | adjuster-shadowing-discovery/sessions/nestor-arias.md: "- Email drafting and template customization: ~8 min" |
| `template-hotkey-workarounds` | `adjuster-shadowing-discovery`, `glance-2-mvp` | adjuster-shadowing-discovery/discovery.md: "> Adjusters spend the majority of their day on **manual data transfer between fragmented systems** i" |
| `testing-strategy-skill` | `ai-tooling` | ai-tooling/ai-tooling.md: "- [ ] Build out `testing-strategy` skill using Lauren's template" |
| `toast-notifications` | `glance-2-mvp` | glance-2-mvp/prototypes/2026-05-13_notepad-vision/implementation.md: "2. Toast notification appears bottom-right: "6 actions applied ✓"" |

## Bulk-accept — archive (HIGH)

Zero on ALL signals: no taggable sources, no post-seed body mentions, no active-project references, ≤1 live in-link.

| Page | Evidence |
|---|---|
| `attachment-sync` | 0 taggable sources, 0 live in-links (3 total), seed=1, soft signals 1; body mentions 0; project refs 0 (seed: 2026-03-23-glance-emails-prod-access) |
| `automated-receipt-acknowledgment` | 0 taggable sources, 0 live in-links (3 total), seed=1, soft signals 2; body mentions 0; project refs 0 (seed: 2026-04-15-pop-adjuster-shadow-angela-smith) |
| `certified-mail-compliance` | 0 taggable sources, 1 live in-links (3 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-03-30-escalations-email-comms-sync) |
| `comms-stakeholder-forum` | 0 taggable sources, 0 live in-links (4 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-04-06-tim-john-email-related-features) |
| `compliance-admin-panel` | 0 taggable sources, 1 live in-links (4 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-04-13-kim-john-compliance-letters-emails) |
| `cx-stakeholder-inclusion` | 0 taggable sources, 0 live in-links (4 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-04-22-glance-mvp-weekly) |
| `duplicate-policyholder-bug` | 0 taggable sources, 0 live in-links (3 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-04-01-john-jamie-duplicate-ph-bug) |
| `embedded-help` | 0 taggable sources, 0 live in-links (2 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-02-24-connect-glance-user-guides) |
| `escalations-tracking` | 0 taggable sources, 1 live in-links (3 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-03-30-escalations-email-comms-sync) |
| `feedback-collection` | 0 taggable sources, 0 live in-links (4 total), seed=2, soft signals 0; body mentions 0; project refs 0 (seed: 2026-03-05-john-jamie (+1 more)) |
| `guide-rollout` | 0 taggable sources, 0 live in-links (2 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-02-24-connect-glance-user-guides) |
| `haiku-opus-architecture` | 0 taggable sources, 0 live in-links (5 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-04-15-john-lindsay-11) |
| `letter-vendor-evaluation` | 0 taggable sources, 0 live in-links (5 total), seed=1, soft signals 2; body mentions 0; project refs 0 (seed: 2026-04-09-smartcomms-demo) |
| `meeting-consolidation` | 0 taggable sources, 1 live in-links (1 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-04-21-anthony-john-weekly) |
| `notion-restructure` | 0 taggable sources, 1 live in-links (3 total), seed=2, soft signals 0; body mentions 0; project refs 0 (seed: 2026-03-25-john-lindsay-11 (+1 more)) |
| `playwright-mcp-testing` | 0 taggable sources, 1 live in-links (5 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-03-23-glance-emails-prod-overview) |
| `pop-2-0-redesign` | 0 taggable sources, 0 live in-links (5 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-04-16-pop-20-check-in) |
| `pop-adjuster-workflow` | 0 taggable sources, 0 live in-links (4 total), seed=1, soft signals 1; body mentions 0; project refs 0 (seed: 2026-04-08-pop-snapsheet-functionality-review) |
| `pop-eu-launch` | 0 taggable sources, 0 live in-links (4 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-04-08-glance-mvp-weekly) |
| `sendgrid-configuration` | 0 taggable sources, 0 live in-links (3 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-03-06-sendgrid-email-handling) |
| `smartcoms-integration` | 0 taggable sources, 1 live in-links (3 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-03-26-cover-whale-email-templaes-sync) |
| `snapsheet-file-note-sync` | 0 taggable sources, 1 live in-links (4 total), seed=1, soft signals 1; body mentions 0; project refs 0 (seed: 2026-03-23-glance-emails-prod-access) |
| `snapsheet-task-replacement` | 0 taggable sources, 0 live in-links (5 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-04-08-glance-mvp-weekly) |
| `template-field-reordering` | 0 taggable sources, 0 live in-links (3 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-03-11-email-feature-review-with-jamie) |
| `tricera-templates` | 0 taggable sources, 1 live in-links (3 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-03-30-escalations-email-comms-sync) |
| `workflow-tool-integration` | 0 taggable sources, 0 live in-links (3 total), seed=1, soft signals 0; body mentions 0; project refs 0 (seed: 2026-03-17-pop-glance-emails) |

## Skim — archive (MEDIUM)

Also zero body mentions and zero project refs; weaker v1 evidence (multi-source seed or weak/title-only soft signals).

| Page | Evidence |
|---|---|
| `ai-claims-automation` | 0 taggable sources, seed=1, live in-links 0, soft signals 5 (0 live-dup / 5 weak / 0 title-only); body mentions 0; project refs 0 |
| `claim-narrative-cost` | 0 taggable sources, seed=1, live in-links 0, soft signals 5 (0 live-dup / 5 weak / 0 title-only); body mentions 0; project refs 0 |
| `claim-narrative-disruption` | 0 taggable sources, seed=1, live in-links 0, soft signals 5 (0 live-dup / 5 weak / 0 title-only); body mentions 0; project refs 0 |
| `cx-adjuster-boundaries` | 0 taggable sources, seed=2, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only); body mentions 0; project refs 0 |
| `default-recipients` | 0 taggable sources, seed=4, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only); body mentions 0; project refs 0 |
| `email-rollout-kpis` | 0 taggable sources, seed=2, live in-links 0, soft signals 5 (0 live-dup / 5 weak / 0 title-only); body mentions 0; project refs 0 |
| `email-rollout-phasing` | 0 taggable sources, seed=1, live in-links 0, soft signals 6 (0 live-dup / 6 weak / 0 title-only); body mentions 0; project refs 0 |
| `engineer-autonomy` | 0 taggable sources, seed=1, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only); body mentions 0; project refs 0 |
| `intake-interface-prototype` | 0 taggable sources, seed=1, live in-links 3, soft signals 0 (0 live-dup / 0 weak / 0 title-only); body mentions 0; project refs 0 |
| `letter-system-roadmap` | 0 taggable sources, seed=1, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only); body mentions 0; project refs 0 |
| `pm-testing-skill` | 0 taggable sources, seed=1, live in-links 0, soft signals 3 (0 live-dup / 3 weak / 0 title-only); body mentions 0; project refs 0 |
| `portal-user-sync` | 0 taggable sources, seed=1, live in-links 3, soft signals 0 (0 live-dup / 0 weak / 0 title-only); body mentions 0; project refs 0 |
| `template-admin-page` | 0 taggable sources, seed=3, live in-links 3, soft signals 0 (0 live-dup / 0 weak / 0 title-only); body mentions 0; project refs 0 |
| `voyager-policy-seeding` | 0 taggable sources, seed=1, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only); body mentions 0; project refs 0 |

## Hand-review — merge-into-canonical

### Absorptions implied by the refresh band

| Absorbed page | Into | Own evidence |
|---|---|---|
| `email-template-analytics` | `email-templates` | absorbed by [[email-templates]] (alias claim); own flow 0; live in-links 0 (6 total); seed=3 |
| `email-template-standardization` | `email-templates` | absorbed by [[email-templates]] (alias claim); own flow 0; live in-links 1 (4 total); seed=1 |
| `onboarding-week-1` | `onboarding` | absorbed by [[onboarding]] (alias claim); own flow 0; live in-links 0 (1 total); seed=1 |
| `pop-email-templates-go-live` | `email-templates` | absorbed by [[email-templates]] (alias claim); own flow 0; live in-links 0 (5 total); seed=1 |

### Merges into a LIVE partner page (per-pair decision)

### `claim-transfer-tdd` → merge into `tdd`
- Evidence: this page is the narrower sub-slug of live [[tdd]]; own flow 0; live-successor pending 0; live in-links 1 — v2 life signals corroborate: 8 body-mention sources, projects [adjuster-shadowing-discovery, glance-2-mvp]
- Body mentions (8): 2026-05-08-pop-user-story-mapping-workshop, 2026-05-15-slack-digest, 2026-05-20-slack-digest (+5 more) — corroborates the topic is alive under the live partner
- Project refs: adjuster-shadowing-discovery, glance-2-mvp
- Apply: `arete topic add-aliases tdd claim-transfer-tdd` then archive `claim-transfer-tdd` (mv + ledger).

### `email-rollout-strategy` → merge into `rollout-strategy`
- Evidence: this page is the narrower sub-slug of live [[rollout-strategy]]; own flow 0; live-successor pending 0; live in-links 0
- Apply: `arete topic add-aliases rollout-strategy email-rollout-strategy` then archive `email-rollout-strategy` (mv + ledger).

### `fraud-language` → merge into `doi-fraud-language`
- Evidence: this page is BROADER; live [[doi-fraud-language]] is the active sub-topic carrying the flow; own flow 0; live-successor pending 21; live in-links 4 — v2 life signals corroborate: 35 body-mention sources, projects [adjuster-shadowing-discovery, glance-2-mvp, glance-comms]
- Body mentions (35): 2026-04-27-email-design-jam, 2026-04-30-glance-email-templates-weekly, 2026-04-30-john-koht-luke-rodgers-11 (+32 more) — corroborates the topic is alive under the live partner
- Project refs: adjuster-shadowing-discovery, glance-2-mvp, glance-comms
- Apply: `arete topic add-aliases doi-fraud-language fraud-language` then archive `fraud-language` (mv + ledger).

## Hand-review — ambiguous

## Hand-review — spot-validation (5 random pages per band, seeded RNG)

Bulk-accept is not blind: per band, 5 deterministic random picks with the raw evidence lines. Verify these by grepping the named files before applying.

### starved-taggable

- `smartcomms-integration`
  - mention 2026-04-27-biweekly-comms-working-group (rare-token): "- **Letters/Lob deprioritized** for 2026 — emails + SMS take priority. (Frames Khyber / SmartComms conversations.)"
  - mention 2026-05-04-doi-language-logic (rare-token): "**Goal**: Understand how DOI/fraud language is handled in SmartComms so we can replicate the pattern for Glance email templates."

- `vercel-deploy-checks`
  - mention 2026-05-04-eric-john-glance-20-design-sprint-onboarding (window): "- Ephemeral environments: Eric finishing Vercel migration, then per-PR preview deploys available"
  - mention 2026-05-04-eric-john-glance-20-design-sprint-onboarding (rare-token): "- Eric allocated at ~70% to Glance 2.0, 30% to ephemeral environments/Vercel migration"

- `rich-text-editor`
  - mention 2026-05-13-glance-20-multiagent-design-vision-workshop (bigram): "- Adjusters strongly prefer dense, text-rich, minimal-click interfaces — no one in shadowing sessions has complained about Snapsheet's density, and they love th"
  - mention 2026-05-26-anthony-john-weekly (bigram): "- YAML alone won't preserve rich text formatting; using a Liquid HTML file for the body content (similar to the email template approach) is the preferred soluti"
  - project adjuster-shadowing-discovery — adjuster-shadowing-discovery/discovery.md: "Adjusters default to Snapsheet during live inbound calls. Emails sent from Glance show only a stub in Snapsheet. A text "
  - project adjuster-shadowing-discovery — adjuster-shadowing-discovery/outputs/synthesis.md: "- Brittny Loetscher: *"I don't copy and paste them over here because it's another step to do."* {{00:05}} Glance text ed"

- `sendgrid-delivery-status`
  - mention 2026-04-27-biweekly-comms-working-group (bigram): "The Comms Working Group discussed default email template strategy, Copilot integration for template selection, email deliverability/bounce notification UX, and "
  - mention 2026-04-27-biweekly-comms-working-group (bigram): "- Recipient-level delivery status (bounce, delivered, opened) is already stored per email address in Glance but not yet surfaced in the UI"
  - project glance-comms — glance-comms/working/email-delivery-baseline.md: "**What**: SendGrid is sending webhook event notifications (delivery confirmations, bounces, opens) to our endpoint, and "

- `lob-mail-delivery`
  - mention 2026-05-15-slack-digest (bigram): "### 2. #inc-google-group-mail-delivery (John ↔ Mayra Guillotte)"

### project-fed

- `email-automation-reminders`
  - project glance-2-mvp — glance-2-mvp/runyon/stakeholders.md: "- POP TL (Indiana). Operational owner. Familiar with current Snapsheet automation (acknowledgment + reminder emails ever"

- `email-open-tracking`
  - project glance-2-mvp — glance-2-mvp/runyon/adjuster-glossary.md: "**Tabs-per-DSP.** Jamie Phillips's Excel structure for bulk rental claims — one tab per DSP, tracking all open claims wi"
  - project glance-2-mvp — glance-2-mvp/runyon/glance-2-runyon-v1/adjuster-glossary.md: "**Tabs-per-DSP.** Jamie Phillips's Excel structure for bulk rental claims — one tab per DSP, tracking all open claims wi"

- `qmd-semantic-search`
  - project adjuster-shadowing-discovery — adjuster-shadowing-discovery/ORCHESTRATE.md: "# Semantic search for related past learnings"
  - project ai-tooling — ai-tooling/ai-tooling.md: "| 2026-04-01 | QMD identified as shared semantic search tool for the team |"

- `fraud-identification-gap`
  - project glance-comms — glance-comms/working/variable-mapping-process.md: "### Gap Identification Prompt"

- `document-tagging`
  - project adjuster-shadowing-discovery — adjuster-shadowing-discovery/sessions/jessica-jones.md: "| Glance Operations | Payment authorization, document tagging/labeling, Copilot AI | Dropdown defaults to wrong value; p"
  - project adjuster-shadowing-discovery — adjuster-shadowing-discovery/sessions/kandyce-bennett.md: "| Manually remembers photo numbers ("That was number 48") when sifting attachments | No way to bookmark, tag, or filter "

### archive-HIGH

- `pop-2-0-redesign`
  - NEGATIVE evidence: identity phrase "pop 2 0 redesign" (non-generic: redesign) — zero hits across 143 post-seed sources and 241 project files; 0 taggable sources, 0 live in-links (5 total), seed=1, soft signals 0

- `snapsheet-file-note-sync`
  - NEGATIVE evidence: identity phrase "snapsheet file note sync" (non-generic: NONE — full phrase only) — zero hits across 143 post-seed sources and 241 project files; 0 taggable sources, 1 live in-links (4 total), seed=1, soft signals 1

- `pop-adjuster-workflow`
  - NEGATIVE evidence: identity phrase "pop adjuster workflow" (non-generic: NONE — full phrase only) — zero hits across 143 post-seed sources and 241 project files; 0 taggable sources, 0 live in-links (4 total), seed=1, soft signals 1

- `haiku-opus-architecture`
  - NEGATIVE evidence: identity phrase "haiku opu architecture" (non-generic: haiku, opu, architecture) — zero hits across 143 post-seed sources and 241 project files; 0 taggable sources, 0 live in-links (5 total), seed=1, soft signals 0

- `attachment-sync`
  - NEGATIVE evidence: identity phrase "attachment sync" (non-generic: attachment) — zero hits across 143 post-seed sources and 241 project files; 0 taggable sources, 0 live in-links (3 total), seed=1, soft signals 1

### archive-MEDIUM

- `intake-interface-prototype`
  - NEGATIVE evidence: identity phrase "intake interface prototype" (non-generic: intake, interface, prototype) — zero hits across 143 post-seed sources and 241 project files; 0 taggable sources, seed=1, live in-links 3, soft signals 0 (0 live-dup / 0 weak / 0 title-only)

- `claim-narrative-cost`
  - NEGATIVE evidence: identity phrase "claim narrative cost" (non-generic: cost) — zero hits across 143 post-seed sources and 241 project files; 0 taggable sources, seed=1, live in-links 0, soft signals 5 (0 live-dup / 5 weak / 0 title-only)

- `engineer-autonomy`
  - NEGATIVE evidence: identity phrase "engineer autonomy" (non-generic: engineer, autonomy) — zero hits across 143 post-seed sources and 241 project files; 0 taggable sources, seed=1, live in-links 2, soft signals 0 (0 live-dup / 0 weak / 0 title-only)

- `template-admin-page`
  - NEGATIVE evidence: identity phrase "template admin page" (non-generic: NONE — full phrase only) — zero hits across 143 post-seed sources and 241 project files; 0 taggable sources, seed=3, live in-links 3, soft signals 0 (0 live-dup / 0 weak / 0 title-only)

- `pm-testing-skill`
  - NEGATIVE evidence: identity phrase "pm testing skill" (non-generic: NONE — full phrase only) — zero hits across 143 post-seed sources and 241 project files; 0 taggable sources, seed=1, live in-links 0, soft signals 3 (0 live-dup / 3 weak / 0 title-only)

## Apply commands per band

All commands run from the workspace root (`/Users/john/code/arete-reserv`). **Archive destination is `.arete/archive/topics/` — OUTSIDE the indexed tree** (per the orchestrator finding: anything under `.arete/memory/topics/` stays visible to discovery/index/lint, `_archive/` included).

### 1. refresh-with-aliases (bulk band)
```bash
arete topic add-aliases email-templates email-templates-priority pop-email-templates-go-live email-template-analytics email-template-standardization uk-email-templates email-template-rollout --refresh
arete topic add-aliases onboarding onboarding-week-1 cover-whale-onboarding liberty-mutual-onboarding mark-onboarding --refresh
arete topic refresh glance-adoption
arete topic refresh claim-narrative-action-plan
arete topic refresh cx-communications
arete topic refresh state-licensing-compliance
```

### 2. starved-taggable rescues (routable-now aliases; review the table first)

Forward aliases proposed for MORE THAN ONE page are flagged `CONFLICT` — pick one owner (or merge the pages) before adding, otherwise future flow double-integrates.

```bash
arete topic add-aliases multi-agent-prototype-sprint multi-agent prototype-sprint   # forward-only: routes future tagging; no integration now — multi-agent [CONFLICT: also multi-agent-strategy] prototype-sprint
arete topic add-aliases multi-agent-strategy multi-agent   # forward-only: routes future tagging; no integration now — multi-agent [CONFLICT: also multi-agent-prototype-sprint]
arete topic add-aliases claim-party-id-association claim-party   # forward-only: routes future tagging; no integration now
arete topic add-aliases glance-mvp-scope glance-mvp mvp-scope   # forward-only: routes future tagging; no integration now
arete topic add-aliases notion-docs notion-doc   # forward-only: routes future tagging; no integration now
arete topic add-aliases user-story-mapping story-mapping user-story   # forward-only: routes future tagging; no integration now
arete topic add-aliases engineering-team-structure engineering-team team-structure   # forward-only: routes future tagging; no integration now
arete topic add-aliases claim-narrative-feature-flag feature-flags --refresh   # +forward: feature-flag
arete topic add-aliases email-composer-rollout email-composer   # forward-only: routes future tagging; no integration now
arete topic add-aliases attachment-auto-attach auto-attach attachments-auto   # forward-only: routes future tagging; no integration now
arete topic add-aliases personal-diary-replacement personal-diary   # forward-only: routes future tagging; no integration now
arete topic add-aliases amazon-dsp-user-journey dsp-listing --refresh   # +forward: dsp-user amazon-dsp user-journey
arete topic add-aliases community-member-portal community-member   # forward-only: routes future tagging; no integration now
arete topic add-aliases amazon-alignment-tool-delay alignment-tool-redesign --refresh   # +forward: alignment-tool amazon-alignment
arete topic add-aliases claude-code-adoption claude-code   # forward-only: routes future tagging; no integration now — claude-code [CONFLICT: also claude-code-rollout]
arete topic add-aliases claude-code-rollout claude-code   # forward-only: routes future tagging; no integration now — claude-code [CONFLICT: also claude-code-adoption]
arete topic add-aliases adjuster-interviews adjuster-interview   # forward-only: routes future tagging; no integration now
arete topic add-aliases data-quality-view data-quality   # forward-only: routes future tagging; no integration now
arete topic add-aliases design-sprint-pop design-sprint   # forward-only: routes future tagging; no integration now
arete topic add-aliases acknowledgment-letter-automation acknowledgment-letter   # forward-only: routes future tagging; no integration now
arete topic add-aliases dev-tools-repo dev-tool-repo dev-tool tool-repo   # forward-only: routes future tagging; no integration now
arete topic add-aliases claims-product-advisory-panel claim-product advisory-panel   # forward-only: routes future tagging; no integration now
arete topic add-aliases email-bounce-handling email-bounce bounce-handling   # forward-only: routes future tagging; no integration now
arete topic add-aliases email-deliverability-looker-report email-deliverability looker-report   # forward-only: routes future tagging; no integration now — email-deliverability looker-report [CONFLICT: also looker-reports]
arete topic add-aliases inbound-triage-inbox triage-inbox inbound-triage   # forward-only: routes future tagging; no integration now
arete topic add-aliases cover-whale-onboarding cover-whale   # forward-only: routes future tagging; no integration now
arete topic add-aliases exposure-type-family type-family   # forward-only: routes future tagging; no integration now
arete topic add-aliases glance-staging-access staging-access glance-staging   # forward-only: routes future tagging; no integration now
arete topic add-aliases attorney-rep-logic attorney-rep   # forward-only: routes future tagging; no integration now
arete topic add-aliases automated-acknowledgment-emails acknowledgment-email automated-acknowledgment-email automated-acknowledgment   # forward-only: routes future tagging; no integration now
arete topic add-aliases claim-transfer-workflow claim-transfer   # forward-only: routes future tagging; no integration now
arete topic add-aliases file-note-structured-fields structured-fields notes-structured file-notes-structured-fields   # forward-only: routes future tagging; no integration now
arete topic add-aliases three-phase-discovery-plan discovery-plan three-phase phase-discovery   # forward-only: routes future tagging; no integration now
arete topic add-aliases amazon-marsh-policy-integration marsh policy-integration   # forward-only: routes future tagging; no integration now
arete topic add-aliases audit-history-paper-trail paper-trail audit-history   # forward-only: routes future tagging; no integration now
arete topic add-aliases belongings-vs-property-claims property-claim   # forward-only: routes future tagging; no integration now
arete topic add-aliases email-delivery-status delivery-status email-delivery   # forward-only: routes future tagging; no integration now — delivery-status [CONFLICT: also sendgrid-delivery-status] email-delivery
arete topic add-aliases liquid-template-rendering template-rendering liquid-template   # forward-only: routes future tagging; no integration now
arete topic add-aliases california-qualified-manager qualified-manager california-qualified   # forward-only: routes future tagging; no integration now
arete topic add-aliases double-bracket-bug double-brackets   # forward-only: routes future tagging; no integration now
arete topic add-aliases health-check-tool health-check   # forward-only: routes future tagging; no integration now
arete topic add-aliases pop-adjuster-assignment adjuster-assignment   # forward-only: routes future tagging; no integration now
arete topic add-aliases product-management-tools product-management   # forward-only: routes future tagging; no integration now
arete topic add-aliases project-management-workflow project-management   # forward-only: routes future tagging; no integration now
arete topic add-aliases recipient-status-indicators recipient-status status-indicator   # forward-only: routes future tagging; no integration now
arete topic add-aliases sendgrid-delivery-status delivery-status sendgrid-delivery   # forward-only: routes future tagging; no integration now — delivery-status [CONFLICT: also email-delivery-status] sendgrid-delivery
arete topic add-aliases shared-context-library shared-context context-library   # forward-only: routes future tagging; no integration now
arete topic add-aliases tdd-first-process tdd-first   # forward-only: routes future tagging; no integration now
arete topic add-aliases production-ready-column production-ready   # forward-only: routes future tagging; no integration now
arete topic add-aliases tiered-claims-routing claim-routing   # forward-only: routes future tagging; no integration now
arete topic add-aliases variable-mapping-skill variable-mapping   # forward-only: routes future tagging; no integration now
arete topic add-aliases adjuster-notifications adjuster-notification   # forward-only: routes future tagging; no integration now
arete topic add-aliases looker-reports looker-report   # forward-only: routes future tagging; no integration now — looker-report [CONFLICT: also email-deliverability-looker-report]
arete topic add-aliases pantheon-plugin-integration pantheon pantheon-plugin   # forward-only: routes future tagging; no integration now
arete topic add-aliases quill-editor-formatting quill-editor   # forward-only: routes future tagging; no integration now
arete topic add-aliases release-notes-comms release-notes   # forward-only: routes future tagging; no integration now
arete topic add-aliases rich-text-editor rich-text text-editor   # forward-only: routes future tagging; no integration now
arete topic add-aliases smartcomms-integration smartcomms   # forward-only: routes future tagging; no integration now
arete topic add-aliases ai-glance-user-stories user-stories   # forward-only: routes future tagging; no integration now
arete topic add-aliases email-cutover-timing cutover-timing email-cutover   # forward-only: routes future tagging; no integration now
arete topic add-aliases exposure-type-filtering type-filtering   # forward-only: routes future tagging; no integration now
arete topic add-aliases uk-email-templates email-template-rollout --refresh   # +forward: uk-email-template
arete topic add-aliases actions-notifications-workflows-terminology action-notification notification-workflow   # forward-only: routes future tagging; no integration now
arete topic add-aliases adjuster-ux-vision ux-vision   # forward-only: routes future tagging; no integration now
arete topic add-aliases community-portal-accessibility community-portal   # forward-only: routes future tagging; no integration now
arete topic add-aliases echeck-payment-rejection echeck-payment   # forward-only: routes future tagging; no integration now
arete topic add-aliases liberty-mutual-onboarding liberty liberty-mutual   # forward-only: routes future tagging; no integration now
arete topic add-aliases pop-auto-scope auto-scope   # forward-only: routes future tagging; no integration now
arete topic add-aliases sendgrid-block-list block-list   # forward-only: routes future tagging; no integration now
arete topic add-aliases series-c-strategy-shift series-c   # forward-only: routes future tagging; no integration now
arete topic add-aliases template-conditional-logic template-conditional conditional-logic   # forward-only: routes future tagging; no integration now
arete topic add-aliases three-layer-memory-system three-layer memory-system   # forward-only: routes future tagging; no integration now
arete topic add-aliases associated-contacts-ui contact-ui   # forward-only: routes future tagging; no integration now
arete topic add-aliases claim-sorted-competitive-threat claim-sorted   # forward-only: routes future tagging; no integration now
arete topic add-aliases claude-damage-estimation damage-estimation   # forward-only: routes future tagging; no integration now
arete topic add-aliases dns-cutover-strategy dns-cutover   # forward-only: routes future tagging; no integration now
arete topic add-aliases document-center-redesign document-center   # forward-only: routes future tagging; no integration now
arete topic add-aliases fillable-forms-digitization fillable-form   # forward-only: routes future tagging; no integration now
arete topic add-aliases glance-2-research-plan research-plan   # forward-only: routes future tagging; no integration now
arete topic add-aliases glance-user-guides user-guide   # forward-only: routes future tagging; no integration now
arete topic add-aliases khyber-evaluation khyber   # forward-only: routes future tagging; no integration now
arete topic add-aliases kyber-vendor-risk kyber   # forward-only: routes future tagging; no integration now — kyber [CONFLICT: also letters-vendor-kyber]
arete topic add-aliases letters-vendor-kyber kyber   # forward-only: routes future tagging; no integration now — kyber [CONFLICT: also kyber-vendor-risk]
arete topic add-aliases lob-mail-delivery mail-delivery   # forward-only: routes future tagging; no integration now — mail-delivery [CONFLICT: also uk-mail-delivery]
arete topic add-aliases pm-engineering-workflow engineering-workflow   # forward-only: routes future tagging; no integration now
arete topic add-aliases sendgrid-spam-filtering sendgrid-spam   # forward-only: routes future tagging; no integration now
arete topic add-aliases spam-score-ui spam-score   # forward-only: routes future tagging; no integration now
arete topic add-aliases template-slug-rename template-slug   # forward-only: routes future tagging; no integration now
arete topic add-aliases template-submission-form submission-form   # forward-only: routes future tagging; no integration now
arete topic add-aliases uk-mail-delivery mail-delivery   # forward-only: routes future tagging; no integration now — mail-delivery [CONFLICT: also lob-mail-delivery]
arete topic add-aliases vercel-deploy-checks vercel   # forward-only: routes future tagging; no integration now
arete topic add-aliases workflows-engine workflow-engine   # forward-only: routes future tagging; no integration now
```

### 3. project-fed — NO commands (keep frozen)

These 23 pages stay in place as landing pads. Feed the list into the Phase-12 / published-doc-sync prioritization: `claude-enterprise-limits`, `comms-domain-ownership`, `declination-letters`, `diary-dropdown-labels`, `document-tagging`, `email-automation-reminders`, `email-open-tracking`, `email-send-failure-handling`, `email-spam-fix`, `email-templates-priority`, `fraud-identification-gap`, `funds-diversion-risk`, `glance-eoy-segmentation`, `ops-template-process`, `para-directory-structure`, `pm-skills-library`, `pop-release`, `qmd-semantic-search`, `runyan-board-strategy`, `template-customization-workarounds`, `template-hotkey-workarounds`, `testing-strategy-skill`, `toast-notifications`.

### 4a. absorptions implied by band 1 (archive the absorbed pages)
```bash
mkdir -p .arete/archive/topics
mv .arete/memory/topics/email-template-analytics.md .arete/archive/topics/email-template-analytics.md && echo "email-template-analytics.md -> .arete/archive/topics/email-template-analytics.md (merged into email-templates; alias added) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/email-template-standardization.md .arete/archive/topics/email-template-standardization.md && echo "email-template-standardization.md -> .arete/archive/topics/email-template-standardization.md (merged into email-templates; alias added) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/onboarding-week-1.md .arete/archive/topics/onboarding-week-1.md && echo "onboarding-week-1.md -> .arete/archive/topics/onboarding-week-1.md (merged into onboarding; alias added) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/pop-email-templates-go-live.md .arete/archive/topics/pop-email-templates-go-live.md && echo "pop-email-templates-go-live.md -> .arete/archive/topics/pop-email-templates-go-live.md (merged into email-templates; alias added) $(date +%F)" >> .arete/archive/topics/LEDGER.md
```

### 4b. merges into live partners (after hand-review approval, per pair)
```bash
arete topic add-aliases tdd claim-transfer-tdd --refresh && \
  mv .arete/memory/topics/claim-transfer-tdd.md .arete/archive/topics/claim-transfer-tdd.md && \
  echo "claim-transfer-tdd.md -> .arete/archive/topics/claim-transfer-tdd.md (merged into tdd; alias added) $(date +%F)" >> .arete/archive/topics/LEDGER.md
arete topic add-aliases rollout-strategy email-rollout-strategy --refresh && \
  mv .arete/memory/topics/email-rollout-strategy.md .arete/archive/topics/email-rollout-strategy.md && \
  echo "email-rollout-strategy.md -> .arete/archive/topics/email-rollout-strategy.md (merged into rollout-strategy; alias added) $(date +%F)" >> .arete/archive/topics/LEDGER.md
arete topic add-aliases doi-fraud-language fraud-language --refresh && \
  mv .arete/memory/topics/fraud-language.md .arete/archive/topics/fraud-language.md && \
  echo "fraud-language.md -> .arete/archive/topics/fraud-language.md (merged into doi-fraud-language; alias added) $(date +%F)" >> .arete/archive/topics/LEDGER.md
```

### 5. archive (HIGH bulk + accepted MEDIUM)
```bash
mkdir -p .arete/archive/topics
mv .arete/memory/topics/attachment-sync.md .arete/archive/topics/attachment-sync.md && echo "attachment-sync.md -> .arete/archive/topics/attachment-sync.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/automated-receipt-acknowledgment.md .arete/archive/topics/automated-receipt-acknowledgment.md && echo "automated-receipt-acknowledgment.md -> .arete/archive/topics/automated-receipt-acknowledgment.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/certified-mail-compliance.md .arete/archive/topics/certified-mail-compliance.md && echo "certified-mail-compliance.md -> .arete/archive/topics/certified-mail-compliance.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/comms-stakeholder-forum.md .arete/archive/topics/comms-stakeholder-forum.md && echo "comms-stakeholder-forum.md -> .arete/archive/topics/comms-stakeholder-forum.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/compliance-admin-panel.md .arete/archive/topics/compliance-admin-panel.md && echo "compliance-admin-panel.md -> .arete/archive/topics/compliance-admin-panel.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/cx-stakeholder-inclusion.md .arete/archive/topics/cx-stakeholder-inclusion.md && echo "cx-stakeholder-inclusion.md -> .arete/archive/topics/cx-stakeholder-inclusion.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/duplicate-policyholder-bug.md .arete/archive/topics/duplicate-policyholder-bug.md && echo "duplicate-policyholder-bug.md -> .arete/archive/topics/duplicate-policyholder-bug.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/embedded-help.md .arete/archive/topics/embedded-help.md && echo "embedded-help.md -> .arete/archive/topics/embedded-help.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/escalations-tracking.md .arete/archive/topics/escalations-tracking.md && echo "escalations-tracking.md -> .arete/archive/topics/escalations-tracking.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/feedback-collection.md .arete/archive/topics/feedback-collection.md && echo "feedback-collection.md -> .arete/archive/topics/feedback-collection.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/guide-rollout.md .arete/archive/topics/guide-rollout.md && echo "guide-rollout.md -> .arete/archive/topics/guide-rollout.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/haiku-opus-architecture.md .arete/archive/topics/haiku-opus-architecture.md && echo "haiku-opus-architecture.md -> .arete/archive/topics/haiku-opus-architecture.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/letter-vendor-evaluation.md .arete/archive/topics/letter-vendor-evaluation.md && echo "letter-vendor-evaluation.md -> .arete/archive/topics/letter-vendor-evaluation.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/meeting-consolidation.md .arete/archive/topics/meeting-consolidation.md && echo "meeting-consolidation.md -> .arete/archive/topics/meeting-consolidation.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/notion-restructure.md .arete/archive/topics/notion-restructure.md && echo "notion-restructure.md -> .arete/archive/topics/notion-restructure.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/playwright-mcp-testing.md .arete/archive/topics/playwright-mcp-testing.md && echo "playwright-mcp-testing.md -> .arete/archive/topics/playwright-mcp-testing.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/pop-2-0-redesign.md .arete/archive/topics/pop-2-0-redesign.md && echo "pop-2-0-redesign.md -> .arete/archive/topics/pop-2-0-redesign.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/pop-adjuster-workflow.md .arete/archive/topics/pop-adjuster-workflow.md && echo "pop-adjuster-workflow.md -> .arete/archive/topics/pop-adjuster-workflow.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/pop-eu-launch.md .arete/archive/topics/pop-eu-launch.md && echo "pop-eu-launch.md -> .arete/archive/topics/pop-eu-launch.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/sendgrid-configuration.md .arete/archive/topics/sendgrid-configuration.md && echo "sendgrid-configuration.md -> .arete/archive/topics/sendgrid-configuration.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/smartcoms-integration.md .arete/archive/topics/smartcoms-integration.md && echo "smartcoms-integration.md -> .arete/archive/topics/smartcoms-integration.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/snapsheet-file-note-sync.md .arete/archive/topics/snapsheet-file-note-sync.md && echo "snapsheet-file-note-sync.md -> .arete/archive/topics/snapsheet-file-note-sync.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/snapsheet-task-replacement.md .arete/archive/topics/snapsheet-task-replacement.md && echo "snapsheet-task-replacement.md -> .arete/archive/topics/snapsheet-task-replacement.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/template-field-reordering.md .arete/archive/topics/template-field-reordering.md && echo "template-field-reordering.md -> .arete/archive/topics/template-field-reordering.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/tricera-templates.md .arete/archive/topics/tricera-templates.md && echo "tricera-templates.md -> .arete/archive/topics/tricera-templates.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/workflow-tool-integration.md .arete/archive/topics/workflow-tool-integration.md && echo "workflow-tool-integration.md -> .arete/archive/topics/workflow-tool-integration.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/ai-claims-automation.md .arete/archive/topics/ai-claims-automation.md && echo "ai-claims-automation.md -> .arete/archive/topics/ai-claims-automation.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/claim-narrative-cost.md .arete/archive/topics/claim-narrative-cost.md && echo "claim-narrative-cost.md -> .arete/archive/topics/claim-narrative-cost.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/claim-narrative-disruption.md .arete/archive/topics/claim-narrative-disruption.md && echo "claim-narrative-disruption.md -> .arete/archive/topics/claim-narrative-disruption.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/cx-adjuster-boundaries.md .arete/archive/topics/cx-adjuster-boundaries.md && echo "cx-adjuster-boundaries.md -> .arete/archive/topics/cx-adjuster-boundaries.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/default-recipients.md .arete/archive/topics/default-recipients.md && echo "default-recipients.md -> .arete/archive/topics/default-recipients.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/email-rollout-kpis.md .arete/archive/topics/email-rollout-kpis.md && echo "email-rollout-kpis.md -> .arete/archive/topics/email-rollout-kpis.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/email-rollout-phasing.md .arete/archive/topics/email-rollout-phasing.md && echo "email-rollout-phasing.md -> .arete/archive/topics/email-rollout-phasing.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/engineer-autonomy.md .arete/archive/topics/engineer-autonomy.md && echo "engineer-autonomy.md -> .arete/archive/topics/engineer-autonomy.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/intake-interface-prototype.md .arete/archive/topics/intake-interface-prototype.md && echo "intake-interface-prototype.md -> .arete/archive/topics/intake-interface-prototype.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/letter-system-roadmap.md .arete/archive/topics/letter-system-roadmap.md && echo "letter-system-roadmap.md -> .arete/archive/topics/letter-system-roadmap.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/pm-testing-skill.md .arete/archive/topics/pm-testing-skill.md && echo "pm-testing-skill.md -> .arete/archive/topics/pm-testing-skill.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/portal-user-sync.md .arete/archive/topics/portal-user-sync.md && echo "portal-user-sync.md -> .arete/archive/topics/portal-user-sync.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/template-admin-page.md .arete/archive/topics/template-admin-page.md && echo "template-admin-page.md -> .arete/archive/topics/template-admin-page.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
mv .arete/memory/topics/voyager-policy-seeding.md .arete/archive/topics/voyager-policy-seeding.md && echo "voyager-policy-seeding.md -> .arete/archive/topics/voyager-policy-seeding.md (archived) $(date +%F)" >> .arete/archive/topics/LEDGER.md
```

### 6. post-apply
```bash
arete index            # regenerate index.md (archived pages drop out)
arete topic lint       # measure dangling-link delta vs baseline 149
```

### Rollback ledger format (`.arete/archive/topics/LEDGER.md`)
```
<page>.md -> .arete/archive/topics/<page>.md (archived|merged into <canonical>) <YYYY-MM-DD>
```
Rollback = `mv` the file back to `.arete/memory/topics/` per ledger line, remove any alias added in the same line's merge, re-run `arete index`.

## Appendix — dangling-link fallout detail

- [[attachment-sync]] ← email-delivery-status, glance-staging-access
- [[automated-receipt-acknowledgment]] ← community-portal-accessibility, quill-editor-formatting, template-customization-workarounds
- [[certified-mail-compliance]] ← pop-email-templates
- [[comms-stakeholder-forum]] ← email-bounce-handling, email-deliverability-looker-report, email-deliverability, sendgrid-block-list
- [[compliance-admin-panel]] ← doi-fraud-language, fillable-forms-digitization, state-licensing-compliance
- [[cx-stakeholder-inclusion]] ← actions-notifications-workflows-terminology, glance-2-discovery, personal-diary-replacement, three-phase-discovery-plan
- [[duplicate-policyholder-bug]] ← associated-contacts-ui, claim-party-id-association, dev-tools-repo
- [[embedded-help]] ← notion-docs
- [[escalations-tracking]] ← pop-email-templates
- [[feedback-collection]] ← contact-prohibited, pop-rollout
- [[guide-rollout]] ← notion-docs
- [[haiku-opus-architecture]] ← adjuster-personas, dc-whiteboarding-workshop, design-sprint-pop, lovable-prototyping
- [[letter-vendor-evaluation]] ← khyber-evaluation, lob-mail-delivery, smartcomms-integration, template-conditional-logic, uk-mail-delivery
- [[meeting-consolidation]] ← signature-logic
- [[notion-restructure]] ← claude-code-adoption, email-composer-rollout, email-template-playbook
- [[playwright-mcp-testing]] ← default-email-template, double-bracket-bug, release-notes-comms, uk-email-templates
- [[pop-2-0-redesign]] ← belongings-vs-property-claims, claude-damage-estimation, fraud-identification-gap, tiered-claims-routing
- [[pop-adjuster-workflow]] ← audit-history, glance-adoption, liability-determination, task-management
- [[pop-eu-launch]] ← claim-narrative-action-plan, file-note-structured-fields, kyber-vendor-risk, pop-adjuster-assignment
- [[sendgrid-configuration]] ← email-bounce-handling, liquid-template-rendering
- [[smartcoms-integration]] ← cover-whale-templates, declination-letters, glance-staging-access
- [[snapsheet-file-note-sync]] ← email-delivery-status, glance-email-composer, glance-staging-access
- [[snapsheet-task-replacement]] ← audit-history-paper-trail, claim-narrative-action-plan, file-note-structured-fields, kyber-vendor-risk
- [[template-field-reordering]] ← attorney-rep-logic, contact-prohibited, pop-rollout
- [[tricera-templates]] ← pop-email-templates
- [[workflow-tool-integration]] ← community-member-portal, email-automation-reminders, snapsheet-automation
- [[ai-claims-automation]] ← belongings-vs-property-claims, claude-damage-estimation, fraud-identification-gap, tiered-claims-routing
- [[claim-narrative-cost]] ← adjuster-personas, dc-whiteboarding-workshop, design-sprint-pop, lovable-prototyping
- [[cx-adjuster-boundaries]] ← adjuster-shadowing, email-composer-rollout, note-templates-standardization
- [[default-recipients]] ← template-attachments, template-variable-mapping
- [[email-rollout-kpis]] ← email-composer-rollout
- [[email-rollout-phasing]] ← cover-whale-onboarding, exposure-type-family
- [[engineer-autonomy]] ← adjuster-shadowing, leap-rollout, pop-release
- [[intake-interface-prototype]] ← adjuster-shadowing, leap-rollout, note-templates-standardization, variable-mapping-skill
- [[letter-system-roadmap]] ← doi-fraud-language, fillable-forms-digitization, signature-logic, state-licensing-compliance
- [[pm-testing-skill]] ← claude-code-adoption
- [[portal-user-sync]] ← glance-email-composer, snapsheet-migration, template-cleanup
- [[template-admin-page]] ← cover-whale-templates, looker-reports, signature-logic, template-cleanup, template-filtering
- [[voyager-policy-seeding]] ← claim-clear, claim-portal-comms, rich-text-editor
- [[claim-transfer-tdd]] ← claim-portal-comms, document-center-redesign, mark-onboarding
- [[email-rollout-strategy]] ← email-bounce-handling, liquid-template-rendering
- [[email-template-analytics]] ← acknowledgment-letter-automation, email-composer-rollout, exposure-type-filtering, health-check-tool, workflows-engine
- [[email-template-standardization]] ← default-email-template, double-bracket-bug, release-notes-comms, uk-email-templates
- [[fraud-language]] ← adjuster-notifications, communications-tab, cover-whale-templates, email-template-rollout, glance-2-vision, inbound-email-handling, pop-rollout, rollout-strategy, signature-logic
- [[onboarding-week-1]] ← comms-domain-ownership
- [[pop-email-templates-go-live]] ← cover-whale-onboarding, exposure-type-family, ml-roadmap
