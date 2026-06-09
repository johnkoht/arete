/**
 * Phase 10a v2 commitment hash + text normalization (Step 2).
 *
 * Splits the v2 dedup hash into its own module so:
 *   1. `services/commitments.ts` (which still emits v1 hashes) doesn't
 *      need to import v2 logic; both hash schemes coexist during the
 *      3-5 day dry-run window.
 *   2. The migration tool (Step 4) and the reactive dedup pipeline
 *      (Phase 10b) share ONE normalizer — a regression in either
 *      surfaces immediately.
 *   3. The hash-invariance gate (createdAt MUST NOT be in inputs) is
 *      readable in one place.
 *
 * Hash inputs (per plan §"Data model" + §"Hard part 5"):
 *   sha256(text_normalized + direction)
 *
 * No counterparty, no `createdAt`, no `area` — only the action
 * semantics + ownership direction. Counterparty becomes metadata
 * (`stakeholders[]`); two extractions of the same intent with different
 * recipients hash IDENTICALLY here and dedup falls to the LLM/hybrid
 * pipeline downstream.
 *
 * **Why no counterparty in the hash?** Phase 10's bet (a): commitment =
 * (action + direction). The 600-row arete-reserv sample strongly
 * suggests counterparty granularity wasn't tracking distinct
 * obligations — it was tracking who-was-in-the-room. Per-stakeholder
 * granularity can come back via downstream gates if soak shows the bet
 * is wrong.
 *
 * Pure module — no I/O, no filesystem, no service coupling.
 */
import { createHash } from 'node:crypto';
// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------
/**
 * Verb lemmatization rules (minimal, rules-based — no library).
 *
 * Drives a single-pass token rewrite so that "talked" / "talking" /
 * "will talk" all collapse to "talk" before hashing.
 *
 * Conservative on purpose. The plan's §"Hard part 5" calls out the
 * brittleness of broad lemmatization; we ship a short, observably-correct
 * list. Soak feedback drives expansion.
 *
 * Tuple shape: [matcher, replacement]. Matcher is the exact normalized
 * token (already lowercased + punct-stripped). Replacement is the
 * canonical form. Multi-token forms (e.g., "will send") are handled
 * separately by `collapseMultiTokenForms` before this lookup runs.
 */
const VERB_LEMMAS = new Map([
    // talk
    ['talked', 'talk'],
    ['talking', 'talk'],
    ['talks', 'talk'],
    // send
    ['sent', 'send'],
    ['sending', 'send'],
    ['sends', 'send'],
    // chat
    ['chatted', 'chat'],
    ['chatting', 'chat'],
    ['chats', 'chat'],
    // discuss
    ['discussed', 'discuss'],
    ['discussing', 'discuss'],
    ['discusses', 'discuss'],
    // follow up
    ['followed', 'follow'],
    ['following', 'follow'],
    ['follows', 'follow'],
    // review
    ['reviewed', 'review'],
    ['reviewing', 'review'],
    ['reviews', 'review'],
    // share
    ['shared', 'share'],
    ['sharing', 'share'],
    ['shares', 'share'],
    // ping
    ['pinged', 'ping'],
    ['pinging', 'ping'],
    ['pings', 'ping'],
    // schedule
    ['scheduled', 'schedule'],
    ['scheduling', 'schedule'],
    ['schedules', 'schedule'],
    // write
    ['wrote', 'write'],
    ['writing', 'write'],
    ['writes', 'write'],
    ['written', 'write'],
    // deliver
    ['delivered', 'deliver'],
    ['delivering', 'deliver'],
    ['delivers', 'deliver'],
    // prepare
    ['prepared', 'prepare'],
    ['preparing', 'prepare'],
    ['prepares', 'prepare'],
    // draft
    ['drafted', 'draft'],
    ['drafting', 'draft'],
    ['drafts', 'draft'],
    // confirm
    ['confirmed', 'confirm'],
    ['confirming', 'confirm'],
    ['confirms', 'confirm'],
    // create
    ['created', 'create'],
    ['creating', 'create'],
    ['creates', 'create'],
    // update
    ['updated', 'update'],
    ['updating', 'update'],
    ['updates', 'update'],
]);
/**
 * Leading-clause strip patterns (intent prefixes that don't change meaning).
 * Each entry is a token sequence; if the normalized text starts with this
 * exact sequence (whitespace-separated), the sequence is stripped before
 * lemmatization. Longer prefixes come FIRST so "will go ahead and" wins
 * over "will".
 */
