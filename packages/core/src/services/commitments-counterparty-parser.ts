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

import type {
  CommitmentDirection,
  Stakeholder,
  StakeholderRole,
} from '../models/index.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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
  /** Resolved stakeholders. EMPTY when `ambiguous: true`. */
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

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/**
 * Self-pattern markers (Step 0). Case-insensitive prefix match.
 *
 * Source: plan §"Migration plan (v2)" Step 0. These phrases are
 * unambiguous signals of a self-reminder; entity extraction must NOT
 * mark mentions in the body as recipients.
 */
const SELF_PATTERN_PREFIXES: ReadonlyArray<string> = [
  'note to self',
  'remember to',
  'remember i',
  'make sure i',
  "don't forget to",
  'dont forget to',
  'todo:',
];

/**
 * Arrow-notation regex (Step 1). Matches:
 *   `@<owner> → @<counterparty>` (outbound)
 *   `@<owner> ← @<counterparty>` (inbound)
 *   ASCII equivalents `->` / `<-`.
 *
 * Bracketed variant ([@a → @b]) supported. Counterparty slug is the
 * second capture group; arrow direction is the first.
 */
const ARROW_PATTERN =
  /\[?@([a-z0-9-]+)\s*(→|←|->|<-)\s*@([a-z0-9-]+)\s*\]?/i;

/**
 * Natural-language prepositional pattern (Step 2). Looks for
 *   `to <Name>` / `from <Name>` / `with <Name>` / `for <Name>`
 *
 * Where `<Name>` is one capitalized token (or hyphenated). Multi-word
 * names ("Lindsay Gray") matched via greedy continuation in
 * `extractNaturalLanguageNames` below — this regex catches the trigger
 * preposition + first capitalized token.
 *
 * Case-sensitive on `<Name>` (must start with uppercase) so we don't
 * grab generic nouns like "to staffing" or "with care".
 */
