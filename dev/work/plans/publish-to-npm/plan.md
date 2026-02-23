---
title: Publish arete-workspace to npmjs
slug: publish-to-npm
status: draft
size: medium
created: 2026-02-17T21:00:00Z
updated: 2026-02-23T00:26:53.161Z
completed: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 3
tags: []
---

Perfect — I can clean it up first.

You’re correct: there are currently **6 broken links** in `memory/MEMORY.md`, and git history indicates these were **not deleted** (they appear to have been referenced without corresponding entry files ever being committed).

Broken references:
1. `2026-02-10_synthesize-improvement-recommendations.md`
2. `2026-02-19_work-directory-cleanup-learnings.md`
3. `2026-02-20_catalog-agent-wiring.md`
4. `2026-02-21_qmd-improvements-learnings.md`
5. `2026-02-21_qmd-improvements-review-fixes.md`
6. `2026-02-22_onboard-setup-unification-learnings.md`

This is a **small** cleanup (2–3 steps), low risk; no pre-mortem needed.

Plan:
1. **Audit and classify each missing MEMORY link**
   - For each of the 6 missing entries, check commit history and related plan/PRD artifacts to confirm whether:
     - (a) entry should exist and is missing, or
     - (b) MEMORY index line should be removed/rewritten.
   - **AC:** Each missing link has a disposition decision with source evidence (commit/plan path).

2. **Repair `memory/MEMORY.md` index integrity**
   - Update the index so every `entries/...md` link resolves to an existing file.
   - For references that cannot be restored from existing artifacts, remove or replace the broken line with an accurate existing entry.
   - **AC:** Zero broken `entries/*.md` links in `memory/MEMORY.md`.

3. **Add a guardrail check to prevent recurrence**
   - Add a lightweight test/check script (or documented verification step) that validates MEMORY index links before merge.
   - **AC:** One reproducible validation command exists and passes locally.

If you want, I’ll proceed with this cleanup first, then we’ll return to the npm publish plan.