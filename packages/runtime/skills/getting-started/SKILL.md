---
name: getting-started
description: Get started with Areté - conversational setup that bootstraps your workspace in 15-30 minutes
category: core
work_type: operations
requires_briefing: false
triggers:
  - "Let's get started"
  - "Help me set up Areté"
  - "Help me setup arete"
  - "Help me set up my workspace"
  - "Set up Areté"
  - "I'm new to Areté"
  - "Get started"
  - "Onboard me to Areté"
  - "Getting started"
---

# Getting Started

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

Present questions with numbered options. Users can respond with:
- Full text answers
- Shorthand like "Q1: 1,3" to select options 1 and 3
- Just numbers if context is clear (e.g., "1 and 3")

---

**Q0: Identity** *(Required — skip if user ran `arete onboard` CLI)*

```
Before we dive in, let me get to know you:
  a) What's your name?
  b) What's your work email?
  c) What company are you at?
```

*Check if `context/profile.md` exists with real values. If so, greet by name and skip to Q1.*

---

**Q1: Data Sources**

```
What data sources do you have access to? (select all that apply)

  1. Calendar (meetings scheduled)
  2. Meeting recordings (Fathom, Grain, etc.)
  3. Existing docs/notes (strategy docs, PRDs, research)
  4. Company website I can share
  5. None yet - starting fresh

Reply with numbers (e.g., "1, 3") or "Q1: 1, 3"
```

---

**Q2: Immediate Need**

```
What do you want to accomplish first?

  1. Prep for upcoming meetings
  2. Document product strategy
  3. Organize existing research
  4. Build a roadmap
  5. Not sure - want to explore

Reply with a number or describe what you need.
```

---

**Q3: Context Readiness**

```
Do you have existing content you can share now?

  1. Yes, I have docs/notes to paste or drop
  2. Yes, I have a company website URL
  3. No, but I can answer questions now
  4. I need time to gather materials

Reply with a number (e.g., "Q3: 1") or just describe your situation.
```

---

## Phase 2: Path Selection

Based on discovery answers, route to the appropriate path:

### Path Routing Logic

| Q1 Answer | Q3 Answer | Route to |
|-----------|-----------|----------|
| Has docs (3) or website (4) | Ready to share (1, 2) | **Path A** |
| Has calendar/recordings (1, 2) | Not ready (3, 4) | **Path C** |
| None/starting fresh (5) | Any | **Path B** |
| Any | Can answer questions (3) | **Path B** |

---

### Path A: Data Dump (Context Dump)
**Triggers**: Q1 includes 3 or 4, AND Q3 is 1 or 2

```
Perfect! Let's get your context into the workspace.

You can:
  1. Paste content directly in chat
  2. Share your company website URL
  3. Drop files into inputs/onboarding-dump/ folder

Which would you like to start with?
```

Route to `rapid-context-dump` skill. After completion, return for first-win.

---

### Path B: Guided Input
**Triggers**: Q3 is 3 (can answer questions), OR Q1 is 5 (starting fresh)

Ask 5-7 structured questions to build context:

```
I'll ask a few questions to build your context. Answer what you can:

  B1. What's your company/product in one sentence?
  B2. Who are your users? What problems do they have?
  B3. What's your top goal this quarter?
  B4. Who are your main competitors? (optional)
  B5. What's your biggest PM challenge right now? (optional)

Take them one at a time, or answer several at once.
```

From answers, draft:
- `context/business-overview.md`
- `context/users-personas.md`
- `goals/strategy.md`

Mark drafts with `[DRAFT - please review]` header.

---

### Path C: Integration First
**Triggers**: Q1 includes 1 or 2 (calendar/recordings), AND Q3 is 3 or 4 (not ready with docs)

```
Let's connect your calendar. Which do you prefer?

1. **Apple Calendar** — Syncs with macOS Calendar app (iCloud, Google, Outlook via system sync)
2. **Google Calendar** — Direct connection via OAuth

(Reply with 1 or 2, or "skip" to continue without calendar)
```

**If user chooses Apple (1)**:
1. Run via bash: `arete integration configure calendar --all`
2. On success, run: `arete pull calendar --days 7`
3. Confirm: "Calendar connected! Found [X] upcoming events."

**If user chooses Google (2)**:
1. Explain: "This will open your browser for Google authorization."
2. Run via bash: `arete integration configure google-calendar --all`
   - Command blocks until OAuth completes
3. On success, run: `arete pull calendar --days 7`
4. Confirm: "Calendar connected! Found [X] upcoming events."

**If user skips**: Continue to Path B (guided input) for context.

**On failure**: Show error and offer to skip: "Calendar setup failed. Would you like to continue without calendar, or try again?"

After integration setup, fall back to Path B (guided input) for context.

---

## Phase 3: Profile Storage (Contract Compliance)

Profile fields are captured in Discovery (Q0). Store them immediately after discovery:

**Required for Contract v1**:
- `profile.name` — User's name (for personalization)
- `profile.email` — Work email (for People Intelligence matching)
- `profile.company` — Company name
- `profile.role` — User's role (ask if not volunteered)

**Optional (ask during path routing if relevant)**:
- `profile.website` — Company website URL (for domain extraction)

Store in `context/profile.md`:
```markdown
---
name: [Name]
email: [Email]
company: [Company]
role: [Role]
website: [URL if provided]
created: [ISO date]
---

# Profile

Personal context for Areté personalization.

## Identity
- **Name**: [Name]
- **Email**: [Email]
- **Company**: [Company]
- **Role**: [Role]
```

**Note**: If user ran `arete onboard` CLI first, profile.md may already exist. Merge any new fields rather than overwriting.

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
Let's plan your week. This will create `now/week.md` with your priorities.

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
- Start your day at `now/` — scratchpad.md for quick notes, week.md for priorities
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
| `profile.email` | Yes | `context/profile.md` |
| `profile.company` | Yes | `context/profile.md` |
| `profile.role` | Yes | `context/profile.md` |
| `profile.website` | Optional | `context/profile.md` |

These fields enable downstream People Intelligence (Phase 2) functionality.

**Email importance**: Used for internal vs external classification and entity matching in People Intelligence.