const NL_PREPOSITION_PATTERN =
  /\b(to|from|with|for)\s+([A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine recipient/sender role from CommitmentDirection.
 *  - `i_owe_them`  → counterparty is the recipient (we send TO them).
 *  - `they_owe_me` → counterparty is the sender (they send TO us).
 *  - `self`        → caller must handle separately (role='self').
 */
function roleForDirection(direction: CommitmentDirection): StakeholderRole {
  if (direction === 'i_owe_them') return 'recipient';
  if (direction === 'they_owe_me') return 'sender';
  return 'self';
}

/**
 * Lowercase + trim a name token for directory lookup. The directory is
 * keyed by lowercased first-name OR full display name; callers build
 * both variants so this function only has to canonicalize the lookup.
 */
function normalizeLookupKey(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Returns the index where the arrow pattern matches, or -1.
 */
function findArrowMatch(
  text: string,
): { owner: string; arrow: '→' | '←' | '->' | '<-'; counterparty: string } | null {
  const m = text.match(ARROW_PATTERN);
  if (!m) return null;
  const [, owner, arrow, counterparty] = m;
  return {
    owner: owner.toLowerCase(),
    arrow: arrow as '→' | '←' | '->' | '<-',
    counterparty: counterparty.toLowerCase(),
  };
}

/**
 * Step 0: self-pattern pre-check.
 * Returns true if the text starts (case-insensitively, ignoring leading
 * whitespace) with one of `SELF_PATTERN_PREFIXES`.
 */
function isSelfPattern(text: string): boolean {
  const head = text.trimStart().toLowerCase();
  for (const prefix of SELF_PATTERN_PREFIXES) {
    if (head.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Extract candidate name tokens from natural-language prepositions.
 * Returns the literal name strings (preserved case) in document order.
 * Duplicates are de-duplicated by lowercase key.
 *
 * Multi-word resolution: when "to Lindsay Gray" appears, the regex matches
 * "to Lindsay" — we then peek the next token; if it's also capitalized
 * AND the combined "Lindsay Gray" resolves in the directory, we use the
 * combined form.
 */
function extractNaturalLanguageNames(
  text: string,
  directory: PersonDirectory,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // Reset lastIndex on the global regex before each scan (safety; we
  // construct fresh matchAll iterators below but the literal regex
  // itself is module-scoped global).
  const matches = Array.from(text.matchAll(NL_PREPOSITION_PATTERN));
  for (const m of matches) {
    const firstName = m[2];
    if (!firstName) continue;
    // Peek the next 1-2 tokens for a multi-word name.
    const afterIdx = (m.index ?? 0) + m[0].length;
    const tail = text.slice(afterIdx).match(/^\s+([A-Z][a-z]+)/);
    if (tail) {
      const combined = `${firstName} ${tail[1]}`;
      const combinedKey = normalizeLookupKey(combined);
      if (directory.has(combinedKey)) {
        if (!seen.has(combinedKey)) {
          seen.add(combinedKey);
          out.push(combined);
        }
        continue;
      }
    }
    const key = normalizeLookupKey(firstName);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(firstName);
    }
  }
  return out;
}

/**
 * Build a Stakeholder from a slug + role; refuses to emit duplicates by
 * slug (callers de-duplicate; this is the inner guard).
 */
function makeStakeholder(slug: string, role: StakeholderRole): Stakeholder {
  return { slug, role };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
export function extractCounterpartiesFromText(
  text: string,
  ownerSlug: string,
  direction: CommitmentDirection,
  directory: PersonDirectory,
): ExtractCounterpartiesResult {
  const ownerKey = ownerSlug.toLowerCase();

  // -------------------------------------------------------------------------
  // Step 0: self-pattern pre-check
  // -------------------------------------------------------------------------
  // Self-pattern only fires when NO arrow notation is present. An entry
  // like "[@john-koht → @dave] Note to self: prep for review" would be
  // legacy/contradictory; arrow wins (the explicit directive overrides
  // the self-marker).
  if (isSelfPattern(text) && !findArrowMatch(text)) {
    return {
      stakeholders: [makeStakeholder(ownerKey, 'self')],
      direction: 'self',
      ambiguous: false,
    };
  }

  // -------------------------------------------------------------------------
  // Step 1: arrow notation
  // -------------------------------------------------------------------------
  const arrow = findArrowMatch(text);
  if (arrow) {
    // Direction-aware role assignment:
    //   → (outbound) + commitment direction i_owe_them → counterparty=recipient
    //   ← (inbound)  + commitment direction they_owe_me → counterparty=sender
    // We trust the commitment's direction field (caller-passed) rather
    // than re-deriving from the arrow glyph — the two should agree, but
    // when they disagree the direction field is authoritative because
    // it's what downstream lookups already filter on.
    const role = roleForDirection(direction);
    // Defensive: if the parsed counterparty IS the owner (an entry like
    // "@john-koht → @john-koht: ..."), fall through to self.
    if (arrow.counterparty === ownerKey) {
      return {
        stakeholders: [makeStakeholder(ownerKey, 'self')],
        direction: 'self',
        ambiguous: false,
      };
    }
    return {
      stakeholders: [makeStakeholder(arrow.counterparty, role)],
      direction,
      ambiguous: false,
    };
  }

  // -------------------------------------------------------------------------
  // Step 2: natural language (preposition + capitalized name)
  // -------------------------------------------------------------------------
  const names = extractNaturalLanguageNames(text, directory);
  const ambiguousNames: AmbiguousName[] = [];
  const resolved: Stakeholder[] = [];
  const seenSlugs = new Set<string>();

  for (const name of names) {
    const candidates = directory.get(normalizeLookupKey(name));
    if (!candidates || candidates.length === 0) continue;
    if (candidates.length > 1) {
      ambiguousNames.push({ name, candidates: [...candidates] });
      continue;
    }
    const slug = candidates[0].toLowerCase();
    if (slug === ownerKey) continue; // never include the owner
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    resolved.push(makeStakeholder(slug, roleForDirection(direction)));
  }

  if (ambiguousNames.length > 0) {
    // AC1e: ambiguous → empty stakeholders[], populated ambiguousNames.
    // Caller (migration) surfaces these for user disambiguation.
    return {
      stakeholders: [],
      direction,
      ambiguous: true,
      ambiguousNames,
    };
  }

  if (resolved.length > 0) {
    return {
      stakeholders: resolved,
      direction,
      ambiguous: false,
    };
  }

  // -------------------------------------------------------------------------
  // Step 3: self-fallback
  // -------------------------------------------------------------------------
  // No arrow, no natural-language resolution, no self-pattern → the
  // commitment text is generic enough that the owner is the only sensible
  // stakeholder. Direction shifts to 'self' (M2 mitigation: self stays
  // out of downstream counterparty-overlap).
  return {
    stakeholders: [makeStakeholder(ownerKey, 'self')],
    direction: 'self',
    ambiguous: false,
  };
}

// ---------------------------------------------------------------------------
// Directory builder (convenience)
// ---------------------------------------------------------------------------

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
export function buildPersonDirectory(
  people: ReadonlyArray<{ slug: string; name: string }>,
): PersonDirectory {
  const map = new Map<string, string[]>();
  for (const p of people) {
    const slug = p.slug.toLowerCase();
    if (!p.name) continue;
    const lowered = p.name.toLowerCase().trim();
    // Full display name
    const fullKey = lowered.replace(/\s+/g, ' ');
    const existing = map.get(fullKey) ?? [];
    if (!existing.includes(slug)) {
      existing.push(slug);
      map.set(fullKey, existing);
    }
    // First-name token
    const firstName = fullKey.split(' ')[0];
    if (firstName && firstName !== fullKey) {
      const existingFirst = map.get(firstName) ?? [];
      if (!existingFirst.includes(slug)) {
        existingFirst.push(slug);
        map.set(firstName, existingFirst);
      }
    }
  }
  return map;
}
