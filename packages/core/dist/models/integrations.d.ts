/**
 * Integrations domain types.
 *
 * Imports from common.ts ONLY.
 */
/** Fathom transcript from integration */
export type FathomTranscript = {
    id: string;
    title: string;
    date: string;
    duration?: number;
    summary?: string;
    transcriptPath?: string;
    meetingId?: string;
};
/** Integration configuration (maps to IntegrationDefinition) */
export type IntegrationConfig = {
    name: string;
    displayName: string;
    description: string;
    implements: string[];
    auth: IntegrationAuth;
    status: 'available' | 'planned';
};
/** Integration auth configuration */
export type IntegrationAuth = {
    type: 'api_key' | 'oauth' | 'none';
    envVar?: string;
    configKey?: string;
    instructions?: string;
};
/** Integration definition */
export type IntegrationDefinition = {
    name: string;
    displayName: string;
    description: string;
    implements: string[];
    auth: IntegrationAuth;
    status: 'available' | 'planned';
};
/** Seedable/pullable integration config */
export type ScriptableIntegration = {
    name: string;
    displayName: string;
    description: string;
    defaultDays: number;
    maxDays?: number;
    script: string;
    command: string;
};
/** Result from running an integration script */
export type ScriptResult = {
    stdout: string;
    stderr: string;
    code?: number;
};
/** Options for pull operations */
export type PullOptions = {
    integration: string;
    days?: number;
    force?: boolean;
    /** Notion: array of page URLs or IDs to pull */
    pages?: string[];
    /** Notion: where to save pulled pages */
    destination?: string;
};
/** Result of a pull operation */
export type PullResult = {
    integration: string;
    itemsProcessed: number;
    itemsCreated: number;
    itemsUpdated: number;
    errors: string[];
};
/** Integration status from config file */
export type IntegrationStatus = 'active' | 'inactive' | 'error' | null;
/** Entry returned by IntegrationService.list() */
export type IntegrationListEntry = {
    name: string;
    displayName: string;
    description: string;
    implements: string[];
    status: 'available' | 'planned';
    configured: IntegrationStatus;
    active: boolean;
};
//# sourceMappingURL=integrations.d.ts.map