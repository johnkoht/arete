/**
 * Shared types for Google Workspace (gws CLI) integrations.
 */
// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------
export class GwsNotInstalledError extends Error {
    constructor(message = 'gws CLI binary not found in PATH. Install it to use Google Workspace integrations.') {
        super(message);
        this.name = 'GwsNotInstalledError';
    }
}
export class GwsAuthError extends Error {
    constructor(message = 'gws CLI authentication failed. Run `gws auth login` to authenticate.') {
        super(message);
        this.name = 'GwsAuthError';
    }
}
export class GwsTimeoutError extends Error {
    constructor(command, timeoutMs) {
        super(`gws command timed out after ${timeoutMs}ms: ${command}`);
        this.name = 'GwsTimeoutError';
    }
}
export class GwsExecError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GwsExecError';
    }
}
/**
 * Current cache envelope version. Bump if EmailThread shape changes.
 */
export const GMAIL_SENT_CACHE_VERSION = 2;
/**
 * Normalize an email address for indexing/matching (Phase 11-pre, eng MC1).
 *
 * - Strips whitespace.
 * - Extracts the address from `"Name" <email>` form.
 * - Lowercases.
 * - Returns '' for unparseable input.
 */
export function normalizeEmail(raw) {
    if (!raw)
        return '';
    const trimmed = String(raw).trim();
    if (!trimmed)
        return '';
    // Match Name <email@domain> form first.
    const angleMatch = trimmed.match(/<([^>]+)>/);
    const candidate = angleMatch ? angleMatch[1] : trimmed;
    const inner = candidate.trim().toLowerCase();
    // Basic shape check — must contain '@' and have non-empty local + domain.
    if (!inner.includes('@'))
        return '';
    const [local, domain] = inner.split('@');
    if (!local || !domain)
        return '';
    return inner;
}
//# sourceMappingURL=types.js.map