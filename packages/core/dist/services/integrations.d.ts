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
    /**
     * Returns the keys of integrations that are present in the workspace config
     * (arete.yaml integrations map + backward-compat configs dir).
     *
     * "Configured" means the user has set the integration up at all — it is the
     * signal used by winddown gather steps (slack-digest, email-triage) to decide
     * whether to invoke an integration or SKIP it silently. A user who never
     * configured an integration is in their normal configuration, not a degraded
     * one, so the absence of a key here is NOT a degraded state.
     *
     * An integration counts as configured when it appears in the config with any
     * status other than 'inactive'/null (i.e. it was set up, even if pull later
     * fails). Calendar provider aliases are expanded the same way as list().
     */
    listConfigured(workspaceRoot: string): Promise<string[]>;
    configure(workspaceRoot: string, integration: string, config: Record<string, unknown>): Promise<void>;
    private getPaths;
    private getFullPaths;
    private getManifestIntegrations;
    private getIntegrationStatus;
    private loadOAuthTokenStatus;
}
//# sourceMappingURL=integrations.d.ts.map