/**
 * Generic gws CLI wrapper — executes `gws <service> <command> --format json [args]`.
 * Integrations may use child_process (infrastructure, not services).
 */
import type { GwsDeps, GwsExecOptions } from './types.js';
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
export declare function gwsExec(service: string, command: string, args?: Record<string, string | number | boolean>, options?: GwsExecOptions, deps?: GwsDeps): Promise<unknown>;
//# sourceMappingURL=client.d.ts.map