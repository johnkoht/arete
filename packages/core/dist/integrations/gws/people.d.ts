/**
 * Directory / People provider — thin wrapper over the `gws` CLI for
 * Google Workspace directory lookups.
 *
 * People API command paths:
 *   gws people people searchContacts        --params '{"query":"...","readMask":"emailAddresses,names,organizations,photos","pageSize":N}'
 *   gws people people searchDirectoryPeople --params '{"query":"...","readMask":"emailAddresses,names,organizations,photos","sources":[...],"pageSize":N}'
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