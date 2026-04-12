# Getting Started — Learnings

## WebSearch/WebFetch as a First-Use Pattern

This is the first Areté skill to use WebSearch + WebFetch for proactive data gathering. Key patterns established here:

### WebSearch may be US-only
WebSearch availability varies by region. The skill MUST implement a graceful fallback — if search fails entirely, switch to guided fallback mode (direct user questions). Never let a search failure block onboarding.

### WebFetch returns summaries, not raw HTML
WebFetch processes pages through a fast model and returns summaries. Treat these as **hints, not verified facts**. Always confirm key findings with the user before writing them to context files. Do not quote WebFetch output as authoritative.

### Blocked domains return login walls
These domains gate content behind login and return useless HTML: crunchbase.com, g2.com, capterra.com, linkedin.com, glassdoor.com. Use search snippets for these sources instead of fetching. This list should be updated as new login-gated sources are discovered.

### Lean research budget (5+3) is intentional
The budget of 5 WebSearch calls + 3 WebFetch calls was chosen deliberately. More calls add latency without proportional value — each additional search returns increasingly marginal information while adding 2-5 seconds. Start with 3 core searches and only escalate if results are thin.

### Always narrate research progress
Web research takes 30-90 seconds. Without progress narration, users see a silent wait and assume something is broken. Always emit status lines: "Checking your website...", "Searching for competitors...", etc. This is a UX requirement, not optional polish.

### Consent before research is non-negotiable
Even though web research uses only public data, the consent checkpoint in Phase 2 must always run. Users should know what data sources are being accessed. The only exception is when rapid-context-dump is invoked from getting-started (consent already obtained upstream).
