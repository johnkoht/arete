---
title: Introduce A Recorder Agnostic Post Processing C Reus
slug: introduce-a-recorder-agnostic-post-processing-c-reus
status: draft
size: large
created: 2026-02-17T16:22:45.821Z
updated: 2026-02-19T01:16:01.170Z
completed: null
has_review: true
has_pre_mortem: false
has_prd: true
steps: 8
tags: []
---

Great direction — your answers make the architecture much cleaner.

Plan:
1. **Introduce a recorder-agnostic post-processing contract** — Define a normalized meeting payload and post-processing interface that all meeting-recorders can use after raw fetch/transform.
   - AC: A shared type exists for “normalized meeting import data” (title/date/transcript/summary/action items/attendees/source metadata).
   - AC: A post-processor interface exists (e.g., `processMeetingContent(...)`) and does not reference Fathom-specific fields.
   - AC: Existing Fathom flow can pass through this contract without behavior change when processing is disabled.

2. **Add reusable integration processing config (not Fathom-specific)** — Extend integration config model to support generic `processing` options for meeting-recorders.
   - AC: Config supports `generate_summary`, `summary_source`, `keep_provider_summary`, `summary_model`, `max_transcript_chars`.
   - AC: Defaults preserve current behavior when `processing` is absent.
   - AC: Config parsing is resilient (invalid/missing values fall back to safe defaults, no crash).

3. **Build transcript summary generation service as a shared core service** — Add a reusable service that generates an Areté summary from transcript text with guardrails.
   - AC: Service accepts transcript + options + provider context, returns summary + provenance metadata.
   - AC: Service enforces transcript length guardrails (`max_transcript_chars`) and deterministic fallback path.
   - AC: Service failure is non-fatal and returns structured fallback signal.

4. **Implement summary precedence and provider-summary retention rules** — Apply your chosen behavior: Areté summary is primary; provider summary retained as `[provider]_summary`.
   - AC: Primary `summary` field is populated by Areté-generated summary when generation succeeds.
   - AC: Provider summary is retained in a provider-scoped field (e.g., `fathom_summary`) when available.
   - AC: “Hybrid” semantics are implemented as: Areté primary + provider reference (not merged text).

5. **Integrate into Fathom pull pipeline via the shared processor** — Wire Fathom importer to use the generic post-processing layer, proving reusability without baking logic into Fathom client code.
   - AC: `arete pull fathom` uses post-processing when enabled by config.
   - AC: If transcript missing/empty or summary generation fails, system falls back to provider summary for primary `summary`.
   - AC: Pull still saves meetings even if summarization fails; warning is surfaced in pull result.

6. **Update save/template pipeline for dual-summary + provenance metadata** — Ensure meeting file rendering supports primary summary plus provider summary and generation metadata.
   - AC: Template mapping supports `summary` and provider-specific summary fields.
   - AC: Metadata includes provenance fields (e.g., summary source/model/generated timestamp/provider).
   - AC: Existing meeting files remain readable and compatible; old template variables still resolve safely.

7. **Add comprehensive tests for reusable behavior and fallback matrix** — Cover config, precedence, and resiliency at service + integration levels.
   - AC: Tests cover: processing off, processing on with transcript, missing transcript fallback, generation error fallback, provider-summary retention, precedence rules.
   - AC: Tests validate Fathom path uses shared abstraction (not duplicated custom logic).
   - AC: Backward compatibility tests confirm unchanged behavior when feature disabled.

8. **Document rollout and configuration usage** — Update integration docs/config examples to show recorder-agnostic processing with Fathom