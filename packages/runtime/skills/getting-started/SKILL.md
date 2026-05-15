---
name: getting-started
description: Get started with Areté - proactive web research + guided conversation that bootstraps your workspace in 30-45 minutes
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

A research-first onboarding flow that gets a new user from empty workspace to first meaningful value in 30-45 minutes. The agent researches the user's company from the web, asks targeted questions instead of starting from scratch, drafts context files, and delivers a first win.

## When to Use

- User just installed Areté and has an empty workspace
- User says "Let's get started" or "Help me set up"
- User is new to Areté and needs guided setup

## When NOT to Use

- Workspace is already populated: 3+ context files contain content beyond bracket placeholders
  - Check for patterns like `[Add`, `[How`, `[List`, `[Who`, `[Describe` — these indicate unfilled templates, not real content
- User wants to import historical data (use `seed-context` tool instead)
- User needs help with a specific skill (route to that skill)

---

## Workflow Overview

```
Profile Check → Consent → Web Research → Present & Discuss → Draft & Review → Integration Scavenge → First Win → Graduation
```

**Total time**: 30-45 minutes

---

## Phase 1: Profile Check

Check `context/profile.md` to determine what we already know.

### If profile.md exists with company + website populated

```
Welcome back, [Name]! I see you're at [Company].
Let me research your company so I can ask smarter questions instead of starting from scratch.
```

Skip to Phase 2.

### If profile.md exists without website

```
I see you're at [Company]. What's your company website?
This lets me research before we dive in, so I can ask smarter questions instead of starting from scratch.

(paste URL, or "skip" to tell me everything yourself)
```

After collecting website, store it in `context/profile.md` and proceed to Phase 2.

### If no profile.md exists

```
I'll help you set up your workspace. This takes about 30 minutes.
Let me get to know you first:

- What's your name?
- What's your work email?
- What company are you at?
- What's your company website?
```

Store all fields in `context/profile.md` (see Profile Storage section). Proceed to Phase 2.

---

## Phase 2: Consent + Disambiguation

### 2a. Consent Checkpoint

Before any web research, get explicit consent:

```
I'll research [Company] online to save you time — I'll check your website, look for public info about your product, market, and competitors. This uses public web data only.

OK to proceed, or prefer to tell me everything yourself?
```

**If user declines**: Skip to Phase 4 in "guided fallback mode" (see below).

### 2b. Company Disambiguation

Only needed if company name is generic/ambiguous AND no website URL was provided:

```
I found several companies named [X]:
  1. [X] — [description]
  2. [X] — [description]
Which one is you?
```

If a website URL was provided, skip disambiguation entirely — use the URL as the source of truth.

---

## Phase 3: Web Research

Narrate progress with specific status lines so the user sees activity:

```
Researching [Company]...
  Checking your website... found product and about pages
  Searching for competitor data... found 3 alternatives
  Research complete. Here's what I found:
```

### Research Strategy — Lean Budget (5 WebSearch + 3 WebFetch)

Start with 3 core searches, escalate only if results are thin:

| Priority | WebSearch Query | Purpose |
|---|---|---|
| 1 | `"[Company] site:[domain]"` (if URL known) | Index company's own pages |
| 2 | `"[Company] what does [company] do"` | General description |
| 3 | `"[Company] competitors alternatives"` | Competitive landscape |
| 4 (if thin) | `"[Company] customers use cases"` | Users/personas |
| 5 (if thin) | `"[Company] funding revenue pricing"` | Business model |

### WebFetch Targets (max 3)

| Priority | Target | Purpose |
|---|---|---|
| 1 | Company homepage | Core description, positioning |
| 2 | About or Product page | Products, team, mission |
| 3 (if found) | One third-party source | External perspective |

### Blocked Domains (login-gated — use search snippets only)

- crunchbase.com
- g2.com
- capterra.com
- linkedin.com
- glassdoor.com

### Timeouts

- **Target**: 2 minutes total research time
- **Max**: 3 minutes
- **Per WebFetch**: Skip if no response in 15 seconds

### Graceful Degradation Ladder

