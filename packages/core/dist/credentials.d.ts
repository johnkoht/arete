/**
 * Global AI credentials management.
 *
 * Credentials are stored in ~/.arete/credentials.yaml with 600 permissions.
 * This is distinct from workspace-level integration credentials (.credentials/).
 *
 * Priority: Environment variable > credentials file
 */
/** Credential entry for a provider */
export interface ProviderCredentials {
    api_key: string;
}
/** Credentials file structure */
export type CredentialsFile = Partial<Record<string, ProviderCredentials>>;
/** Return type for getConfiguredProviders */
export interface ConfiguredProvider {
    provider: string;
    source: 'env' | 'file';
}
/**
 * Get the path to the global credentials file.
 */
export declare function getCredentialsPath(): string;
/**
 * Load credentials from the credentials file.
 * Does NOT check env vars - use getApiKey for that.
 */
export declare function loadCredentials(): CredentialsFile;
/**
 * Save a credential for a provider.
 * Uses read-modify-write to avoid clobbering other providers' keys.
 * Creates the file with 600 permissions if it doesn't exist.
 */
export declare function saveCredential(provider: string, apiKey: string): void;
/**
 * Get API key for a provider.
 * Priority: Environment variable > credentials file
 *
 * Returns null if no API key is found (does not throw).
 */
export declare function getApiKey(provider: string): string | null;
/**
 * Get the environment variable name for a provider.
 */
export declare function getEnvVarName(provider: string): string | null;
/**
 * Get list of providers that have credentials configured.
 * Returns both env-var and file-based credentials with source info.
 */
export declare function getConfiguredProviders(): ConfiguredProvider[];
/**
 * Check if credentials file has secure permissions (600).
 * Returns true if file doesn't exist (will be created with correct perms).
 */
export declare function hasSecurePermissions(): boolean;
/**
 * Set environment variables from credentials file.
 * Only sets vars that are not already set (env > file).
 * Call this at startup to make credentials available to pi-ai's getEnvApiKey.
 */
export declare function loadCredentialsIntoEnv(): void;
//# sourceMappingURL=credentials.d.ts.map