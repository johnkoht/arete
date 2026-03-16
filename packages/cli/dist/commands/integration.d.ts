/**
 * Integration commands — list, add, configure, remove
 */
import type { StorageAdapter } from '@arete/core';
import type { Command } from 'commander';
type IntegrationConfigurer = {
    configure: (workspaceRoot: string, integration: string, config: Record<string, unknown>) => Promise<void>;
};
export declare function registerIntegrationCommands(program: Command): void;
export declare function resolveNotionToken(tokenFromOption: string | undefined, promptFn: () => Promise<string>): Promise<string>;
export declare function configureNotionIntegration(input: {
    storage: StorageAdapter;
    integrationService: IntegrationConfigurer;
    workspaceRoot: string;
    token: string;
    fetchFn?: typeof fetch;
    baseUrl?: string;
}): Promise<void>;
export declare function validateNotionToken(token: string, deps?: {
    fetchFn?: typeof fetch;
    baseUrl?: string;
}): Promise<void>;
export declare function saveNotionApiKey(storage: StorageAdapter, workspaceRoot: string, token: string): Promise<void>;
export declare function getNotionMcpSnippet(): string;
export {};
//# sourceMappingURL=integration.d.ts.map