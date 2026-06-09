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
import type { CommitmentDirection } from '../models/index.js';
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
export declare function normalizeCommitmentTextV2(text: string): string;
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
export declare function computeCommitmentHashV2(text: string, direction: CommitmentDirection): string;
//# sourceMappingURL=commitments-hash-v2.d.ts.map