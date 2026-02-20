---
title: Slack Integration
slug: slack-integration
status: draft
size: large
created: 2026-02-18T19:59:27.611Z
updated: 2026-02-18T22:28:55.549Z
completed: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 8
tags: []
---

100% agree — this should be a **first-class mode**, not an edge case.

If user intent is “just extract decisions/ideas/actions,” people mapping must be optional and non-blocking.

### Product recommendation

Add two explicit processing modes:

1. **Insights-only (default for many users)**
   - Parse thread
   - Extract summary/decisions/actions/questions/risks
   - Save conversation artifact
   - Skip people intelligence entirely

2. **Insights + People**
   - Run same insights flow
   - Then run people mapping/intelligence pass

### “Remember this” behavior
Yes — remember user preference at workspace level, with per-run override.

- Preference key idea: `conversation.defaultPeopleMode = "off" | "ask" | "on"`
- Suggested default: `"ask"` initially, then let user set:
  - “Always skip people”
  - “Always ask me”
  - “Always run people mapping”

---

### CLI UX tweak (mock)

```bash
arete conversation capture --stdin
```

```text
Detected conversation content.
People intelligence is currently: ASK
Run people mapping/intelligence? [y]es / [n]o / [a]lways yes / [s]always skip
> n

✓ Running insights-only mode
✓ Extracted: summary, decisions, action items, open questions, risks
✓ Saved: resources/conversations/2026-02-18-onboarding-thread.md
```

Override flags:
- `--people-mode off`
- `--people-mode ask`
- `--people-mode on`

---

### Chat UX tweak

If user pastes thread with no extra instructions:
- Agent asks once:  
  “Do you want just insights, or insights + people mapping?”
- Include “remember this for next time?” quick follow-up.

If user says:
- “Just summarize this thread” → auto insights-only
- “Also update people context” → insights + people

---

Plan:
1. Add explicit processing modes: `insights-only` and `insights+people`.
2. Make people flow optional and never required for successful save.
3. Add workspace preference for default people mode (`off|ask|on`).
4. Add per-run overrides in CLI and chat intent detection.
5. Add “remember this choice” UX after first/changed selection.
6. Update Phase 1 PRD scope/ACs to include successful insights-only path.
7. Add metrics split by mode (usage, completion, satisfaction, save rate).
8. Validate with users who prefer “just extract decisions” to ensure low friction.

If you want, I can draft a **PRD patch section** right now with exact wording for scope, requirements, and AC updates.