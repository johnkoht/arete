# PRD: Getting Started Web Research Enhancement

## Overview

Enhance the getting-started skill to proactively research the user's company via web search (WebSearch + WebFetch) before asking onboarding questions. This transforms onboarding from a generic Q&A into a research-informed, targeted conversation.

## Tasks

### Task 1: Rewrite getting-started/SKILL.md
- **File**: `packages/runtime/skills/getting-started/SKILL.md`
- **Action**: Complete rewrite with new 8-phase flow
- **AC**: 
  - Frontmatter preserved (triggers, category, name) with updated description
  - Phase 1: Profile check with skip logic
  - Phase 2: Consent + disambiguation
  - Phase 3: Web research with lean budget (5 WebSearch + 3 WebFetch)
  - Phase 4: Present findings + targeted conversation (3 batched blocks)
  - Phase 5: Draft & review with checklist
  - Phase 6: Integration scavenge
  - Phase 7: First win routing
  - Phase 8: Graduation
  - Graceful degradation ladder for all failure modes
  - Guided fallback mode when research skipped/failed
  - "When NOT to Use" guard checks 3+ context files

### Task 2: Update rapid-context-dump/SKILL.md
- **File**: `packages/runtime/skills/rapid-context-dump/SKILL.md`
- **Action**: Add pre-researched context as 5th input type
- **AC**:
  - New row in Phase 2 Input Types table
  - Section explaining pre-researched context handling
  - New fallback matrix entry

### Task 3: Update GUIDE.md
- **File**: `packages/runtime/GUIDE.md`
- **Action**: Replace "First 15 Minutes" section with "First 30 Minutes"
- **AC**: Updated section reflects web research flow

### Task 4: Update skills-index.md
- **File**: `.agents/sources/guide/skills-index.md`
- **Action**: Update getting-started description
- **AC**: Description mentions web research

### Task 5: Regenerate dist/AGENTS.md
- **Command**: `npx tsx scripts/build-agents.ts prod`
- **AC**: dist/AGENTS.md reflects updated skill descriptions

### Task 6: Create LEARNINGS.md
- **File**: `packages/runtime/skills/getting-started/LEARNINGS.md`
- **Action**: Document WebSearch/WebFetch patterns
- **AC**: Covers all 6 learning items from spec
