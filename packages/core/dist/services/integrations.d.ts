/**
 * IntegrationService — manages integration pull and configuration.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { PullOptions, PullResult, IntegrationListEntry, AreteConfig } from '../models/index.js';
export declare class IntegrationService {
    private storage;
    private config;
    constructor(storage: StorageAdapter, config: AreteConfig);
    pull(workspaceRoot: string, integration: string, options: PullOptions): Promise<PullResult>;
    list(workspaceRoot: string): Promise<IntegrationListEntry[]>;
    configure(workspaceRoot: string, integration: string, config: Record<string, unknown>): Promise<void>;
    private getPaths;
    private getFullPaths;
    private getManifestIntegrations;
    private getIntegrationStatus;
    private loadOAuthTokenStatus;
}
//# sourceMappingURL=integrations.d.ts.map