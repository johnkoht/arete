---
title: Dev Agent
slug: dev-agent
status: building
size: small
tags: [hotfix, quality, process]
created: 2026-03-10T01:35:37.013Z
updated: 2026-03-10T02:07:43.936Z
completed: null
execution: null
has_review: false
has_pre_mortem: true
has_prd: false
steps: 3
---

Now I understand the full picture. Let me draft a plan:

---

## Problem Summary

When bugs are discovered after planned work, agents attempt "quick fixes" without structure, often breaking more things. The current execution path decision tree sends "tiny" work direct, but bugs are deceptively complex.

**Success criteria**: 
- Agents follow a structured process for bug fixes (diagnose → plan → fix → review → close)
- User can simply say "yes, fix it" and the process kicks in
- No more "quick fixes" that create regressions

---

## Plan:

**Size: Small (3 steps)**

### 1. Create the hotfix skill
**Path**: `.pi/skills/hotfix/SKILL.md`

Define the structured bug fix process:

**Phase 1: Diagnose** (agent adopts eng lead mindset)
- Read the bug report / user description
- Load relevant expertise profile(s) based on affected code
- Check LEARNINGS.md in affected directories
- Identify: root cause hypothesis, affected files, risks, test coverage
- Present analysis + game plan to user

**Phase 2: Implement** (after user approval)
- Apply fix following the game plan
- Run quality gates (typecheck, tests)
- Commit with proper message

**Phase 3: Review** (spawn reviewer)
- Spawn reviewer agent for code review
- Include: what was fixed, files changed, test coverage
- Iterate if reviewer returns ITERATE

**Phase 4: Close**
- Update LEARNINGS.md if regression/gotcha was discovered
- Brief summary to user (what was fixed, tests added, files changed)

**Acceptance Criteria**:
- [ ] Skill file exists with clear workflow
- [ ] Triggers include: "fix this bug", "yes fix it", "please fix", user approves a bug fix
- [ ] Uses existing agent definitions (reviewer.md for the spawn)
- [ ] References expertise profiles for domain context
- [ ] Includes LEARNINGS.md check and update steps

### 2. Add skill to AGENTS.md sources
**Path**: `.agents/sources/builder/skills-index.md`

Add hotfix skill entry with appropriate triggers:
```
|hotfix:{triggers:"User reports a bug and asks to fix it; yes fix it; please fix this; after bug diagnosis when user approves the fix",does:"Structured bug fix process: diagnose (as eng lead), implement, spawn reviewer, close with LEARNINGS.md update. Lighter than PRD but ensures quality."}
```

Run `npm run build:agents:dev` to rebuild AGENTS.md.

**Acceptance Criteria**:
- [ ] Skill appears in [Skills] section of AGENTS.md
- [ ] Triggers are specific enough to match bug fix scenarios
- [ ] Distinguishes from plan-mode skills

### 3. Update execution path guidance
**Path**: Update `.pi/standards/build-standards.md` or create guidance

Add to the execution path decision tree:

```
User reports a bug
 └─ Agent diagnoses, presents game plan
    └─ User approves → Load hotfix skill, follow structured process
```

And add explicit guidance:
> **Bug fixes require structure.** When a user reports a bug and approves a fix, load the `hotfix` skill and follow its process. Do not make ad-hoc code changes without diagnosis, review, and close-out.

**Acceptance Criteria**:
- [ ] Execution path decision tree includes bug fix path
- [ ] Clear statement that hotfix skill is required (not optional) for bug fixes
- [ ] Agents reading standards will understand when to use hotfix skill

---

## What This Achieves

**Before**: Agent dives in → breaks things → user frustrated

**After**: 
1. "I found a bug..." 
2. Agent diagnoses (with expertise, LEARNINGS.md)
3. "Here's what I found: [analysis]. Ready to fix?"
4. "Yes, fix it" → Agent loads hotfix skill
5. Implements fix → Spawns reviewer → Closes out with docs

The structure is lighter than execute-prd but ensures:
- Proper diagnosis before coding
- Domain expertise is loaded
- Code review happens
- LEARNINGS.md is updated
- No more cowboy fixes

---

**Size assessment**: Small (3 steps). Would you like me to proceed, or should we discuss any aspect further?