const LEADING_INTENT_PREFIXES = [
    ['ill', 'go', 'ahead', 'and'],
    ['i', 'will', 'go', 'ahead', 'and'],
    ['i', 'am', 'going', 'to'],
    ['im', 'going', 'to'],
    ['going', 'to'],
    ['gonna'],
    ['i', 'will'],
    ['ill'],
    ['i', 'should'],
    ['ill', 'just'],
    ['need', 'to'],
    ['have', 'to'],
];
/**
 * Multi-token verbal forms — "will send" → "send", "gonna talk" → "talk".
 *
 * Applied after `LEADING_INTENT_PREFIXES` strip but before token-level
 * lemmatization. Rationale: an extraction like "Will send the deck"
 * shouldn't hash differently from "Send the deck" — the intent prefix
 * is noise.
 */
const MULTI_TOKEN_FORMS = [
    [['will', 'send'], 'send'],
    [['will', 'talk'], 'talk'],
    [['will', 'follow', 'up'], 'follow up'],
    [['will', 'review'], 'review'],
    [['will', 'share'], 'share'],
    [['will', 'ping'], 'ping'],
    [['will', 'schedule'], 'schedule'],
];
/**
 * Strip arrow notation + `@<slug>:` prefix patterns from raw text.
 *
 * Per plan §"Hard part 5":
 *   - `@<owner-slug> → @<counterparty-slug>: <body>` → `<body>`
 *   - `@<owner-slug>: <body>` → `<body>`
 *   - Standalone arrows (→ ← -> <-) stripped wherever they appear.
 *
 * Idempotent: applying twice is a no-op.
 */
function stripArrowNotation(text) {
    let out = text;
    // Owner-counterparty prefix: "[@owner → @cp] body" or "@owner → @cp: body"
    // Tolerate both bracketed and bare forms because both exist in the
    // workspace (staged-items.ts emits bracketed; manual notes use bare).
    out = out.replace(/^\s*\[?\s*@[a-z0-9-]+\s*[→←]\s*(?:@[a-z0-9-]+)?\s*\]?\s*:?\s*/i, '');
    // ASCII arrow variants
    out = out.replace(/^\s*\[?\s*@[a-z0-9-]+\s*(?:->|<-)\s*(?:@[a-z0-9-]+)?\s*\]?\s*:?\s*/i, '');
    // Bare `@<slug>:` prefix (no arrow)
    out = out.replace(/^\s*@[a-z0-9-]+\s*:\s*/i, '');
    // Strip remaining standalone arrows mid-text
    out = out.replace(/[→←]/g, ' ');
    out = out.replace(/(?:^|\s)(?:->|<-)(?=\s|$)/g, ' ');
    return out;
}
/**
 * Lowercase + punctuation strip + whitespace collapse. Punctuation list
 * is conservative — keeps `@` and `-` (slugs survive) but strips
 * everything else commonly seen at end-of-sentence or as separators.
 */
