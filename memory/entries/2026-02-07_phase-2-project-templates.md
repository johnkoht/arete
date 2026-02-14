# Phase 2: Project Templates (Product OS)

**Date**: 2026-02-07
**Branch**: `feature/product-os-architecture`

## What changed

Added directory-based project templates for the four work types from the Product OS vision, plus roadmap. Each template includes a README with phase guide checklist and a tailored folder structure (inputs/, working/, outputs/).

## Templates created

### 1. Discovery (`templates/projects/discovery/`)

- **Phases**: Frame → Collect → Synthesize → Conclude
- **Structure**: inputs/ (interviews, data, research), working/ (synthesis, hypotheses), outputs/ (findings)
- **README**: Goal, background, key questions, hypotheses table, success criteria

### 2. Definition (`templates/projects/definition/`)

- **Phases**: Problem statement → Solution design → Requirements → Success criteria → Risks
- **Structure**: inputs/, working/, outputs/ (PRD or spec)
- **README**: Goal, discovery reference, stakeholders, success criteria
- **Skill alignment**: create-prd now uses `project_template: definition` (was prd)

### 3. Delivery (`templates/projects/delivery/`)

- **Phases**: Scope → Rollout plan → Comms → Launch brief
- **Structure**: inputs/, working/, outputs/ (launch brief, rollout doc)
- **README**: What's shipping, out of scope, rollout plan, success criteria

### 4. Analysis (`templates/projects/analysis/`)

- **Phases**: Research scope → Data gathering → Comparison → Findings → Recommendations
- **Structure**: inputs/, working/, outputs/ (e.g. competitive-analysis.md)
- **README**: Research questions, scope options, success criteria
- **Skill alignment**: competitive-analysis now uses `project_template: analysis` (was competitive-analysis)

### 5. Roadmap (`templates/projects/roadmap/`)

- **Phases**: Gather inputs → Candidate initiatives → Prioritize → Draft roadmap → Review and communicate
- **Structure**: inputs/, working/, outputs/ (roadmap.md)
- **README**: Planning period, success criteria
- **Skill alignment**: construct-roadmap keeps `project_template: roadmap`

## Implementation details

- Each template directory contains README.md plus inputs/, working/, outputs/ with .gitkeep so the structure is real when copied.
- Phase checklists are lightweight ("check off as you go, or ignore") per vision.
- Existing flat files (discovery.md, prd.md, roadmap.md, competitive-analysis.md, strategy-review.md) remain in templates/projects/ for backward compatibility; directory templates are the preferred scaffold for new projects.

## Files touched

- `templates/projects/discovery/README.md`, `inputs/.gitkeep`, `working/.gitkeep`, `outputs/.gitkeep`
- `templates/projects/definition/` (same structure)
- `templates/projects/delivery/` (same structure)
- `templates/projects/analysis/` (same structure)
- `templates/projects/roadmap/` (same structure)
- `.cursor/skills/create-prd/SKILL.md` (project_template: prd → definition)
- `.cursor/skills/competitive-analysis/SKILL.md` (project_template: competitive-analysis → analysis)
