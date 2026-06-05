/**
 * Phase 10a v2 counterparty parser (Step 3).
 *
 * `extractCounterpartiesFromText(text, owner_slug, direction, directory)`
 *
 * Repairs the "owner-as-personSlug" pattern in legacy data: 165 of ~487
 * commitments in arete-reserv carry `personSlug = "john-koht"` (the
 * workspace owner) when the real counterparty is buried in text. Naive
 * union-into-stakeholders[] produces `[{slug: john-koht, role: recipient}]`
 * and loses the actual counterparty.
 *
 * Per plan §"Hard part 3" + §"Migration plan (v2)", the parser runs in
 * four ordered steps with documented confidence bands:
 *
 *   Step 0: Self-pattern pre-check (NEW v2 — "note to self" fix).
 *           If text starts with a self-marker phrase ("note to self",
 *           "remember to", "remember I", "make sure I", "don't forget
 *           to", "todo:") AND no arrow notation is present, mark as
 *           self-reminder immediately. Skip remaining steps.
 *
 *   Step 1: Arrow notation regex. `@<slug> → @<slug>` (outbound),
 *           `@<slug> ← @<slug>` (inbound). Deterministic, highest
 *           confidence. If matches, return immediately.
 *
 *   Step 2: Natural language regex. "to <Name>" / "from <Name>" /
 *           "with <Name>" / "for <Name>". Resolve via person directory.
 *           Multiple candidates → ambiguous (returned, NOT silently
 *           picked).
 *
 *   Step 3: Self-fallback. No non-owner slug found → direction = 'self',
 *           stakeholders = [{slug: owner, role: 'self'}].
 *
 * Returns `{ stakeholders, direction, ambiguous, ambiguousNames? }`.
 * Migration's diff report surfaces `ambiguous` rows for user
 * disambiguation (AC1e).
 *
 * Pure module — no I/O. Caller passes a pre-built person directory
 * (name → candidate slugs map) so the parser remains side-effect free
 * and unit-testable.
 */
import type { CommitmentDirection, Stakeholder } from '../models/index.js';
/**
 * Person directory passed to the parser. Maps lowercased first-name (or
 * display-name) tokens to candidate slugs. Callers (the migration tool)
 * build this once from `EntityService.listPeople` and pass it for every
 * commitment row.
 *
 * Example:
 *   { lindsay: ['lindsay-calar', 'lindsay-gray'], dave: ['dave-wiedenheft'] }
 *
 * Plural candidates trigger the ambiguity path (AC1e).
 */
export type PersonDirectory = ReadonlyMap<string, ReadonlyArray<string>>;
/**
 * Bare-name ambiguity surfaced for user disambiguation.
 *
 * The migration emits these in a dedicated "Ambiguous" section of
 * `migration-diff.md`; the user resolves by editing a sidecar file
 * BEFORE running `--apply` (AC1e).
 */
export type AmbiguousName = {
    /** The literal name as it appeared in text (case preserved). */
    name: string;
    /** Slug candidates that resolved from the directory. */
    candidates: string[];
};
export type ExtractCounterpartiesResult = {
    /**
     * Resolved stakeholders. May be populated even when `ambiguous: true`
     * — that case means "some names resolved, others need disambiguation"
     * (LOW-4 / pre-mortem M3 mitigation; phase-10a-fixup). The migrate
     * verb's apply gate still refuses on `ambiguous: true` until the
     * sidecar resolves all ambiguous names.
     */
    stakeholders: Stakeholder[];
    /**
     * Direction to use for the migrated row. Equal to the input direction
     * unless Step 0 / Step 3 routed to `'self'`.
     */
    direction: CommitmentDirection;
    /** True iff one or more bare names resolved to multiple candidates. */
    ambiguous: boolean;
    /** Populated only when `ambiguous` is true. */
    ambiguousNames?: AmbiguousName[];
};
/**
 * Parse counterparties from a commitment's text.
 *
 * @param text       Raw commitment text (NOT pre-normalized — the parser
 *                   reads arrow notation and capitalized name tokens
 *                   directly; normalization happens at hash time).
 * @param ownerSlug  The workspace owner's slug (e.g., "john-koht"). Used
 *                   to exclude the owner from extracted stakeholders so
 *                   the owner-as-personSlug pattern is repaired.
 * @param direction  Commitment direction. May be rewritten to `'self'`
 *                   by Step 0 / Step 3.
 * @param directory  Person directory (name → candidate slugs map).
 *
 * @returns An `ExtractCounterpartiesResult`. When `ambiguous` is true,
 *          `stakeholders` is empty — the migration tool surfaces the
 *          row for user disambiguation BEFORE writing the v2 entry.
 */
export declare function extractCounterpartiesFromText(text: string, ownerSlug: string, direction: CommitmentDirection, directory: PersonDirectory): ExtractCounterpartiesResult;
/**
 * Build a `PersonDirectory` from a list of `{slug, name}` entries.
 *
 * Indexes BOTH first-name and full display name (lowercased) so the
 * parser's Step 2 regex (which captures one or two capitalized tokens)
 * can find candidates either way. Duplicates are accumulated — multiple
 * "Lindsay" entries produce a single key with multiple candidate slugs,
 * which is the ambiguity signal.
 *
 * @example
 *   buildPersonDirectory([
 *     { slug: 'lindsay-calar', name: 'Lindsay Calar' },
 *     { slug: 'lindsay-gray',  name: 'Lindsay Gray'  },
 *   ])
 *   // → Map {
 *   //     'lindsay'        → ['lindsay-calar', 'lindsay-gray'],
 *   //     'lindsay calar'  → ['lindsay-calar'],
 *   //     'lindsay gray'   → ['lindsay-gray'],
 *   //   }
 */
export declare function buildPersonDirectory(people: ReadonlyArray<{
    slug: string;
    name: string;
}>): PersonDirectory;
//# sourceMappingURL=commitments-counterparty-parser.d.ts.map