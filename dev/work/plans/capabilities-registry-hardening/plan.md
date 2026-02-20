---
title: Capabilities Registry Hardening
slug: capabilities-registry-hardening
status: idea
size: unknown
tags: [improvement]
created: 2026-02-20T03:47:16Z
updated: 2026-02-20T03:47:16Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Capabilities Registry Hardening

**Added**: 2026-02-18  
**Priority**: Medium  
**Status**: Backlog / Needs design

## Problem

Agents can misclassify local customizations as built-in platform behavior (example: assuming `.pi/extensions/plan-mode` is Pi core).

Memory entries capture history but are not optimized for quick, structured capability discovery.

## Current baseline

A minimal machine-friendly registry now exists:

- `dev/catalog/capabilities.json`
- `dev/catalog/README.md`

This should be treated as seed coverage, not complete coverage.

## Goal

Create a thorough, durable capability inventory that agents reliably consult before changing tools/services/extensions.

## Proposed scope

1. **Coverage expansion**
   - Inventory all build-time tooling capabilities (Pi extensions, rules systems, agent config, key integrations, external packages we rely on)
   - Mark provenance clearly: `built | customized | external`
   - Add usage signal: `active | occasional | dormant`

2. **Schema hardening**
   - Add lightweight schema validation (`id`, `type`, `provenance`, `status`, paths, read-before-change)
   - Add required `lastVerified` and `owner`
   - Define deprecation lifecycle for stale capabilities

3. **Workflow integration**
   - Add checklist step in plan execution/review flow: consult registry before tool/service changes
   - Add periodic audit cadence (monthly or per major PRD)
   - Require registry update in PRs that alter listed capabilities

4. **Drift prevention**
   - Add specific checks for known drift pairs (e.g., `.cursor/rules/*` vs `.pi/APPEND_SYSTEM.md`)
   - Add a maintenance note when provenance is unknown and needs confirmation

## Why this matters

- Reduces agent confusion and false assumptions
- Improves change safety by making dependencies explicit
- Speeds planning/review by providing a single source of truth

## Suggested next step

Convert this backlog item into a small PRD focused on:

- schema + validation,
- workflow hooks,
- first full inventory pass.

## Related

- `dev/catalog/capabilities.json`
- `dev/backlog/decisions/cursor-vs-pi-dev-agent.md`
- `memory/MEMORY.md`
