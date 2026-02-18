---
name: onboarding
description: Get started with Areté - conversational setup that bootstraps your workspace in 15-30 minutes
category: core
work_type: activation
requires_briefing: false
triggers:
  - "Let's get started"
  - "Help me set up Areté"
  - "Onboard me"
  - "I'm new to Areté"
  - "Set up my workspace"
  - "Get started with Areté"
---

# Onboarding Skill

A conversational onboarding flow that gets a new user from empty workspace to first meaningful value in 15-30 minutes.

## When to Use

- User just installed Areté and has an empty workspace
- User says "Let's get started" or "Help me set up"
- User is new to Areté and needs guided setup

## When NOT to Use

- Workspace is already populated with context
- User wants to import historical data (use `seed-context` tool instead)
- User needs help with a specific skill (route to that skill)

---

## Workflow Overview

```
Discovery (2-3 min) → Path Selection → Context Bootstrap (10-15 min) → First Win (5-10 min) → Graduation
```

**Total time**: 15-30 minutes

---

## Phase 1: Discovery (2-3 minutes)

Start with a warm welcome, then ask 3-4 key questions to understand the user's situation.

### Opening

```
Great! I'll help you set up your workspace. This takes about 15-30 minutes 
and will get you to your first valuable use of Areté.

First, a few questions to understand your situation...
```

### Discovery Questions

**Q1: Data Sources**
> What data sources do you have access to?
> - [ ] Calendar (meetings scheduled)
> - [ ] Meeting recordings (Fathom, Grain, etc.)
> - [ ] Existing docs/notes (strategy docs, PRDs, research)
> - [ ] Company website
> - [ ] None yet - starting fresh

**Q2: Immediate Need**
> What do you want to accomplish first?
> - [ ] Prep for upcoming meetings
> - [ ] Document product strategy
> - [ ] Organize existing research
> - [ ] Build a roadmap
> - [ ] Not sure - want to explore

**Q3: Context Readiness**
> Do you have existing content you can share now?
> - [ ] Yes, I have docs/notes to paste or drop
> - [ ] Yes, I have a company website URL
> - [ ] No, but I can answer questions
> - [ ] I need time to gather materials

---

## Phase 2: Path Selection

Based on discovery answers, route to the appropriate path:

### Path A: Data Dump (Context Dump)
**Triggers**: User has docs, website URL, or content to share

Route to `rapid-context-dump` skill with handoff:

```
Perfect! Let's get your context into the workspace.

I'll hand you off to the context dump flow. You can:
- Paste content directly
- Share your company website URL
- Drop files into inputs/onboarding-dump/

[Invoke rapid-context-dump skill]
```

After context dump completes, return here for first-win.

### Path B: Guided Input
**Triggers**: User doesn't have docs but can answer questions now

Ask 5-7 structured questions to build context:

1. **Company/Product**: What's your company or product?
2. **Users**: Who are your users? What problems do they have?
3. **Value Prop**: What problem does your product solve?
4. **Goals**: What are your top 2-3 goals this quarter?
5. **Competitors**: Who are your main competitors?
6. **Team**: Who do you work with closely? (optional)
7. **Challenges**: What's your biggest PM challenge right now? (optional)

From answers, draft:
- `context/business-overview.md`
- `context/users-personas.md`
- `goals/strategy.md`

Mark drafts with `[DRAFT - please review]` header.

### Path C: Integration First
**Triggers**: User has calendar/Fathom but no docs ready

Guide integration setup:

```
Let's connect your integrations first, then add context.

1. Run: arete configure calendar
2. Once connected: arete pull calendar --days 7

After that, I'll help you add business context.
```

After integration setup, fall back to Path B (guided input) for context.

---

## Phase 3: Profile Capture (Contract Compliance)

Before proceeding to first-win, capture minimal profile fields for downstream use:

**Required for Contract v1**:
- `profile.name` — User's name (for personalization)
- `profile.role` — User's role (PM, founder, etc.)
- `profile.company` — Company name

**Capture approach**:
```
Quick question before we continue:
- What's your name?
- What's your role? (e.g., PM, founder, product lead)
- What company are you at?
```

Store in `context/profile.md`:
```markdown
---
name: [Name]
role: [Role]
company: [Company]
created: [ISO date]
---

# Profile

Personal context for Areté personalization.
```

---

## Phase 4: First Win (5-10 minutes)

Based on what's set up, suggest and guide the first valuable skill use:

### If calendar/meetings connected:
```
Let's try meeting-prep. Who's your next important meeting with?

[Guide through meeting-prep skill]
```

### If docs were dumped:
```
Want to synthesize your context into actionable insights?

[Guide through synthesize skill with their inputs]
```

### If starting fresh / guided input:
```
Let's plan your week based on your goals.

[Guide through week-plan skill]
```

---

## Phase 5: Graduation

Celebrate completion and provide next steps:

```
🎉 You're all set! Your workspace is ready.

**What you've accomplished:**
- ✓ Context files populated
- ✓ [Integration] connected (if applicable)  
- ✓ First skill used successfully

**What to do next:**
- Try `daily-plan` before tomorrow's meetings
- Run `process-meetings` after your next meeting
- Explore more: Ask "What can Areté do?" or "Show me all skills"
- Customize: Edit context files as your work evolves

**Need help?** Say "Help with [skill name]" or "What should I do?"
```

---

## Tips for Success

1. **Keep it conversational** — This isn't a form. React to user answers.
2. **Don't over-ask** — 3-4 discovery questions max. Get to value quickly.
3. **Draft, don't finalize** — Mark generated files as drafts. User reviews.
4. **One first-win** — Don't overwhelm. One skill demo is enough.
5. **Time-box** — Target 30 min max. If user is slow, that's fine, but don't add steps.

---

## Related Skills

- `rapid-context-dump` — For Path A data ingestion
- `workspace-tour` — For users who want to explore first
- `meeting-prep` — Common first-win skill
- `week-plan` — Good first-win for fresh workspaces

---

## Contract Compliance

This skill implements Contract v1 requirements:

| Contract Field | Captured? | Location |
|---|---|---|
| `profile.name` | Yes | `context/profile.md` |
| `profile.role` | Yes | `context/profile.md` |
| `profile.company` | Yes | `context/profile.md` |

These fields enable downstream People Intelligence (Phase 2) functionality.