| Level | Condition | Action |
|---|---|---|
| 1 | Full research works | Proceed with findings to Phase 4 |
| 2 | WebFetch fails but search works | Use snippets only, note lower confidence |
| 3 | Search returns thin results | Run 1-2 more searches (priority 4-5), proceed with what we have |
| 4 | Everything fails | "I couldn't research [Company] online. Let me learn from you directly." → guided fallback |
| 5 | User skipped consent | → guided fallback |

### WebFetch Note

WebFetch responses are processed through a fast model and return summaries, not raw HTML. Treat these as hints, not verified facts. Always confirm accuracy with the user.

---

## Phase 4: Present Findings + Targeted Conversation

### 4a. Opening Summary

```
Here's what I found about [Company]:

**Company**: [1-2 sentences]
**Product**: [product name/description]
**Market**: [industry/category]
**Competitors**: [2-3 names if found]
**Stage**: [if found]

How accurate is this? Anything major I got wrong?
```

### 4b. "Draft Everything" Escape Hatch

Offer right after the summary:

```
Want to walk through each area, or should I draft everything based on what I found and you review the files directly?
```

If user chooses draft-everything → skip conversation blocks, proceed directly to Phase 5 using research data.

### 4c. Targeted Conversation — 3 Batched Blocks

If walking through, present one block at a time and wait for response before moving to the next.

**Block 1: Company + Business Model** (feeds → business-overview.md + business-model.md)

```
For your company context, I have: [summary of research findings].

To fill gaps:
- What stage is [Company] at? (early, growth, mature)
- Current strategic focus this quarter?
- Pricing model — per seat? Usage-based? Enterprise?
- Do you have a company deck or strategy doc? Drop it in inbox/ if so.
- Any domain acronyms or internal terminology I should know?
```

**Block 2: Product + Users** (feeds → products-services.md + users-personas.md)

```
For products and users, I found: [summary of research findings].

To round this out:
- Products or features I missed? Current roadmap focus?
- Who are your primary user personas? (role, workflow, pain points)
- How do they find and evaluate your product?
```

**Block 3: Competitive Landscape** (feeds → competitive-landscape.md)

```
For competitors, I found: [list from research].

To sharpen:
- Competitors I missed? Especially ones you track internally?
- How do you position against [top competitor]?
- Any market trends affecting your category?
```

### Conversation Rules

- **One block at a time** — wait for response before presenting the next
- **"Skip" moves on** — don't press if user wants to skip a block
- **Inbox integration** — if user drops docs in inbox/ during conversation, pause, invoke `rapid-context-dump`, then resume
- **Offer once**: "You can also drop docs into inbox/ and I'll extract from those."
- **Target 4-6 exchanges total** — keep it tight

### Guided Fallback Mode

Used when research was skipped (Phase 2 decline) or failed (degradation level 4-5). Same 3-block structure but open-ended:

- **Block 1**: "Tell me about [Company] — what you do, your business model, current stage"
- **Block 2**: "What do you build? Who are your users and what problems do they have?"
- **Block 3**: "Who are your main competitors? How do you differentiate?"

Same conversation rules apply.

---

## Phase 5: Draft & Review

Generate draft context files using the `<!-- [DRAFT] -->` header format from rapid-context-dump.

### Files to Generate

| File | Location | When |
|---|---|---|
| Business Overview | `context/business-overview.md` | Always |
| Products/Services | `context/products-services.md` | If extractable |
| Users/Personas | `context/users-personas.md` | If extractable |
| Competitive Landscape | `context/competitive-landscape.md` | If extractable |
| Business Model | `context/business-model.md` | If extractable (net-new file) |

### Review Checklist

Present the checklist after drafting:

```
I've drafted your context files:

- [ ] context/business-overview.md — [one-line summary]
- [ ] context/products-services.md — [one-line summary]
- [ ] context/users-personas.md — [one-line summary]
- [ ] context/competitive-landscape.md — [one-line summary]
- [ ] context/business-model.md — [one-line summary]

Walk through one at a time, or review on your own and tell me when to promote them?
```

Only list files that were actually generated. Use the same promotion flow as rapid-context-dump: user reviews, confirms, then draft header is removed.

