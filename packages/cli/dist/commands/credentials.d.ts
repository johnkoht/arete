/**
 * arete credentials — Manage AI provider API keys
 *
 * Commands:
 *   arete credentials set <provider>   - Set API key for a provider
 *   arete credentials login [provider] - Login via OAuth (Claude Pro/Max, etc.)
 *   arete credentials show             - Show configured providers (masked keys)
 *   arete credentials test             - Test configured provider connections
 *
 * Credentials stored in ~/.arete/credentials.yaml with 600 permissions.
 * OAuth credentials stored in ~/.arete/auth.json with 600 permissions.
 * Environment variables override all other credentials.
 */
import type { Command } from 'commander';
/** Supported provider names - must match PROVIDER_ENV_VARS in credentials.ts */
declare const SUPPORTED_PROVIDERS: readonly ["anthropic", "google", "openai", "amazon-bedrock", "xai", "groq", "mistral", "openrouter"];
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];
/**
 * Mask an API key for display: show first 8 chars + "..." + last 4
 * If key is too short, show fewer characters.
 */
export declare function maskApiKey(apiKey: string): string;
/**
 * Test an API key by making a minimal call to the provider.
 * Returns true on success, throws on error.
 */
export declare function testProviderConnection(provider: SupportedProvider, apiKey: string): Promise<{
    success: true;
    model: string;
} | {
    success: false;
    error: string;
    isNetworkError: boolean;
}>;
export declare function registerCredentialsCommand(program: Command): void;
export {};
//# sourceMappingURL=credentials.d.ts.map