# UI Customization Notes

## Problem Statement
End users want to add shortcuts/buttons for their custom skills (e.g., "daily winddown", "weekly winddown") to the dashboard or other parts of the Areté UI.

## Current State
- Web UI is React with hardcoded dashboard sections
- No existing mechanism for users to customize UI or add skill shortcuts
- Skills exist in `.agents/skills/` but have no UI representation

---

## Design Options

### Option 1: Config-driven "Quick Actions" panel
**Lowest lift, solves the immediate use case**

```yaml
# arete.yaml
dashboard:
  quick_actions:
    - skill: daily-winddown
      label: "Daily Winddown"
      icon: sunset  # optional, from icon library
    - skill: weekly-winddown
      label: "Weekly Winddown"
      icon: calendar-check
```

Implementation:
1. Backend serves config via `/api/config/dashboard`
2. Dashboard renders a "Quick Actions" card from config
3. Button click could:
   - Copy prompt to clipboard (`"Run the daily-winddown skill"`)
   - Open IDE with skill pre-loaded (if deep linking added)
   - Trigger backend endpoint for headless execution

**Pros**: Simple, declarative, no code changes for users
**Cons**: Limited to skill invocation, fixed layout

---

### Option 2: Widget system with slots
**More flexible, more investment**

```yaml
dashboard:
  widgets:
    - type: skill-button
      slot: sidebar
      config:
        skill: daily-winddown
        label: "🌅 Daily Winddown"
    - type: custom-list
      slot: main
      config:
        title: "My Rituals"
        items:
          - {skill: daily-winddown, label: "Daily"}
          - {skill: weekly-winddown, label: "Weekly"}
```

**Pros**: Flexible, multiple widget types
**Cons**: More complex config, need to define widget types

---

### Option 3: Plugin/extension model
**Most powerful, highest investment**

- Users write React components or use a DSL
- Components loaded dynamically from `.agents/ui/`
- Full control over rendering, data, actions

**Pros**: Unlimited customization
**Cons**: Users need code skills, bundling complexity, security

---

## Recommendation

Start with **Option 1** (Quick Actions panel):
- ~50 lines of config schema
- One new API endpoint
- One new Dashboard component
- Directly solves the skill shortcut use case
- Config can be designed forward-compatible for Option 2

---

## Open Questions
- [ ] What should clicking a skill button do? (copy prompt vs. execute vs. open IDE)
- [ ] Should we support other dashboard sections or just Quick Actions?
- [ ] Icon library — use existing lucide-react or allow custom?
- [ ] Should this extend to sidebar navigation too?
