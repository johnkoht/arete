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
import { join } from 'node:path';
/**
 * Resolve the flag value from env + workspace config.
 *
 * @param workspaceRoot Absolute path to the workspace root (used to
 *                      resolve `.arete/config.json`).
 * @param storage       Storage adapter (so tests can pass an in-memory
 *                      adapter without hitting disk).
 */
export async function isCommitmentsV2Active(workspaceRoot, storage) {
    // 1. Env wins.
    const env = process.env['ARETE_COMMITMENTS_V2_ACTIVE'];
    if (env && (env === '1' || env.toLowerCase() === 'true'))
        return true;
    if (env && (env === '0' || env.toLowerCase() === 'false'))
        return false;
    // 2. Workspace config.
    if (!workspaceRoot)
        return false;
    const configPath = join(workspaceRoot, '.arete/config.json');
    const content = await storage.read(configPath);
    if (content === null)
        return false;
    try {
        const parsed = JSON.parse(content);
        const v = parsed['commitments_v2_active'];
        if (v === true)
            return true;
        if (typeof v === 'string') {
            if (v === 'true' || v === '1')
                return true;
        }
    }
    catch {
        // Malformed config → fall through to default (safer than throwing).
    }
    return false;
}
/**
 * Synchronous variant for code paths that already have the config object
 * loaded. Mirrors `isCommitmentsV2Active` but takes the parsed config
 * directly. Returns the env-overridden value when set.
 */
export function isCommitmentsV2ActiveFromConfig(config) {
    const env = process.env['ARETE_COMMITMENTS_V2_ACTIVE'];
    if (env && (env === '1' || env.toLowerCase() === 'true'))
        return true;
    if (env && (env === '0' || env.toLowerCase() === 'false'))
        return false;
    if (!config)
        return false;
    const v = config['commitments_v2_active'];
    if (v === true)
        return true;
    if (typeof v === 'string' && (v === 'true' || v === '1'))
        return true;
    return false;
}
//# sourceMappingURL=commitments-v2-flag.js.map