# Pattern Verification Notes

Verified all 9 pattern claims against current code on 2026-03-01.

## Verified ✅

1. **Service Composition / DI via constructor**: All services use constructor injection (ContextService takes storage+searchProvider, IntelligenceService takes context+memory+entities). `createServices()` in factory.ts is the sole wiring point.

2. **Services hold config, not mutable state**: Services hold `storage`, `searchProvider`, or other service refs via constructor — not mutable state. They're "stateless" in the sense of no method-to-method state accumulation. **Nuance**: They hold injected dependencies, just not request-scoped state. Pattern description should say "no mutable state between calls" rather than "stateless."

3. **Storage Abstraction**: Confirmed — services take `StorageAdapter`, only `FileStorageAdapter` uses `fs` directly.

4. **testDeps Injection**: Found in `packages/core/src/search/providers/qmd.ts`, `packages/core/src/integrations/calendar/ical-buddy.ts`, `packages/core/src/integrations/calendar/google-calendar.ts`.

5. **Provider Pattern**: `getCalendarProvider()` returns `CalendarProvider | null`. Pattern confirmed.

6. **Compat Layer**: `packages/core/src/compat/` has shims for memory, context, entity, intelligence, workspace — all delegate to service classes. Pattern confirmed and active.

7. **Model Organization**: `packages/core/src/models/` with barrel export in `index.ts`. Re-exports all domain types. Confirmed.

8. **CLI → Core Boundary**: CLI commands use `createServices(process.cwd())` and destructure. Core has no chalk/inquirer deps. Confirmed.

9. **Config Resolution**: `packages/core/src/config.ts` header comment says "Priority: workspace arete.yaml > global ~/.arete/config.yaml > defaults". Code uses `deepMerge` with defaults. Confirmed.

## Capabilities Catalog

Checked `dev/catalog/capabilities.json` — no entries related to agent composition or standards. This work creates new `.pi/standards/` files but doesn't change tooling/extensions/services, so no catalog update needed.
