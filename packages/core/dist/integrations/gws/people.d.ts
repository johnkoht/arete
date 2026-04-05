/**
 * Directory / People provider — thin wrapper over the `gws` CLI for
 * Google Workspace directory lookups.
 *
 * Implements `DirectoryProvider` interface using `gwsExec()` for CLI calls
 * and `detectGws()` for availability checks.
 */
import type { DirectoryPerson, DirectoryProvider, GwsDeps } from './types.js';
export declare class GwsDirectoryProvider implements DirectoryProvider {
    readonly name = "directory";
    private deps?;
    constructor(deps?: GwsDeps);
    isAvailable(): Promise<boolean>;
    lookupPerson(email: string): Promise<DirectoryPerson | null>;
    searchDirectory(query: string, options?: {
        maxResults?: number;
    }): Promise<DirectoryPerson[]>;
}
export declare function getGwsDirectoryProvider(deps?: GwsDeps): GwsDirectoryProvider;
//# sourceMappingURL=people.d.ts.map