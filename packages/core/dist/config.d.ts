/**
 * Configuration resolution
 * Priority: workspace arete.yaml > global ~/.arete/config.yaml > defaults
 *
 * Uses StorageAdapter for file access (no direct fs in services).
 */
import type { StorageAdapter } from './storage/adapter.js';
import type { AreteConfig } from './models/workspace.js';
export declare function getGlobalConfigPath(): string;
export declare function getWorkspaceConfigPath(workspacePath: string): string;
/**
 * Load resolved configuration for a workspace.
 */
export declare function loadConfig(storage: StorageAdapter, workspacePath: string | null): Promise<AreteConfig>;
export declare function getDefaultConfig(): AreteConfig;
//# sourceMappingURL=config.d.ts.map