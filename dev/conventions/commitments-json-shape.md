# commitments.json — shape convention (Phase 8-followup-5)

`.arete/commitments.json` is the single source of truth for tracked
commitments between the user and other people. It is managed
exclusively by `CommitmentsService`
(`packages/core/src/services/commitments.ts`) — never edit by hand,
and never write to the file from outside the service.

This document is **convention only**. The model file
(`packages/core/src/models/entities.ts`) is the authoritative source
of truth for the types; this doc exists because the reconciler design
work surfaced repeated confusion about the shape (no explicit
`status` field, top-level is a dict not a list, `resolvedAt: null`
vs `status: 'open'` ambiguity). Read this when a new chef skill
needs to consume commitments and isn't sure how to filter.

## Top-level shape

```json
{
  "commitments": [
    { /* Commitment object — see below */ },
    { /* ... */ }
  ]
}
```

The top level is an **object** with a single `commitments` field
holding an array — NOT a top-level array. This matches the
`CommitmentsFile` type:

```ts
// packages/core/src/models/entities.ts
export type CommitmentsFile = {
  commitments: Commitment[];
};
```

Code that reads the file via `CommitmentsService` (always preferred)
gets `Commitment[]` directly. Anything reading the JSON file directly
must unwrap the `commitments` field — the most common reconciler
mistake is assuming the file is a bare array.

## Commitment object shape

```ts
// packages/core/src/models/entities.ts
export type Commitment = {
  id: string;
  text: string;
  direction: CommitmentDirection;       // 'i_owe_them' | 'they_owe_me'
  personSlug: string;
  personName: string;
  source: string;                       // e.g., "2026-05-30-slack-digest.md"
  date: string;                         // ISO date (when commitment was made)
  status: CommitmentStatus;             // 'open' | 'resolved' | 'dropped'
  resolvedAt: string | null;            // ISO date OR null when open
  projectSlug?: string;                 // optional
  goalSlug?: string;                    // optional
  area?: string;                        // optional; metadata only
};
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable id — typically a hash of (text + personSlug + direction). Survives re-runs. |
| `text` | string | The commitment text as extracted from the source. |
| `direction` | `'i_owe_them' \| 'they_owe_me'` | Who owes whom. `i_owe_them` = the user (John) owes the counterparty. |
| `personSlug` | string | The counterparty's slug. Matches `people/<category>/<slug>.md`. |
| `personName` | string | Display name (denormalized snapshot at creation time). |
| `source` | string | The artifact this commitment was extracted from (meeting slug, slack-digest date, etc.). |
| `date` | string | ISO date (`YYYY-MM-DD`) when the commitment was made. |
| `status` | `'open' \| 'resolved' \| 'dropped'` | Lifecycle. `open` = still active; `resolved` = fulfilled; `dropped` = abandoned. |
| `resolvedAt` | `string \| null` | ISO date when `status` transitioned to `resolved` or `dropped`. `null` only when `status === 'open'`. |
| `projectSlug` | `string?` | Optional project association. Inherited from source meeting's `projectSlug`. |
| `goalSlug` | `string?` | Optional goal association. Links to a quarterly goal. |
| `area` | `string?` | Optional area scoping. Metadata only — NOT part of the dedup hash. |

## Filtering: open commitments

```ts
// Canonical
const open = commitments.filter((c) => c.status === 'open');

// Equivalent (resolvedAt is null iff status is 'open')
const open = commitments.filter((c) => c.resolvedAt === null);
```

Both work. `status === 'open'` is the canonical filter — it reads
clearer and the field is the lifecycle source of truth. The
`resolvedAt === null` invariant is enforced by the service: it sets
`status: 'open'` AND `resolvedAt: null` together, and only flips both
together when resolving/dropping.

For "resolved earlier today" filtering (e.g., daily-winddown's re-run
idempotency check):

```ts
const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
const resolvedToday = commitments.filter(
  (c) =>
    c.status !== 'open' &&
    c.resolvedAt !== null &&
    new Date(c.resolvedAt) >= todayStart,
);
```

## Direction semantics

`i_owe_them`: the user (John) is the owner; counterparty is waiting
on the user. These items belong in `now/week.md` and the user's
action queue.

`they_owe_me`: the counterparty is the owner; the user is waiting on
them. These items belong in `now/week.md → Waiting On` (or surface as
"check back with @counterparty after Nd of silence" in winddown).

The direction-parser bug occasionally emits **mirror-pair** commitments
(one in each direction from the same compound source sentence) — daily-
winddown's `## Pruning candidates` section has a batch-resolve rule
for these (see daily-winddown SKILL.md → "Batch-resolution rules").

## What lives outside commitments.json

These artifacts are durable but live elsewhere (the reconciler should
not look in `commitments.json` for them):

| Artifact | Location | Owner |
|---|---|---|
| Open tasks | `now/week.md`, `now/tasks.md` | TaskService |
| Memory items (decisions, learnings) | `.arete/memory/items/{decisions,learnings}.md` | MemoryLogService |
| Person Memory Highlights | `people/<category>/<slug>.md` body | PersonMemoryService |
| Item fates (deferral/dismissal log) | `.arete/memory/item-fates.jsonl` | MemoryLogService |
| Meeting frontmatter (staged items) | `resources/meetings/*.md` frontmatter | MeetingApplyService |
| Topic page sources | `.arete/memory/topics/<slug>.md` | TopicMemoryService |

## Wiki-source vs composed-view distinction

Several chef skills produce TWO categories of output:

1. **Durable wiki sources** — single-skill artifacts consumed by
   `arete topic refresh` and similar pipelines. Examples:
   - `resources/notes/<date>-slack-digest.md` (slack-digest)
   - `resources/meetings/*.md` (meeting source files)
   - `.arete/commitments.json` (this file)

2. **Composed views** — per-skill orchestrator-curated reviews. Each
   skill owns its own `now/archive/<skill>/` directory. The daily-
   winddown chef-orchestrator produces a UNIFIED composed view at
   `now/archive/daily-winddown/winddown-<date>.md` that aggregates
   gather-only output from slack-digest / email-triage / process-
   meetings.

In gather-only mode, sub-skills MUST NOT write to the composed-view
path (`now/archive/<sub-skill>/`) because the orchestrator owns the
composed view. They MAY (and slack-digest MUST) still write the
durable wiki source — that artifact is the wiki's only input on days
where the user only runs `/daily-winddown`. See slack-digest
SKILL.md → "Gather-only mode" for the canonical example, and
phase-8-followup-5 Item A for the bug history.

## Related

- **Source of truth**: `packages/core/src/models/entities.ts` →
  `Commitment`, `CommitmentStatus`, `CommitmentDirection`,
  `CommitmentsFile`.
- **Service**: `packages/core/src/services/commitments.ts` →
  `CommitmentsService` (read/write API; always prefer over direct
  JSON reads).
- **CLI**:
  - `arete commitments list --json` — read all commitments as JSON
    (top-level is the array directly; the service unwraps the file
    wrapper).
  - `arete commitments create --text … --person … --direction …`
  - `arete commitments resolve <id> [--status resolved|dropped]`
- **Patterns**:
  - `packages/runtime/skills/PATTERNS.md` § "gather-only composition"
    — context for the durable wiki source vs composed view split.
  - `packages/runtime/skills/slack-digest/SKILL.md` § "Gather-only
    mode" — canonical example of a durable wiki-source carve-out.
- **Convention companions**:
  - `dev/conventions/person-frontmatter.md` — sibling convention doc
    for person files.
