# Issues

Simple issue tracker for the reimagine branch.

---

## Open

### #1 - "next week" date calculation is wrong
**Found**: 2026-03-07 (Bug Hunt Game)  
**File**: `packages/cli/src/commands/calendar.ts:62`  
**Severity**: Medium

The formula `currentDay === 0 ? 8 : 8 - currentDay + 7` produces incorrect dates:
- Wednesday (day 3): `8 - 3 + 7 = 12` days → Monday nearly 2 weeks away
- Monday (day 1): `8 - 1 + 7 = 14` days → Monday 2 weeks away

Should be: `currentDay === 0 ? 1 : 8 - currentDay` for next Monday.

---

### #2 - Missing NaN validation on CLI parseInt
**Found**: 2026-03-07 (Bug Hunt Game)  
**File**: `packages/cli/src/commands/availability.ts:266-268`  
**Severity**: Low

```typescript
const duration = parseInt(opts.duration ?? String(DEFAULT_DURATION), 10);
const days = parseInt(opts.days ?? String(DEFAULT_DAYS), 10);
const limit = parseInt(opts.limit ?? String(DEFAULT_LIMIT), 10);
```

No validation that these are finite numbers. `--duration abc` produces NaN that propagates.

---

### #3 - Risk primitive triggers false positive gap detection
**Found**: 2026-03-07 (Bug Hunt Game)  
**File**: `packages/core/src/services/context.ts:173-186`  
**Severity**: Low

`PRIMITIVE_FILE_MAP['Risk']` is intentionally `[]` (risks come from memory/search), but the gap detection loop reports "No substantive context found for Risk primitive" because the inner loop never executes.

Should skip primitives with intentionally empty mappings.

---

## Closed

(none yet)
