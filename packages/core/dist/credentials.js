/**
 * Global AI credentials management.
 *
 * Credentials are stored in ~/.arete/credentials.yaml with 600 permissions.
 * OAuth credentials are stored in ~/.arete/auth.json.
 * This is distinct from workspace-level integration credentials (.credentials/).
 *
 * Priority: Environment variable > OAuth > credentials file
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getOAuthApiKey, getOAuthProviders, } from '@mariozechner/pi-ai/oauth';
/** Map of providers to their environment variable names */
const PROVIDER_ENV_VARS = {
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    openai: 'OPENAI_API_KEY',
    'amazon-bedrock': 'AWS_ACCESS_KEY_ID', // Bedrock uses AWS credentials
    xai: 'XAI_API_KEY',
    groq: 'GROQ_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
};
/**
 * Get the path to the global credentials file.
 */
export function getCredentialsPath() {
    return join(homedir(), '.arete', 'credentials.yaml');
}
/**
 * Get the path to the global OAuth credentials file.
 */
export function getOAuthPath() {
    return join(homedir(), '.arete', 'auth.json');
}
/**
 * Load OAuth credentials from auth.json.
 */
export function loadOAuthCredentials() {
    const authPath = getOAuthPath();
    if (!existsSync(authPath)) {
        return {};
    }
    try {
        const content = readFileSync(authPath, 'utf8');
        return JSON.parse(content);
    }
    catch {
        return {};
    }
}
/**
 * Save OAuth credentials to auth.json.
 * Uses read-modify-write to avoid clobbering other providers' credentials.
 */
export function saveOAuthCredentials(provider, credentials) {
    const authPath = getOAuthPath();
    const dir = dirname(authPath);
    // Ensure directory exists
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    // Read existing OAuth credentials
    const oauthCreds = loadOAuthCredentials();
    // Update the provider's credentials
    oauthCreds[provider] = { type: 'oauth', ...credentials };
    // Write back with secure permissions
    writeFileSync(authPath, JSON.stringify(oauthCreds, null, 2), { mode: 0o600 });
    // Ensure permissions are correct
    chmodSync(authPath, 0o600);
}
/**
 * Get list of OAuth providers that support login.
 */
export function getAvailableOAuthProviders() {
    return getOAuthProviders().map(p => ({ id: p.id, name: p.name }));
}
/**
 * Check if a provider has OAuth credentials configured.
 */
export function hasOAuthCredentials(provider) {
    const oauthCreds = loadOAuthCredentials();
    return !!oauthCreds[provider];
}
/**
 * Get API key for a provider via OAuth.
 * Automatically refreshes expired tokens.
 * Returns null if no OAuth credentials exist.
 * Throws if refresh fails.
 */
export async function getOAuthApiKeyForProvider(provider) {
    const oauthCreds = loadOAuthCredentials();
    if (!oauthCreds[provider]) {
        return null;
    }
    const originalExpires = oauthCreds[provider].expires;
    const result = await getOAuthApiKey(provider, oauthCreds);
    if (!result) {
        return null;
    }
    // Check if credentials were refreshed
    const refreshed = result.newCredentials.expires !== originalExpires;
    // Save updated credentials if refreshed
    if (refreshed) {
        saveOAuthCredentials(provider, result.newCredentials);
    }
    return { apiKey: result.apiKey, refreshed };
}
/**
 * Load credentials from the credentials file.
 * Does NOT check env vars - use getApiKey for that.
 */
export function loadCredentials() {
    const credPath = getCredentialsPath();
    if (!existsSync(credPath)) {
        return {};
    }
    try {
        const content = readFileSync(credPath, 'utf8');
        const parsed = parseYaml(content);
        return parsed ?? {};
    }
    catch {
        return {};
    }
}
/**
 * Save a credential for a provider.
 * Uses read-modify-write to avoid clobbering other providers' keys.
 * Creates the file with 600 permissions if it doesn't exist.
 */
export function saveCredential(provider, apiKey) {
    const credPath = getCredentialsPath();
    const dir = dirname(credPath);
    // Ensure directory exists
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    // Read existing credentials
    const credentials = loadCredentials();
    // Update the provider's credentials
    credentials[provider] = { api_key: apiKey };
    // Write back with secure permissions
    const content = stringifyYaml(credentials);
    writeFileSync(credPath, content, { mode: 0o600 });
    // Ensure permissions are correct (in case file existed with wrong perms)
    chmodSync(credPath, 0o600);
}
/**
 * Get API key for a provider.
 * Priority: Environment variable > credentials file
 *
 * Returns null if no API key is found (does not throw).
 */
export function getApiKey(provider) {
    // Check environment variable first
    const envVar = PROVIDER_ENV_VARS[provider];
    if (envVar) {
        const envValue = process.env[envVar];
        if (envValue) {
            return envValue;
        }
    }
    // Fall back to credentials file
    const credentials = loadCredentials();
    const providerCreds = credentials[provider];
    if (providerCreds?.api_key) {
        return providerCreds.api_key;
    }
    return null;
}
/**
 * Get the environment variable name for a provider.
 */
export function getEnvVarName(provider) {
    return PROVIDER_ENV_VARS[provider] ?? null;
}
/**
 * Get list of providers that have credentials configured.
 * Returns env-var, OAuth, and file-based credentials with source info.
 */
export function getConfiguredProviders() {
    const configured = [];
    const seen = new Set();
    // Check env vars first (highest priority)
    for (const [provider, envVar] of Object.entries(PROVIDER_ENV_VARS)) {
        if (process.env[envVar]) {
            configured.push({ provider, source: 'env' });
            seen.add(provider);
        }
    }
    // Check OAuth credentials (second priority)
    const oauthCreds = loadOAuthCredentials();
    for (const provider of Object.keys(oauthCreds)) {
        if (!seen.has(provider)) {
            configured.push({ provider, source: 'oauth' });
            seen.add(provider);
        }
    }
    // Check credentials file (lowest priority)
    const credentials = loadCredentials();
    for (const [provider, creds] of Object.entries(credentials)) {
        if (creds?.api_key && !seen.has(provider)) {
            configured.push({ provider, source: 'file' });
        }
    }
    return configured;
}
/**
 * Check if credentials file has secure permissions (600).
 * Returns true if file doesn't exist (will be created with correct perms).
 */
export function hasSecurePermissions() {
    const credPath = getCredentialsPath();
    if (!existsSync(credPath)) {
        return true;
    }
    try {
        const stats = statSync(credPath);
        // Check that only owner has read/write (mode 0o600 = 384 decimal, masked with 0o777)
        const mode = stats.mode & 0o777;
        return mode === 0o600;
    }
    catch {
        return false;
    }
}
/**
 * Set environment variables from credentials file.
 * Only sets vars that are not already set (env > file).
 * Call this at startup to make credentials available to pi-ai's getEnvApiKey.
 */
export function loadCredentialsIntoEnv() {
    const credentials = loadCredentials();
    for (const [provider, creds] of Object.entries(credentials)) {
        if (!creds?.api_key)
            continue;
        const envVar = PROVIDER_ENV_VARS[provider];
        if (envVar && !process.env[envVar]) {
            process.env[envVar] = creds.api_key;
        }
    }
}
//# sourceMappingURL=credentials.js.map