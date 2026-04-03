---
status: complete
size: tiny
steps: 2
---

# Winddown Source Sync

Make daily-winddown recording pull integration-agnostic, matching the pattern used elsewhere.

## Steps

1. **Update Phase 1a** - Replace hardcoded `arete pull fathom --days 1` with integration-agnostic logic that checks `arete.yaml` for active recording integrations (krisp, fathom, or both) and pulls from whichever are configured.
2. **Clean up** - Remove legacy "Adapted from arete-reserv" comment; update References section.
