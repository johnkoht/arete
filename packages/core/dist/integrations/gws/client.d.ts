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
import type { GwsDeps, GwsExecOptions } from './types.js';
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
export declare function gwsExec(service: string, command: string, params?: Record<string, unknown>, options?: GwsExecOptions, deps?: GwsDeps): Promise<unknown>;
//# sourceMappingURL=client.d.ts.map