/**
 * Phase 10a v2 read-path feature flag (Step 5).
 *
 * Gates whether read paths use `stakeholders[]` (v2) or `personSlug` (v1).
 * Defaults to FALSE — flipped only after `arete commitments migrate --to-v2
 * --apply` has run and the user has confirmed the dry-run + delta diff.
 *
 * Sources (in priority order; first non-empty wins):
 *   1. Environment variable `ARETE_COMMITMENTS_V2_ACTIVE` (`true` / `1`).
 *   2. Workspace config `.arete/config.json` field
 *      `commitments_v2_active: boolean` (under top-level, NOT under any
 *      sub-section — kept loose to avoid churning AreteConfig type
 *      until the flag actually flips for users).
 *   3. Default: `false`.
 *
 * Pure read — no side effects, no caching. Callers should treat the
 * resolved value as an immutable snapshot for the duration of a single
 * command; flipping mid-process is unsupported.
 *
 * NOTE: This module DOES NOT activate the flag anywhere in production
 * code in 10a — the v2 read path lands when a follow-up flips
 * `getCommitmentCounterpartySlugs` / brief assemblers / etc. to honor
 * the value. Step 5's scope is just the wiring.
 */
import type { StorageAdapter } from '../storage/adapter.js';
/**
 * Resolve the flag value from env + workspace config.
 *
 * @param workspaceRoot Absolute path to the workspace root (used to
 *                      resolve `.arete/config.json`).
 * @param storage       Storage adapter (so tests can pass an in-memory
 *                      adapter without hitting disk).
 */
export declare function isCommitmentsV2Active(workspaceRoot: string | null, storage: StorageAdapter): Promise<boolean>;
/**
 * Synchronous variant for code paths that already have the config object
 * loaded. Mirrors `isCommitmentsV2Active` but takes the parsed config
 * directly. Returns the env-overridden value when set.
 */
export declare function isCommitmentsV2ActiveFromConfig(config: Record<string, unknown> | null): boolean;
//# sourceMappingURL=commitments-v2-flag.d.ts.map