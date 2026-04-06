/**
 * GWS CLI binary detection.
 * Never throws — returns { installed: false } when gws is not found.
 */
import type { GwsDeps, GwsDetectionResult } from './types.js';
/**
 * Detect whether the `gws` CLI binary is installed and authenticated.
 *
 * Uses DI via `deps` parameter for testability (see ical-buddy.ts pattern).
 */
export declare function detectGws(deps?: GwsDeps): Promise<GwsDetectionResult>;
//# sourceMappingURL=detection.d.ts.map