function basicNormalize(text) {
    return text
        .toLowerCase()
        // Apostrophes are elided (NOT converted to whitespace) so "I'll" and
        // "won't" collapse to "ill" / "wont" — the leading-intent stripper's
        // rule list contains "ill" as a unit, so a space-converting strip
        // would break the prefix match.
        .replace(/['`]/g, '')
        .replace(/[.,;:!?"(){}[\]/\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Apply the leading-intent prefix strip rules (rules-based).
 * Tokens are split on whitespace; the longest prefix-match wins.
 */
function stripLeadingIntent(tokens) {
    for (const prefix of LEADING_INTENT_PREFIXES) {
        if (tokens.length < prefix.length)
            continue;
        let matches = true;
        for (let i = 0; i < prefix.length; i += 1) {
            if (tokens[i] !== prefix[i]) {
                matches = false;
                break;
            }
        }
        if (matches) {
            return tokens.slice(prefix.length);
        }
    }
    return tokens;
}
/**
 * Collapse known multi-token forms (e.g., "will send" → "send"). Sweeps
 * left-to-right; the first match at each position wins. Replacement may
 * be a multi-word string ("follow up") — split into tokens before insert.
 */
function collapseMultiTokenForms(tokens) {
    const out = [];
    let i = 0;
    outer: while (i < tokens.length) {
        for (const [seq, repl] of MULTI_TOKEN_FORMS) {
            if (i + seq.length > tokens.length)
                continue;
            let matches = true;
            for (let j = 0; j < seq.length; j += 1) {
                if (tokens[i + j] !== seq[j]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                out.push(...repl.split(/\s+/));
                i += seq.length;
                continue outer;
            }
        }
        out.push(tokens[i]);
        i += 1;
    }
    return out;
}
/**
 * Apply single-token lemmas. Replaces a token in-place if a rule matches.
 */
function lemmatizeTokens(tokens) {
    return tokens.map((t) => VERB_LEMMAS.get(t) ?? t);
}
/**
 * Strip `@<slug>` mentions from the token stream.
 *
 * Owner-as-personSlug rewrites + arrow stripping above remove the
 * STRUCTURAL slug markers; this catches inline mentions like
 * "follow up with @dave-wiedenheft about staffing" that survive the
 * arrow strip. They are downstream metadata — `stakeholders[]` carries
 * the same information, so removing them from the hash keeps text
 * variants stable.
 */
function stripSlugMentions(tokens) {
    return tokens.filter((t) => !t.startsWith('@'));
}
/**
 * Public API: text normalization for the v2 hash.
 *
 * Pipeline:
 *   1. `stripArrowNotation` — remove `[@a → @b]` / `@a:` prefixes + bare arrows
 *   2. `basicNormalize`     — lowercase, punct strip, whitespace collapse
 *   3. tokenize on whitespace
 *   4. `stripLeadingIntent` — drop "ill", "going to", "gonna", etc.
 *   5. `collapseMultiTokenForms` — "will send" → "send"
 *   6. `lemmatizeTokens` — token-level verb lemmas
 *   7. `stripSlugMentions` — drop residual `@<slug>` tokens
 *   8. rejoin with single space
 *
 * Idempotent: `normalize(normalize(x)) === normalize(x)` for all
 * representative inputs.
 *
 * Exported so the migration diff report can show the normalized text
 * next to the canonical for an ambiguous group.
 */
export function normalizeCommitmentTextV2(text) {
    if (!text)
        return '';
    const arrows = stripArrowNotation(text);
    const basic = basicNormalize(arrows);
    if (basic.length === 0)
        return '';
    const tokens = basic.split(' ').filter(Boolean);
    const noIntent = stripLeadingIntent(tokens);
    const collapsed = collapseMultiTokenForms(noIntent);
    const lemmatized = lemmatizeTokens(collapsed);
    const noMentions = stripSlugMentions(lemmatized);
    return noMentions.join(' ').trim();
}
// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------
/**
 * Compute the Phase 10a v2 commitment dedup hash.
 *
 * Inputs (and ONLY these inputs):
 *   - normalized text (via `normalizeCommitmentTextV2`)
 *   - direction ('i_owe_them' | 'they_owe_me' | 'self')
 *
 * NOT in the hash:
 *   - counterparty / personSlug / stakeholders     — per plan, becomes metadata
 *   - createdAt                                    — R3 invariant (10a-pre)
 *   - area / projectSlug / goalSlug                — metadata only
 *   - resolvedAt / status                          — lifecycle, not identity
 *
 * The function accepts the RAW text (not pre-normalized) so callers
 * don't have to choose between two normalizers — there is one. Callers
 * that need both the hash AND the normalized text use
 * `normalizeCommitmentTextV2(text)` themselves.
 */
export function computeCommitmentHashV2(text, direction) {
    const normalized = normalizeCommitmentTextV2(text);
    return createHash('sha256').update(`${normalized}|${direction}`).digest('hex');
}
//# sourceMappingURL=commitments-hash-v2.js.map