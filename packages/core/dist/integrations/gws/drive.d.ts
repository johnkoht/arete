/**
 * Drive provider — thin wrapper over the `gws` CLI for Google Drive operations.
 *
 * Implements `DriveProvider` interface using `gwsExec()` for CLI calls
 * and `detectGws()` for availability checks.
 */
import type { DriveFile, DriveProvider, GwsDeps } from './types.js';
export declare class GwsDriveProvider implements DriveProvider {
    readonly name = "drive";
    private deps?;
    constructor(deps?: GwsDeps);
    isAvailable(): Promise<boolean>;
    search(query: string, options?: {
        maxResults?: number;
    }): Promise<DriveFile[]>;
    getFile(fileId: string): Promise<DriveFile>;
    getRecentFiles(options?: {
        maxResults?: number;
    }): Promise<DriveFile[]>;
}
export declare function getGwsDriveProvider(deps?: GwsDeps): GwsDriveProvider;
//# sourceMappingURL=drive.d.ts.map