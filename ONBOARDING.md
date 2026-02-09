# Getting Started with Areté

A quick checklist to get you up and running.

> **Note**: We're building an `arete onboard` command that will guide you through a personalized onboarding plan. For now, follow this checklist.

## First Steps (15 minutes)

### 1. Fill in Basic Context

Start with these three files—just the essentials to get going:

- [ ] **`context/business-overview.md`** - Company name, mission, what you do
- [ ] **`context/users-personas.md`** - Who uses your product
- [ ] **`context/products-services.md`** - What you're building

*These files give the AI context about your work. You can always expand them later.*

### 2. Take a Tour

- [ ] Ask the AI: **"Give me a tour"** or **"How does this workspace work?"**

*The workspace-tour skill will orient you to what's available.*

### 3. Try a Quick Action

Pick one to test the workspace:

- [ ] **"What's on my plate today?"** - Get today's focus and priorities
- [ ] **"Start a discovery project for [topic]"** - Begin exploring a problem
- [ ] **Save a meeting** - Paste meeting notes and say "save this meeting"

---

## Optional Setup (30-60 minutes)

### Search (Recommended)

QMD provides semantic search across all your content.

- [ ] **Install QMD**: `bun install -g https://github.com/tobi/qmd`
- [ ] **Create collection**: `qmd collection add ~/path/to/arete --name arete`
- [ ] **Generate embeddings**: `qmd embed`

*See SETUP.md → "Set Up QMD" for full instructions*

### Calendar (macOS only)

Connect your calendar for automatic meeting context.

- [ ] **Install ical-buddy**: `brew install ical-buddy`
- [ ] **Configure**: `arete integration configure calendar`
- [ ] **Test**: `arete pull calendar --today`

*See SETUP.md → "Calendar Setup" for details*

### Strategy & Planning

Set up your strategic context for goal planning.

- [ ] **`goals/strategy.md`** - Org strategy, OKRs, pillars
- [ ] **Try quarter planning**: "Set my quarter goals"
- [ ] **Try week planning**: "Plan my week"

---

## Common Actions

Once you're set up, here's what you can do:

| What You Want | What to Say |
|---------------|-------------|
| **Prep for a meeting** | "Prep for my meeting with [person]" |
| **Start work** | "Start a discovery project for [topic]"<br>"Create a PRD for [feature]" |
| **Process meetings** | "Process my meetings" (updates people & memory) |
| **Quick capture** | Add notes to `now/scratchpad.md` |
| **Find past work** | "What do we know about [topic]?" |
| **Plan your time** | "What's on my plate today?"<br>"Plan my week" |

---

## What's Where

Quick reference for the workspace structure:

```
now/          → Current focus, scratchpad, today's plan
goals/        → Strategy, quarter goals, initiatives
context/      → Business context (source of truth)
projects/     → Active and archived PM work
resources/    → Raw inputs (meetings, notes)
people/       → Colleagues, customers, users
.arete/       → System memory (decisions, learnings)
```

---

## Next Steps

- [ ] Read **SETUP.md** for comprehensive setup (QMD, calendar, MCP integrations)
- [ ] Explore **`.cursor/skills/`** to see available workflows
- [ ] Check **`README.md`** for full feature list

---

## Need Help?

- **"Give me a tour"** - Interactive workspace walkthrough
- **"What can I do here?"** - List available actions
- **Ask questions** - The AI knows this workspace inside and out
