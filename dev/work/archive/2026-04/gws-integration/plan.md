---
title: Google Workspace CLI Integration
slug: gws-integration
status: completed
size: large
tags: [integration, google-workspace, gws, gmail, drive, docs, sheets, people]
created: 2026-03-25T22:52:37.393Z
updated: 2026-04-05T00:00:00.000Z
completed: 2026-04-05T00:00:00.000Z
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 0
---

# Google Workspace CLI Integration

## 1) Problem

Arete's only Google integration is Calendar (via direct OAuth API calls). PMs who live in Google Workspace have critical context scattered across Gmail threads, Drive docs, Sheets trackers, and Google Contacts — none of which feeds into briefings, meeting prep, or people intelligence today. The user is the integration layer, manually pulling context from these sources.

Meanwhile, Google has released [`gws`](https://github.com/googleworkspace/cli) — a unified CLI for all Workspace APIs with structured JSON output, built-in auth, and dynamic API discovery. Instead of building bespoke OAuth flows and API clients per service (like we did for Calendar), we can wrap `gws` with thin adapters and get access to the entire Workspace surface.

## 2) Users

Primary:
- Product builders who use Google Workspace as their core productivity suite (Gmail, Drive, Docs, Sheets).

Secondary:
- Teams where Google Workspace is the org standard and context lives in shared Drives and email threads.

## 3) Outcome / Success

A user can:
- Surface relevant Gmail threads in meeting-prep briefings and daily plans
- Search and pull Google Drive docs into workspace context
- Enrich people profiles with Google Directory data
- Query Sheets data (OKRs, roadmaps) from within Arete workflows

Success metrics:
- Briefing quality improves (relevant email/doc context appears without manual effort)
- Meeting prep time decreases (linked docs + email history auto-surfaced)
- People resolution accuracy improves (Directory enrichment)

## 4) Why GWS CLI (Not Direct API)

| Concern | Direct API (what we did for Calendar) | GWS CLI |
|---|---|---|
| Auth | Build OAuth flow, manage tokens, handle refresh | `gws auth login` — CLI manages everything |
| API surface | One service at a time, custom client per API | All Workspace APIs via one binary |
| Pagination | Manual `nextPageToken` handling | Handled by CLI |
| API versioning | Track breaking changes per service | CLI auto-discovers via Discovery Service |
| Output | Parse API-specific JSON shapes | Consistent `--format json` across all services |
| Maintenance | Per-service code to update | Update one binary |

**Trade-off**: We take a dependency on an external binary. Mitigation: detection + graceful degradation (features simply don't appear if `gws` isn't installed).

## 5) Integrations — What to Enable

### Tier 1 — High PM Value (Phase 1-2)

| Service | Capabilities | Arete Value |
|---|---|---|
| **Gmail** | Search threads, read messages, triage inbox | Customer comms in briefings, decision trail, stakeholder signal |
| **Drive** | Search files, get metadata, list recent/shared | Meeting-linked docs, PRD discovery, file context |
| **Docs** | Read document content as text | Pull PRD/spec content into workspace, meeting notes |

### Tier 2 — Medium PM Value (Phase 3)

| Service | Capabilities | Arete Value |
|---|---|---|
| **Sheets** | Read spreadsheet data | OKR trackers, roadmap data, metrics in context |
| **People/Directory** | Lookup by email, org chart | Enrich `people/` profiles, resolve ambiguous names |

### Tier 3 — Low Priority (Future)

| Service | Capabilities | Why Wait |
|---|---|---|
| **Calendar** | Events, free/busy | Already implemented via direct API; migrate later if beneficial |
| **Meet** | Recording metadata | Krisp/Fathom already cover this |
| **Chat** | Messages, spaces | Slack integration is higher priority for most users |

## 6) Architecture — How It Fits

### Integration Registry

Register `google-workspace` as a single integration that implements multiple capabilities:

```typescript
// registry.ts
'google-workspace': {
  name: 'google-workspace',
  displayName: 'Google Workspace',
  description: 'Gmail, Drive, Docs, Sheets, People via gws CLI',
  implements: ['email', 'drive', 'docs', 'sheets', 'contacts'],
  // 'none' because gws manages its own auth — Areté just detects auth status
  auth: { type: 'none', instructions: 'Install gws and run: gws auth login' },
  status: 'available',
}
```

**Note**: Using `auth.type: 'none'` (not a new `'external'` type) since Areté doesn't manage GWS auth — it only detects whether `gws` is authenticated. This avoids changing `IntegrationAuth.type`.

### Core Adapter (`packages/core/src/integrations/gws/`)

```
gws/
  client.ts          # Generic gws CLI wrapper: gwsExec(service, command, args) → JSON
  detection.ts       # Binary detection + auth status check
  gmail.ts           # EmailProvider implementation
  drive.ts           # DriveProvider implementation
  docs.ts            # DocsProvider implementation
  sheets.ts          # SheetsProvider (Phase 3)
  people.ts          # DirectoryProvider (Phase 3)
  types.ts           # Shared types for all GWS integrations
  index.ts           # Factory + provider registry
```

**Key design**: One generic `gwsExec()` function, thin typed wrappers per service. All the complexity lives in `gws` itself.

```typescript
// client.ts — conceptual shape
async function gwsExec(
  service: string,
  command: string,
  args?: Record<string, string | number | boolean>,
  options?: { timeout?: number }
): Promise<unknown> {
  // Build command: gws <service> <command> --format json [--arg value ...]
  // Execute via child_process
  // Parse JSON output
  // Handle errors (not installed, not authed, API errors)
}
```

### Provider Interfaces

New provider interfaces following the `CalendarProvider` pattern. Each provider is constructed via a factory function that receives dependencies — matching `getCalendarProvider(config, storage, workspaceRoot)`:

```typescript
// types.ts — provider interfaces
interface EmailProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  searchThreads(query: string, options?: { maxResults?: number }): Promise<EmailThread[]>;
  getThread(threadId: string): Promise<EmailThread>;
  getImportantUnread(options?: { maxResults?: number }): Promise<EmailThread[]>;
}

interface DriveProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  searchFiles(query: string, options?: { type?: string; maxResults?: number }): Promise<DriveFile[]>;
  getFileMetadata(fileId: string): Promise<DriveFile>;
  getRecentSharedWithMe(options?: { days?: number }): Promise<DriveFile[]>;
}

interface DocsProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getDocContent(docId: string): Promise<string>; // markdown
  getDocMetadata(docId: string): Promise<DocMetadata>;
}

// index.ts — factory functions (never construct providers directly)
function getEmailProvider(config: WorkspaceConfig, storage: StorageAdapter, workspaceRoot: string): EmailProvider | null;
function getDriveProvider(config: WorkspaceConfig, storage: StorageAdapter, workspaceRoot: string): DriveProvider | null;
function getDocsProvider(config: WorkspaceConfig, storage: StorageAdapter, workspaceRoot: string): DocsProvider | null;
```

All factories return `Provider | null` (null = `gws` not installed or not authenticated). This follows the existing pattern from `getCalendarProvider()`.

### Service Wiring

GWS providers must integrate with `createServices()` and `AreteServices`:

```typescript
// In createServices() — packages/core/src/services/index.ts
type AreteServices = {
  // ... existing services ...
  gws: {
    email: EmailProvider | null;
    drive: DriveProvider | null;
    docs: DocsProvider | null;
    sheets: SheetsProvider | null;      // Phase 3
    directory: DirectoryProvider | null; // Phase 3
  };
};
```

**Integration points**:
- `IntelligenceService.assembleBriefing()` checks `services.gws.email` for relevant threads when briefing mentions known people
- `EntityService` uses `services.gws.directory` as a fallback resolver for people not in `people/`
- `ContextService` uses `services.gws.drive` to include relevant docs in context queries
- CLI commands access providers via `const { gws } = createServices(root)` — never constructing providers directly

### Context & Briefing Integration

Wire GWS providers into the existing intelligence pipeline:

- `ContextService` — Add email threads and Drive docs as context sources when assembling briefings
- `EntityService` — Use Directory provider as fallback for people resolution
- `IntelligenceService.assembleBriefing()` — Include relevant Gmail threads when briefing mentions known people
- `meeting-prep` skill — Auto-surface email threads with attendees + linked Drive docs

### CLI Commands

```
arete integration configure google-workspace   # Guide through gws install + auth
arete pull gmail [--days N] [--query "..."]     # Pull important threads
arete pull drive [--days N] [--query "..."]     # Pull recent/shared files
```

## 7) Skills — New & Enhanced

### New Skills

| Skill | Triggers | What It Does |
|---|---|---|
| `email-triage` | "check my email", "inbox triage", "important emails" | Summarize unread/important threads, flag action items, suggest replies |
| `email-search` | "find emails about X", "what did Y email about Z" | Search Gmail by topic/person, surface relevant threads |
| `drive-search` | "find the PRD in Drive", "docs shared by X" | Search Drive by topic/person/type, show metadata + links |
| `doc-pull` | "pull this doc", "import from Google Docs" | Fetch Google Doc content as markdown, save to workspace |

### Enhanced Skills

| Skill | Enhancement |
|---|---|
| `meeting-prep` | Pull email threads with attendees (last N days), surface linked Drive docs from calendar event |
| `daily-plan` | Include flagged/important email threads, pending Drive doc comments |
| `people-intelligence` | Enrich with Directory data (title, department, manager), email interaction frequency |
| `periodic-review` | Include email thread counts and Drive activity as input signals |

### Agent Tool Exposure

Consider exposing `gws` as a general-purpose MCP tool so agents can make ad-hoc queries during any skill:

```yaml
# .cursor/tools/gws.md or .claude/tools/gws.md
name: gws
description: Query Google Workspace (Gmail, Drive, Docs, Sheets)
# Agent can invoke during any skill when it needs Workspace context
```

This avoids needing a dedicated skill for every possible query pattern.

## 8) Phase Plan

### Phase 0 — Foundation (small-medium)

**Goal**: GWS CLI detection, guided setup wizard, generic client wrapper.

Steps:
1. Add `gws` binary detection (`detection.ts` — check PATH, version, auth status)
2. Build generic `gwsExec()` client wrapper with error handling, timeout, and defensive JSON parsing
3. Add `google-workspace` to integration registry (using `auth.type: 'none'`)
4. Add `gws` field to `AreteServices` type and wire into `createServices()` (all providers null initially)
5. Build `arete integration configure google-workspace` as a guided wizard:
   - Check/prompt for `gws` CLI installation
   - Investigate shared client credentials (skip GCP project setup for users)
   - Batch scope authorization (Gmail + Drive + Docs in one flow, not per-service)
   - Post-auth smoke test per service (verify access, report results)
   - Data sensitivity warning (user acknowledges responsibility)

**Acceptance Criteria**:
- `gws` binary detected in PATH and version returned as string
- `gwsExec('calendar', 'list', { maxResults: 1 })` returns parsed JSON or throws typed error
- `gwsExec()` throws `GwsNotInstalledError` when binary missing, `GwsAuthError` when not authenticated
- `gwsExec()` times out after 30s and throws `GwsTimeoutError`
- `arete integration configure google-workspace` completes with ≤3 manual user steps (install CLI, run configure, approve in browser)
- `arete integration list` shows `google-workspace` with correct status (active/inactive)
- `arete status` shows GWS auth state

**Tests**:
- `detection.ts`: binary found/not-found, version parsing, auth status check (mock `child_process`)
- `client.ts`: successful JSON parse, malformed JSON handling, timeout, not-installed error, auth error, stderr capture
- `integration configure`: smoke test flow with mocked `gws` binary
- Registry: `google-workspace` entry validates against `IntegrationDefinition` type

**Open investigation**: Can `gws` accept custom OAuth client credentials (like our Calendar integration ships `GOOGLE_CLIENT_ID`)? If yes, users skip GCP project creation entirely. If no, the wizard must guide through GCP setup with minimal friction.

### Phase 1a — Gmail Core (medium)

**Goal**: Email triage via CLI pull command.

Steps:
1. Define `EmailProvider` interface + `EmailThread`, `EmailMessage` types in `types.ts`
2. Implement `gmail.ts` adapter using `gwsExec()` — `searchThreads()`, `getThread()`, `getImportantUnread()`
3. Extend `ConversationProvenance.source` from `'manual'` to `'manual' | 'email' | 'slack'` (enables email storage as conversation artifacts)
4. Create `email-triage` skill with concrete triage rubric (not "best judgement" — see section 13)
5. Add `arete pull gmail [--days N] [--query "..."]` CLI command (follows `createServices()` → `findRoot()` → service call pattern)
6. Wire `EmailProvider` into `createServices()` as `services.gws.email`

**Acceptance Criteria**:
- `getEmailProvider(config, storage, root)` returns `GmailProvider` when `gws` is authenticated, `null` otherwise
- `searchThreads('from:jane@example.com')` returns `EmailThread[]` with subject, date, participants, snippet
- `getImportantUnread()` uses Gmail search operators to pre-filter (e.g., `is:important is:unread -category:promotions`)
- `arete pull gmail --days 3` fetches threads from last 3 days, runs triage, outputs summary of actions taken (saved/tasked/notified)
- Triaged conversations saved to `resources/conversations/` with `provenance.source: 'email'`
- `email-triage` skill routes correctly via `routeToSkill('check my email')`

**Tests**:
- `gmail.ts`: adapter tests against fixture JSON snapshots from real `gws gmail` output (happy path, empty results, malformed response)
- `email-triage`: triage rubric produces expected action (save/task/notify) for test thread fixtures
- `arete pull gmail`: CLI integration test with mocked `gwsExec` (follows CLI test patterns from LEARNINGS.md)
- `ConversationProvenance`: type change doesn't break existing `'manual'` conversations (backward compat)

### Phase 1b — Gmail Intelligence Wiring (small)

**Goal**: Email context flows into briefings and meeting prep.

Steps:
1. Create `email-search` skill
2. Wire `services.gws.email` into `IntelligenceService.assembleBriefing()` — include recent threads with people mentioned in briefing
3. Enhance `meeting-prep` skill to pull email threads with attendees (last 7 days)

**Acceptance Criteria**:
- `assembleBriefing()` includes email thread snippets when briefing references people with known email addresses
- `meeting-prep` for a meeting with jane@example.com surfaces recent email threads with Jane
- `email-search` skill routes correctly and returns results via `searchThreads()`
- Email context is additive — briefings without GWS configured produce identical output to today

**Tests**:
- `intelligence.ts`: briefing assembly includes email context when `services.gws.email` is available, skips gracefully when null
- `meeting-prep`: enhanced skill includes thread snippets in output (fixture-based)
- Regression: briefing without GWS configured matches existing behavior

### Phase 2 — Drive & Docs (medium)

**Goal**: Document context accessible from Arete.

Steps:
1. Define `DriveProvider`, `DocsProvider` interfaces + `DriveFile`, `DocMetadata` types
2. Implement `drive.ts` adapter — `searchFiles()`, `getFileMetadata()`, `getRecentSharedWithMe()`
3. Implement `docs.ts` adapter — `getDocContent()` (returns markdown), `getDocMetadata()`
4. Create `drive-search` skill
5. Create `doc-pull` skill (fetch Google Doc → markdown → save to `resources/docs/{slug}.md`)
6. Wire `DriveProvider` into `ContextService` as additional context source
7. Add `arete pull drive [--days N] [--query "..."]` CLI command
8. Enhance `meeting-prep` to surface Drive attachments linked in calendar events

**Acceptance Criteria**:
- `searchFiles('Q2 roadmap')` returns `DriveFile[]` with title, mimeType, modifiedTime, webViewLink (max 25 results)
- `getDocContent(docId)` returns markdown string with headings, lists, and tables preserved
- `doc-pull` saves Google Doc as `resources/docs/{slug}.md` with frontmatter (source URL, pulled date, doc ID)
- `drive-search` skill routes correctly and displays results with file type, last modified, and link
- `arete pull drive --days 7` lists recently modified/shared files
- `ContextService` includes Drive docs in context queries when GWS is configured
- `meeting-prep` surfaces Drive attachments linked in the calendar event description/attachments

**Tests**:
- `drive.ts`: adapter tests against fixture JSON (file list, single file metadata, empty results)
- `docs.ts`: content extraction tests — HTML/JSON to markdown conversion (headings, lists, tables)
- `doc-pull`: saves file with correct frontmatter, handles duplicate slugs
- `context.ts`: context query includes Drive results when available, skips when null
- CLI: `arete pull drive` integration test with mocked provider

### Phase 3 — Sheets & People (small-medium)

**Goal**: Spreadsheet data access + people enrichment.

Steps:
1. Define `SheetsProvider`, `DirectoryProvider` interfaces + types
2. Implement `sheets.ts` adapter (read-only) — `getSpreadsheet()`, `getRange()`
3. Implement `people.ts` adapter — `lookupPerson(email)`, `searchDirectory(query)`
4. Wire `DirectoryProvider` into `EntityService` as fallback resolver (after local `people/` lookup)
5. Add people enrichment to `arete pull` (optional `--enrich-people` flag)
6. Enhance `people-intelligence` skill with Directory data (title, department, manager)

**Acceptance Criteria**:
- `lookupPerson('jane@example.com')` returns name, title, department, manager, photo URL from Google Directory
- `EntityService.resolvePerson('Jane')` checks local `people/` first, falls back to Directory provider if no match
- `arete pull --enrich-people` updates `people/` files with Directory data using sentinel comment pattern (`AUTO_DIRECTORY:START/END`)
- `getSpreadsheet(id)` returns sheet names and metadata; `getRange(id, 'Sheet1!A1:D10')` returns cell data as 2D array
- `people-intelligence` skill includes Directory-sourced fields in output

**Tests**:
- `people.ts`: adapter tests against fixture JSON (found, not found, partial data)
- `sheets.ts`: spreadsheet read tests (single range, multiple sheets, empty cells)
- `entity.ts`: fallback resolution — local match skips Directory, no local match hits Directory, Directory unavailable degrades gracefully
- People enrichment: sentinel comment merge preserves existing content, adds new fields

## 9) Phase Gates

| Gate | Required Evidence | Decision |
|---|---|---|
| Phase 0 → Phase 1a | `gws` binary detected, auth flow works, `gwsExec()` returns valid JSON, all Phase 0 tests pass | Go |
| Phase 1a → Phase 1b | `arete pull gmail` successfully triages threads, email-triage skill works in daily use | Go |
| Phase 1b → Phase 2 | Gmail context appears in briefings and meeting prep, email skills useful in daily workflow | Go / Iterate / Stop |
| Phase 2 → Phase 3 | Drive/Docs integration adds value to meeting prep and context queries | Go / Iterate / Stop |

## 10) Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `gws` CLI is early/unstable | Breaking changes, missing features | Pin to known-good version; graceful degradation if commands fail |
| Binary distribution | Users must install separately | Clear install instructions; `arete integration configure` guides through it |
| JSON output format changes | Adapter parsing breaks | Version-check `gws` on detection; adapter tests against fixture data |
| Rate limiting | Google API quotas hit via CLI | Respect CLI's built-in rate limiting; cache results where appropriate |
| Auth token expiry | `gws` token expires mid-session | Detect auth errors, prompt re-auth with clear message |
| Scope creep | Trying to integrate everything at once | Phase gates enforce incremental delivery; Tier 3 stays future |
| Onboarding friction | GCP project + per-service OAuth = 6+ steps before first call | Guided wizard, explore shared client credentials, batch scope auth, smoke tests |

## 11) Relationship to Existing Calendar Integration

The current Google Calendar integration (`packages/core/src/integrations/calendar/google-calendar.ts`) uses direct OAuth API calls. Options:

1. **Keep both** (recommended initially) — Calendar continues working via direct API. GWS handles everything else. No migration risk.
2. **Migrate Calendar to GWS** (later) — Once GWS is proven stable, optionally migrate Calendar provider to use `gws calendar` as backend. Removes the custom OAuth flow + token management. Only worth doing if maintaining two auth paths becomes a burden.

## 12) Scheduled Pulls

Gmail and Calendar both benefit from automated pulls so context is always fresh without user intervention.

**Approach**: `arete pull --schedule` manages launchd plists (macOS) to run pull commands on an interval. This is preferred over backend watchers since the backend isn't always running.

| Pull | Schedule | What It Does |
|---|---|---|
| `arete pull gmail --days 1` | Every 2-4 hours | Pull recent threads for triage |
| `arete pull calendar --today` | Every morning + on-demand | Ensure daily-plan has fresh events |
| `arete pull drive --days 1` | Daily | Index recently shared/modified docs |

**Phasing**: Scheduled pulls are a nice-to-have. Push to a later phase (after Phase 2 at earliest). Manual `arete pull` commands cover the need initially.

## 13) Email Triage Model

Gmail integration is NOT a full email sync. The agent triages intelligently:

**Pull flow**:
1. `arete pull gmail` fetches recent threads (last N days, configurable)
2. Agent evaluates each thread for PM relevance using best judgement (customer signals, decision threads, action items, stakeholder comms)
3. Based on triage, the agent takes one of three actions per thread:

| Action | When | Result |
|---|---|---|
| **Save as conversation** | Thread contains decisions, context, or signals worth preserving | Saved to `resources/conversations/` (same format as Slack captures) |
| **Create task(s)** | Thread contains clear action items for the user | Task(s) created in task system |
| **Notify user** | Thread is ambiguous or needs human judgement | Flagged for user review with summary |

**Key principle**: The agent uses best judgement on what's important. Not every email gets stored — only the ones with PM value. This prevents workspace bloat and keeps signal-to-noise high.

**Storage format**: Conversation artifacts (same pattern as Slack conversation capture), stored in `resources/conversations/`. This reuses the existing extraction pipeline (summary, decisions, action items, stakeholders).

## 14) Data Sensitivity

**On integration setup**: Warn users that email/doc content will be stored locally in their workspace. User acknowledges they are responsible for data sensitivity in their environment.

**Content storage modes** (configurable in `arete.yaml`):

```yaml
integrations:
  google-workspace:
    email_storage: full        # default — store full thread content
    # email_storage: summary   # store AI summary only, discard raw content
    email_review: false        # default — agent triages autonomously
    # email_review: true       # user reviews each triaged thread before save
```

| Mode | What's Stored | Trade-off |
|---|---|---|
| `full` | Complete thread content as conversation artifact | Maximum context for future queries; more sensitive data on disk |
| `summary` | AI-generated summary + extracted items only | Less disk sensitivity; loses raw context for re-analysis |

**Default**: `full` — most users are on personal/work machines where this is fine. Users in sensitive environments can switch to `summary` mode. No redaction logic needed — the summary mode naturally strips PII by only keeping the agent's synthesis.

## 15) Email Attachments

Email attachments are noisy — signatures, antivirus footers, tracking pixels, and logos clutter most threads. Rather than downloading everything or ignoring everything, the agent prompts the user.

**Flow**: When the agent triages a thread that has attachments, it lists them and asks:

```
Email "Q2 Strategy Update" from Jane Smith has 2 attachments:

1. Q2-Strategy-Draft.pdf
2. reserv-logo.png

Download any of these? (enter numbers, "all", or "skip")
```

The user picks which ones matter. Downloaded files are saved in a per-conversation directory: `resources/conversations/{slug}/` containing `conversation.md` + any attachments. This keeps attachments co-located with their conversation without cluttering the directory.

**Agent heuristics** (optional, can refine later):
- Auto-skip known junk: image/png under 50KB (likely logos/signatures), .ics files (calendar already handles these)
- Auto-suggest documents: .pdf, .docx, .xlsx, .pptx, .csv are more likely to be intentional attachments

**Config**:

```yaml
integrations:
  google-workspace:
    email_attachments: prompt   # default — ask user per thread
    # email_attachments: skip   # never download attachments
    # email_attachments: auto   # download docs, skip images/junk (future)
```

## 16) Testing Strategy

All phases follow Areté's build standards: Node.js built-in test runner via tsx, tests in `packages/*/test/` mirroring `src/` structure.

### Test Infrastructure for GWS

**Fixture-based adapter testing**: Since `gwsExec()` shells out to a binary, all adapter tests use captured JSON fixtures (real `gws` output, snapshot once and committed). This isolates tests from the binary and makes CI possible without `gws` installed.

```
packages/core/test/integrations/gws/
  fixtures/
    gmail-list-threads.json      # Real output from: gws gmail list --format json
    gmail-get-thread.json        # Real output from: gws gmail get <id> --format json
    gmail-empty.json             # Empty result set
    drive-search-results.json
    docs-get-content.json
    people-lookup.json
    error-not-authenticated.json # Auth error response
  client.test.ts                 # gwsExec() unit tests
  detection.test.ts              # Binary detection tests
  gmail.test.ts                  # Gmail adapter tests
  drive.test.ts                  # Drive adapter tests
  docs.test.ts                   # Docs adapter tests
```

**Dependency injection for `gwsExec()`**: Adapters accept a `deps` object (following the `testDeps` pattern from Calendar/ical-buddy) so tests inject a mock executor instead of spawning a real process:

```typescript
type GwsDeps = {
  exec: (service: string, command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

// Production: real gwsExec()
// Tests: mock that returns fixture data
```

**CLI command tests**: Follow patterns from `packages/cli/test/` — mock `createServices()`, verify output format for `--json` mode, test error paths.

**Integration tests** (per phase, not unit):
- Phase 0: End-to-end `arete integration configure google-workspace` with mocked binary
- Phase 1a: `arete pull gmail` produces conversation artifacts from fixture threads
- Phase 2: `doc-pull` creates correct markdown file from fixture doc content
- Phase 3: People enrichment updates `people/` files with sentinel comments

## 17) Resolved Questions

- [x] **GWS stability**: Tested with Sheets and Calendar — solid enough for production use.
- [x] **Linux support**: macOS-only for now. Revisit when user base expands.
- [x] **Drive pagination**: Punt. Default to 20-25 results per search. Add `--max-results` and cursor pagination later if needed.
- [x] **Doc-pull: sync vs snapshot**: Snapshot first. Pull once → save as markdown → done. User re-pulls manually for fresh version. Build sync only if users frequently re-pull the same docs (that's the signal).
- [x] **Scheduled pulls**: Yes, valuable. `arete pull --schedule` manages launchd plists. Pushed to later phase — manual pulls cover the need initially.
- [x] **GWS version**: Latest stable. No need to pin a specific version.
- [x] **Email storage format**: Conversation artifacts (same as Slack captures) in `resources/conversations/`. Agent triages — only PM-relevant threads get stored.
- [x] **Data sensitivity**: Warn on setup (user is liable). Offer `email_storage: full | summary` config. Default `full`. No redaction — summary mode naturally handles it.
- [x] **Email triage review**: Configurable via `email_review: true | false`. Default `false` (autonomous). Users who want control can enable review mode.
- [x] **Email attachments**: Agent prompts user per thread — lists attachments, user picks which to download. Configurable: `email_attachments: prompt | skip | auto`. Default `prompt`.

## 18) Open Questions

- [ ] Can `gws` accept custom OAuth client credentials? (Determines whether users need GCP project setup — investigated in Phase 0)
- [ ] Should existing `resources/conversations/` flat files migrate to per-conversation directories (`{slug}/conversation.md`)? Or only new email conversations use the directory pattern?
