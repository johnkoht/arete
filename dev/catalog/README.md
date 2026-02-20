# Capability Registry

Machine-friendly inventory of tools, services, extensions, and packages used in the Areté build workspace.

## Files

- `dev/catalog/capabilities.json` — Source of truth for automation/agents

## Why this exists

Memory entries are chronological and narrative. This registry is current-state and structured so agents can quickly answer:

- Is this built, customized, or external?
- Is it part of Pi core or local workspace customization?
- Where is it implemented?
- What should be read before changing it?

## Update rules

Update `capabilities.json` when you:

1. Add/remove an extension, tool, service, or major package integration
2. Change ownership, status, entrypoints, or implementation paths
3. Learn that provenance/usage assumptions were wrong

Also add a memory entry for substantial capability changes.

## Suggested usage in plans

Before changing developer tooling (extensions/rules/services), review:

- `dev/catalog/capabilities.json`
- `memory/MEMORY.md` (for historical context)

Then update the capability record as part of the change.
