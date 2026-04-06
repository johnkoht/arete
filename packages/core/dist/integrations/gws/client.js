/**
 * Generic gws CLI wrapper — executes `gws <service> <resource...> <method> --format json --params '{...}'`.
 * Integrations may use child_process (infrastructure, not services).
 *
 * The actual gws CLI uses:
 *   gws <service> <resource> [sub-resource] <method> --params '{"key":"value"}' --format json
 *
 * All parameters are passed as a single --params JSON blob.
 * Multi-segment commands (e.g. 'users messages list') are split by space.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { GwsNotInstalledError, GwsAuthError, GwsTimeoutError, GwsExecError, } from './types.js';
const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT = 30_000;
function defaultDeps(timeoutMs) {
    return {
        exec: (command, args) => execFileAsync(command, args, { timeout: timeoutMs }),
    };
}
/**
 * Execute a gws CLI command and return parsed JSON output.
 *
 * @param service  - GWS service name (e.g. 'gmail', 'drive', 'docs')
 * @param command  - Resource path + method, space-separated (e.g. 'users messages list', 'files list')
 * @param params   - Optional parameters serialized as --params JSON
 * @param options  - Execution options (timeout)
 * @param deps     - Dependency injection for testability
 * @returns Parsed JSON from stdout
 */
export async function gwsExec(service, command, params, options, deps) {
    const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT;
    const { exec } = deps ?? defaultDeps(timeoutMs);
    // Split multi-segment command into path parts
    const commandParts = command.split(' ').filter(Boolean);
    const cliArgs = [service, ...commandParts, '--format', 'json'];
    if (params && Object.keys(params).length > 0) {
        cliArgs.push('--params', JSON.stringify(params));
    }
    const commandStr = `gws ${cliArgs.join(' ')}`;
    let stdout;
    let stderr;
    try {
        const result = await exec('gws', cliArgs);
        stdout = result.stdout ?? '';
        stderr = result.stderr ?? '';
    }
    catch (err) {
        const execErr = err;
        // Binary not found
        if (execErr.code === 'ENOENT') {
            throw new GwsNotInstalledError();
        }
        // Process killed (timeout)
        if (execErr.killed || execErr.signal === 'SIGTERM') {
            throw new GwsTimeoutError(commandStr, timeoutMs);
        }
        const errStderr = (execErr.stderr ?? '').toLowerCase();
        // Auth errors
        if (errStderr.includes('auth') ||
            errStderr.includes('unauthenticated') ||
            errStderr.includes('login required') ||
            errStderr.includes('token expired')) {
            throw new GwsAuthError(execErr.stderr ?? undefined);
        }
        // Generic exec error
        throw new GwsExecError(execErr.stderr
            ? `gws command failed: ${execErr.stderr}`
            : `gws command failed: ${commandStr}`);
    }
    // Ignore stderr informational output (e.g. "Using keyring backend: keyring")
    void stderr;
    // Parse JSON output
    try {
        return JSON.parse(stdout);
    }
    catch {
        throw new GwsExecError(`Failed to parse JSON from gws output.\nCommand: ${commandStr}\nRaw stdout: ${stdout}`);
    }
}
//# sourceMappingURL=client.js.map