# Getting Started with Areté

> **Quick Start Checklist** - For detailed documentation, see [GUIDE.md](GUIDE.md) in your workspace.

## Fastest Path (5 minutes)

### 1. Set up your profile

```bash
arete onboard
```

This asks for your name, email, and company — enabling personalized experiences and smarter meeting prep.

### 2. Continue in chat

Say **"Let's get started"** to the AI agent. It will guide you through:

- Importing your existing docs/context
- Connecting integrations (calendar, Fathom)
- Getting your first quick win

That's it! The conversational onboarding handles the rest.

---

## Manual Setup (Alternative)

If you prefer to set things up yourself:

### Fill in Basic Context

Start with these three files—just the essentials:

- [ ] **`context/business-overview.md`** - Company name, mission, what you do
- [ ] **`context/users-personas.md`** - Who uses your product
- [ ] **`context/products-services.md`** - What you're building

### Take a Tour

- [ ] Ask the AI: **"Give me a tour"** or **"How does this workspace work?"**

### Try a Quick Action

Pick one to test:

- [ ] **"What's on my plate today?"** - Get today's priorities
- [ ] **"Start a discovery project for [topic]"** - Begin exploring a problem
- [ ] **"Prep for my meeting with [person]"** - Meeting preparation

---

## Optional Setup (30-60 minutes)

### Search (Recommended)

QMD provides semantic search across all your content.

```bash
bun install -g https://github.com/tobi/qmd
qmd collection add ~/path/to/arete --name arete
qmd embed
```

*See SETUP.md → "Set Up QMD" for full instructions*

### Calendar (macOS or Google)

Connect your calendar for automatic meeting context.

```bash
# macOS Calendar
brew install ical-buddy
arete integration configure calendar

# Google Calendar
arete integration configure google-calendar

# Test either provider
arete pull calendar --today
```

*See SETUP.md → "Calendar Setup" for details (including Google unverified-app warning steps).*

### Integrations

Configure integrations during onboarding or anytime after:

```bash
arete onboard                            # Includes integration setup
arete integration configure fathom       # Meeting recordings
arete integration configure calendar     # Calendar sync
```

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
- [ ] Explore **`.agents/skills/`** to see available workflows
- [ ] Check **`README.md`** for full feature list

---

## Need Help?

- **"Give me a tour"** - Interactive workspace walkthrough
- **"What can I do here?"** - List available actions
- **Ask questions** - The AI knows this workspace inside and out
