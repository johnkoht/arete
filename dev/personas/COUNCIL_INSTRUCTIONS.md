# Council Instructions

Operating manual for invoking the Persona Council during BUILD MODE planning. The council pressure-tests user-facing features against three behavioral archetypes before they are built.

## When to Invoke

Invoke when a feature involves any of:
- A step the user must take (input, confirmation, configuration)
- A workflow the user moves through
- A prompt or dialog presented to the user
- A default behavior that affects the user's experience

Do not invoke for:
- Internal architecture decisions with no user-facing surface
- Build tooling and developer experience
- Bug fixes with no UX change

## How to Run a Council Check

For each persona (Harvester, Architect, Preparer), answer three questions:
1. Would they use this feature?
2. What is their friction threshold for this specific step?
3. What is the right default — on, off, ask, or skip?

Be specific. Vague reactions are not useful.

Too vague: "The Harvester might find this friction-heavy."
Right: "The Harvester will hit this confirmation dialog during an active meeting and close the tab. This step needs to be removed or deferred to a background process."

## Decision Policy

all-three-value: required, on by default
two-of-three-value: optional, on by default, skippable
one-persona-value: optional, off by default, discoverable
no-persona-value: cut it
harvester-rejects-others-want: must be async or skippable with no blocking step
preparer-only-adopter: evaluate whether output improvement is measurable before keeping

## Voice Calibration

The council is useful only when persona reactions are concrete and specific. Generic hedging ("might not like this," "could be friction-heavy") produces no actionable output.

The Harvester's reaction is binary: they either don't notice it (good) or they stop and leave (bad). There is no "mildly annoyed Harvester."

The Architect tolerates friction but not confusion. If a feature doesn't connect to the system they're building, they'll note it, question it, and potentially reject it — not because it's hard, but because it doesn't fit their mental model of how Arete compounds.

The Preparer evaluates everything against artifact quality. Their single question is: does this make the output better? If the answer is not obvious, the answer is no.

## Keeping Personas Grounded

Personas drift toward fiction when not anchored to evidence. Until the Evidence sections in PERSONA_COUNCIL.md are populated with real signal, all council output is directional hypothesis. Flag it as such when presenting to the builder.

When to update evidence:
- After a user interview or beta conversation that reveals actual behavior
- After dogfooding observations (builder uses Arete and notices friction or delight that maps to a persona)
- After support pain points or explicit user feedback
- After any A/B test or usage data that reveals behavioral patterns

Where to update: open dev/personas/PERSONA_COUNCIL.md, find the relevant persona's Evidence section, and append an entry.

Format for evidence entries:
- [YYYY-MM-DD] Source: [where the signal came from]. Observation: [what was observed].

Example:
- [2026-03-15] Source: Slack beta user interview. Observation: User pasted meeting notes mid-call, said "I don't have time to tag people right now" when prompted to map participants. Confirms zero-interruption threshold for Harvester.

Once a persona has 3+ evidence entries, it graduates from hypothesis to validated. Update the Evidence section header to reflect this: replace the hypothesis disclaimer with "Validated — [N] observations."