---

## Phase 6: Integration Scavenge (optional)

Check connected integrations via `arete.yaml` and `arete credentials show`.

```
Let me check what's connected...

  ✓ Google Calendar — connected
  ✓ Krisp — connected
  ✗ Notion — not configured

I can:
  • Pull last 30 days of recordings from Krisp
  • Scan calendar for meeting patterns + build people directory

Want me to pull this data? Or skip — you can always do this later.
```

**Quick seed only** — pull 30 days of data max. Don't over-commit to a long import.

If user has calendar connected and wants meeting-prep, offer to start calendar connection early so meeting-prep works in Phase 7.

---

## Phase 7: First Win

Route to the most valuable skill based on what's available:

### If calendar/meetings connected
```
Let's try meeting-prep. Who's your next important meeting with?
```
Guide through meeting-prep skill.

### If docs were dumped via inbox/
```
Want to synthesize your context into actionable insights?
```
Guide through synthesize skill.

### If starting fresh
Fold goals and current work into week-plan:
```
Let's plan your week — this will also capture your current goals and priorities.
What are you focused on this quarter? What's on your plate this week?
```
Guide through week-plan skill.

---

## Phase 8: Graduation

```
You're all set! Your workspace is ready.

What you've accomplished:
- ✓ Context files drafted from web research + your input
- ✓ [N] context files reviewed and promoted
- ✓ [Integration] history imported (if applicable)
- ✓ First skill used successfully

Your workspace is no longer empty. The agent now knows your business.

What to do next:
- Start your day with "Plan my day" (daily-plan)
- After meetings: "Process my meetings" (process-meetings)
- Drop files into inbox/ anytime — run "inbox triage" to classify
- For more data: "seed my context from [integration]"

Need help? Say "What can Areté do?" or "Give me a tour"
```

---

## Profile Storage (Contract Compliance)

Profile fields are captured in Phase 1. Store immediately after collection.

**Required for Contract v1**:
- `profile.name` — User's name (for personalization)
- `profile.email` — Work email (for People Intelligence matching)
- `profile.company` — Company name
- `profile.role` — User's role (ask if not volunteered)

**Required for web research**:
- `profile.website` — Company website URL (for domain extraction + research targeting)

Store in `context/profile.md`:
```markdown
---
name: [Name]
email: [Email]
company: [Company]
role: [Role]
website: [URL]
created: [ISO date]
---

# Profile

Personal context for Areté personalization.

## Identity
- **Name**: [Name]
- **Email**: [Email]
- **Company**: [Company]
- **Role**: [Role]
- **Website**: [URL]
```

**Note**: If user ran `arete onboard` CLI first, profile.md may already exist. Merge any new fields rather than overwriting.

---

## Contract Compliance

This skill implements Contract v1 requirements:

| Contract Field | Captured? | Location |
|---|---|---|
| `profile.name` | Yes | `context/profile.md` |
| `profile.email` | Yes | `context/profile.md` |
| `profile.company` | Yes | `context/profile.md` |
| `profile.role` | Yes | `context/profile.md` |
| `profile.website` | Yes | `context/profile.md` |

These fields enable downstream People Intelligence (Phase 2) functionality and web research targeting.

**Email importance**: Used for internal vs external classification and entity matching in People Intelligence.

---

## Tips for Success

1. **Research first, ask second** — The web research makes every question more targeted
2. **Narrate progress** — Never leave the user staring at silence during research
3. **One block at a time** — Don't dump all questions at once
4. **Draft, don't finalize** — Mark generated files as drafts; user reviews and promotes
5. **One first-win** — Don't overwhelm. One skill demo is enough.
6. **Time-box** — Target 45 min max. If research is slow, fall back gracefully.
7. **Trust but verify** — Web research is hints, not facts. Always confirm with the user.

---

## Related Skills

- `rapid-context-dump` — Invoked when user drops docs in inbox/ during onboarding
- `workspace-tour` — For users who want to explore first
- `meeting-prep` — Common first-win skill
- `week-plan` — Good first-win for fresh workspaces
