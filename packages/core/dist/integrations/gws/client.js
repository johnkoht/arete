/**
 * Generic gws CLI wrapper — executes `gws <service> <command> --format json [args]`.
 * Integrations may use child_process (infrastructure, not services).
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
 * Build CLI argument list from a record of key/value pairs.
 * - boolean `true`  → `--key`
 * - boolean `false` → skipped
 * - string / number → `--key value`
 */
function buildArgs(args) {
    const result = [];
    for (const [key, value] of Object.entries(args)) {
        if (value === false)
            continue;
        const flag = key.length === 1 ? `-${key}` : `--${key}`;
        if (value === true) {
            result.push(flag);
        }
        else {
            result.push(flag, String(value));
        }
    }
    return result;
}
/**
 * Execute a gws CLI command and return parsed JSON output.
 *
 * @param service  - GWS service name (e.g. 'gmail', 'drive', 'docs')
 * @param command  - Sub-command (e.g. 'list', 'search', 'get')
 * @param args     - Optional key/value argument map
 * @param options  - Execution options (timeout)
 * @param deps     - Dependency injection for testability
 * @returns Parsed JSON from stdout
 */
export async function gwsExec(service, command, args, options, deps) {
    const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT;
    const { exec } = deps ?? defaultDeps(timeoutMs);
    const cliArgs = [service, command, '--format', 'json'];
    if (args) {
        cliArgs.push(...buildArgs(args));
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
    // Parse JSON output
    try {
        return JSON.parse(stdout);
    }
    catch {
        throw new GwsExecError(`Failed to parse JSON from gws output.\nCommand: ${commandStr}\nRaw stdout: ${stdout}`);
    }
}
//# sourceMappingURL=client.js.map