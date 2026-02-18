---
title: Onboarding Improvements
slug: onboarding-improvements
status: building
size: large
created: 2026-02-18T03:12:45.227Z
updated: 2026-02-18T17:33:09.883Z
completed: null
has_review: true
has_pre_mortem: true
has_prd: true
backlog_ref: null
steps: 5
---

Absolutely—great next step.

I can’t directly write `dev/autonomous/prd.json` in Plan Mode, but here’s a ready-to-paste **Phase 2 PRD JSON** for the autonomous loop.

Plan:
1. Back up current Phase 1 task file (`dev/autonomous/prd.json`) to archive so you can roll back if needed.
2. Replace `dev/autonomous/prd.json` with the Phase 2 draft below.
3. Run `/build` to start the autonomous loop for Stream C (People Intelligence MVP).
4. Monitor with `/build status` and verify quality gates (`npm run typecheck`, `npm test`) before marking complete.
5. After completion, validate against child PRD ACs in `dev/prds/onboarding-improvements/child-people-intelligence-mvp.md` and decide whether to proceed to Phase 3.

```json
{
  "name": "onboarding-improvements-phase2",
  "branchName": "feature/onboarding-improvements",
  "goal": "Implement Phase 2: People Intelligence MVP (Stream C) with unknown queue defaults, evidence-backed recommendations, digest review UX, and KPI visibility.",
  "userStories": [
    {
      "id": "c1-people-intelligence-skill-scaffold",
      "title": "Create people-intelligence skill scaffold",
      "description": "Create packages/runtime/skills/people-intelligence/SKILL.md defining triggers, scope, unknown queue behavior, and non-blocking review flow. Follow existing skill conventions.",
      "acceptanceCriteria": [
        "SKILL.md exists at packages/runtime/skills/people-intelligence/",
        "Skill description aligns to Stream C and Phase 2 scope",
        "Triggers cover user intents for people triage/classification",
        "Out-of-scope items explicitly exclude Phase 3 enrichment/policy tuning",
        "Skill is independently routable without requiring Stream A/B runtime coupling"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0
    },
    {
      "id": "c2-classification-data-model",
      "title": "Implement uncertainty-safe people classification model",
      "description": "Introduce or extend model structures to support multi-dimensional classification: affiliation (internal/external), role lens (customer/user/partner/unknown), and tracking intent (track/defer/ignore), with explicit unknown state.",
      "acceptanceCriteria": [
        "Data model supports unknown state as first-class value",
        "Model supports mixed identities without forced single-label assumptions",
        "Low-confidence outputs are representable without coercion to customer/user",
        "Type safety is preserved (no any), and NodeNext import conventions are respected",
        "Unit tests cover happy path, mixed identity, and unknown/edge cases"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0,
      "dependencies": [
        "c1-people-intelligence-skill-scaffold"
      ]
    },
    {
      "id": "c3-evidence-backed-suggestion-payload",
      "title": "Implement recommendation payload with confidence and evidence",
      "description": "Implement suggestion output contract that includes recommendation, confidence score, rationale text, evidence snippets, and source pointers/artifact references.",
      "acceptanceCriteria": [
        "Every recommendation includes confidence + rationale + evidence snippets",
        "Source pointers/artifact refs are included for traceability",
        "Recommendations missing evidence are flagged as non-auto-recommended",
        "Fallback behavior works when source hints are sparse or missing",
        "Tests validate payload schema and traceability requirements"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0,
      "dependencies": [
        "c2-classification-data-model"
      ]
    },
    {
      "id": "c4-unknown-queue-threshold-routing",
      "title": "Add unknown queue and threshold-based default routing",
      "description": "Implement queueing/routing logic so low-confidence classifications default to unknown queue, with no forced customer default behavior.",
      "acceptanceCriteria": [
        "Unknown queue exists as a first-class destination",
        "Low-confidence classifications always route to unknown queue by default",
        "No forced customer default occurs when confidence is below threshold",
        "Threshold behavior is deterministic and documented",
        "Regression tests prove uncertain entities are not force-classified"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0,
      "dependencies": [
        "c3-evidence-backed-suggestion-payload"
      ]
    },
    {
      "id": "c5-digest-review-default-ux",
      "title": "Implement batch/digest review as default non-blocking flow",
      "description": "Implement default review mode as digest/batch rather than per-person interruptions, ensuring workflows remain non-blocking.",
      "acceptanceCriteria": [
        "Default review mode is digest/batch",
        "Per-person interruptive prompts are not the primary flow",
        "User workflow continues without forced immediate triage",
        "Review output still preserves evidence and confidence context",
        "Tests validate default mode and non-blocking behavior"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0,
      "dependencies": [
        "c4-unknown-queue-threshold-routing"
      ]
    },
    {
      "id": "c6-contract-consumption-and-graceful-degradation",
      "title": "Consume Stream A/B contracts with graceful degradation",
      "description": "Consume profile/domain hints from Streams A/B when present and degrade gracefully when hints are unavailable.",
      "acceptanceCriteria": [
        "Consumes profile fields from Stream A contract when available",
        "Consumes domain/company hints from Stream B contract when available",
        "If hints are missing, behavior degrades gracefully without failure",
        "Classification falls back to evidence-first logic with unknown queue where needed",
        "Tests cover both hint-rich and hint-sparse scenarios"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0,
      "dependencies": [
        "c5-digest-review-default-ux"
      ]
    },
    {
      "id": "c7-kpi-instrumentation-and-visibility",
      "title": "Add KPI instrumentation for Phase 2 success metrics",
      "description": "Implement measurable outputs for misclassification rate, triage burden, and interruption complaints, suitable for weekly MVP phase reviews.",
      "acceptanceCriteria": [
        "Misclassification rate is measurable from generated outputs",
        "Triage burden is measurable (time/volume proxy or equivalent)",
        "Interruption complaints signal is tracked for review",
        "Metric outputs are documented and accessible for phase-gate decisions",
        "Tests validate metric calculation/output integrity"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0,
      "dependencies": [
        "c6-contract-consumption-and-graceful-degradation"
      ]
    },
    {
      "id": "phase2-validation",
      "title": "Phase 2 validation and quality gates",
      "description": "Run full quality gates and validate Phase 2 acceptance criteria against the child PRD and umbrella PRD independent-ship constraints.",
      "acceptanceCriteria": [
        "npm run typecheck passes",
        "npm test passes",
        "People Intelligence flow satisfies child PRD acceptance criteria 1-6",
        "Default review flow remains non-blocking and unknown queue behavior is verified",
        "Stream C demonstrates graceful degradation when Stream A/B hints are missing"
      ],
      "status": "pending",
      "passes": false,
      "attemptCount": 0,
      "dependencies": [
        "c7-kpi-instrumentation-and-visibility"
      ]
    }
  ],
  "metadata": {
    "createdAt": "2026-02-18T11:15:23.000Z",
    "totalTasks": 8,
    "completedTasks": 0,
    "failedTasks": 0
  }
}
```

If you want, next I can draft a matching `dev/autonomous/progress.txt` Phase 2 starter template so your `/build` run has clean tracking from the first loop.