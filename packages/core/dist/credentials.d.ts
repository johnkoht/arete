/**
 * Global AI credentials management.
 *
 * Credentials are stored in ~/.arete/credentials.yaml with 600 permissions.
 * OAuth credentials are stored in ~/.arete/auth.json.
 * This is distinct from workspace-level integration credentials (.credentials/).
 *
 * Priority: Environment variable > OAuth > credentials file
 */
import { type OAuthCredentials } from '@mariozechner/pi-ai/oauth';
/** Credential entry for a provider */
export interface ProviderCredentials {
    api_key: string;
}
/** Credentials file structure */
export type CredentialsFile = Partial<Record<string, ProviderCredentials>>;
/** Return type for getConfiguredProviders */
export interface ConfiguredProvider {
    provider: string;
    source: 'env' | 'file' | 'oauth';
}
/** OAuth credentials file structure */
export type OAuthCredentialsFile = Record<string, OAuthCredentials & {
    type: 'oauth';
}>;
/**
 * Get the path to the global credentials file.
 */
export declare function getCredentialsPath(): string;
/**
 * Get the path to the global OAuth credentials file.
 */
export declare function getOAuthPath(): string;
/**
 * Load OAuth credentials from auth.json.
 */
export declare function loadOAuthCredentials(): OAuthCredentialsFile;
/**
 * Save OAuth credentials to auth.json.
 * Uses read-modify-write to avoid clobbering other providers' credentials.
 */
export declare function saveOAuthCredentials(provider: string, credentials: OAuthCredentials): void;
/**
 * Get list of OAuth providers that support login.
 */
export declare function getAvailableOAuthProviders(): Array<{
    id: string;
    name: string;
}>;
/**
 * Check if a provider has OAuth credentials configured.
 */
export declare function hasOAuthCredentials(provider: string): boolean;
/**
 * Get API key for a provider via OAuth.
 * Automatically refreshes expired tokens.
 * Returns null if no OAuth credentials exist.
 * Throws if refresh fails.
 */
export declare function getOAuthApiKeyForProvider(provider: string): Promise<{
    apiKey: string;
    refreshed: boolean;
} | null>;
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
 * Returns env-var, OAuth, and file-based credentials with source info.
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