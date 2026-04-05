# Review: Meeting Area Context Integration

**Type**: Plan (pre-execution)
**Audience**: Builder (internal tooling — affects core, backend, web, runtime skills)

---

## Checklist Assessment

| Concern | Assessment |
|---------|------------|
| Audience | ✅ Clear — Builder tooling for Areté development |
| Scope | ⚠️ See Concern #1 |
| Risks | ✅ Pre-mortem completed, 7 risks identified |
| Dependencies | ⚠️ See Concern #2 |
| Patterns | ⚠️ See Concern #3 |
| Multi-IDE | ✅ N/A — no runtime/ or .agents/sources/ changes (skills are in packages/runtime/) |
| Backward compatibility | ✅ Existing title-matching fallback preserved |
| Catalog | ⚠️ See Concern #4 |
| Completeness | ⚠️ See Concern #5 |

---

## Concerns

### 1. **Scope**: Step 3 contradicts pre-mortem mitigation

**Issue**: Step 3 lists `POST /api/meetings/:slug/area` as a separate endpoint. But the pre-mortem explicitly recommends against this:

> "No PATCH endpoint for area alone — area saved atomically with process request"
> "No `PATCH /area` endpoint in Step 3"

**Suggestion**: Remove `POST /:slug/area` from Step 3. Area should only be saved via the process endpoint. Update AC to reflect this:
- ~~POST `/api/meetings/:slug/area`~~ (remove)
- Process endpoint accepts `area` param and saves it before processing

### 2. **Dependencies**: Implicit dependency between Steps 2 and 3

**Issue**: Step 3 (backend endpoints) needs to call Step 2 (area suggestion service). But Step 2 is defined as a core service, and Step 3 is in the backend package. The wiring isn't explicit.

**Suggestion**: Add to Step 3's AC:
- "Backend imports and calls `suggestAreaForMeeting()` from @arete/core"
- Consider: Should suggestion live in `meeting-context.ts` (existing) or new `area-suggestion.ts`? Decide before implementation.

### 3. **Patterns**: Step 2 service location unclear

**Issue**: "New service that takes meeting content + list of areas" — where does this live?

Options:
- **Extend `AreaParserService`** — already handles area lookup, could add content matching
- **New `area-suggestion.ts`** — separate concern, but more files
- **Add to `meeting-context.ts`** — keeps meeting logic together

**Suggestion**: Specify in Step 2: "Add `suggestAreaForMeeting()` function to `area-parser.ts` (extends existing area matching logic)". This follows the existing pattern where `getAreaForMeeting()` already does title matching.

### 4. **Catalog**: capabilities.json update not mentioned

**Issue**: The plan touches meeting-extraction capability (adding area field), backend meetings routes (new suggest endpoint), and runtime skills. These should be reflected in `dev/catalog/capabilities.json`.

**Suggestion**: Add to final step or as a separate housekeeping step:
- Update `meeting-extraction` capability notes to mention area field
- Verify `readBeforeChange` paths still accurate

### 5. **Completeness**: Missing types updates

**Issue**: Steps mention updating `MeetingForSave` interface but don't specify:
- Web frontend `Meeting` type in `src/api/types.ts`
- Backend meeting parsing (needs to read `area` from frontmatter)
- React Query cache invalidation after area save

**Suggestion**: Add to Step 3:
- "Update meeting parsing to read `area` from frontmatter"
- "Return `area` and `suggestedArea` in GET /meetings/:slug response"

Add to Step 4:
- "Update `Meeting` type in `src/api/types.ts` to include `area?: string` and `suggestedArea?: string`"

---

## Strengths

- **Clear problem statement** — The workflow timing issue (area association after processing is too late) is well articulated
- **Two-path solution** — Agent mode and UI mode are both addressed, meeting users where they are
- **Pre-mortem completed** — 7 risks identified with concrete mitigations
- **Backward compatible** — Existing title matching remains as fallback; area is optional
- **Out of scope is explicit** — No retroactive assignment, no multi-area, no auto-processing

---

## Devil's Advocate

**If this fails, it will be because...**

The suggestion algorithm is either too simple (returns null most of the time, so users always have to manually select) or too aggressive (returns low-confidence matches that annoy users into ignoring suggestions entirely).

The plan says "keyword overlap with area sections" but areas may not have well-structured sections yet. If user's areas are sparse (just a title and empty sections), the suggestion service will be useless. The feature's value depends on workspace maturity — new workspaces with minimal areas won't benefit.

**The worst outcome would be...**

Users process meetings without selecting an area because the UI flow is confusing (suggested vs confirmed state), then wonder why their action items aren't associated with the right context. They don't realize they needed to confirm the area, and blame Areté for "not understanding" their meetings. The feature adds friction without adding value.

---

## Recommendations Before Proceeding

1. **Resolve Step 3 contradiction** — Remove the separate `POST /area` endpoint per pre-mortem
2. **Specify service location** — Extend `AreaParserService` or add to `meeting-context.ts`
3. **Add types updates** — Web frontend Meeting type, backend parsing
4. **Consider MVP scope** — Could Steps 1-3 ship without Steps 4-6? Backend support enables UI, but skills could come later

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor clarifications needed, but plan is fundamentally sound
- [ ] **Revise** — Address concerns before proceeding

The plan is solid. The pre-mortem already caught the key risks. The concerns above are clarifications to prevent ambiguity during implementation, not fundamental issues with the approach.

**Recommended next step**: Update plan to resolve the POST /area contradiction and specify service location, then proceed to `/approve` → `/prd`.
