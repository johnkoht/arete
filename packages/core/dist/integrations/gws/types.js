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
//# sourceMappingURL=types.js.map