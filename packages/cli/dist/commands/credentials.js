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
import chalk from 'chalk';
import { createInterface } from 'readline';
import { saveCredential, getApiKey, getEnvVarName, getConfiguredProviders, getCredentialsPath, hasSecurePermissions, 
// OAuth support
getOAuthPath, getAvailableOAuthProviders, loadOAuthCredentials, saveOAuthCredentials, } from '@arete/core';
import { getOAuthProvider } from '@mariozechner/pi-ai/oauth';
import { header, success, error, info, warn, listItem, formatPath } from '../formatters.js';
/** Supported provider names - must match PROVIDER_ENV_VARS in credentials.ts */
const SUPPORTED_PROVIDERS = [
    'anthropic',
    'google',
    'openai',
    'amazon-bedrock',
    'xai',
    'groq',
    'mistral',
    'openrouter',
];
/** Models used for validation test calls — use cheapest/fastest models */
const VALIDATION_MODELS = {
    anthropic: { provider: 'anthropic', model: 'claude-3-5-haiku-latest' },
    google: { provider: 'google', model: 'gemini-2.0-flash' },
    openai: { provider: 'openai', model: 'gpt-4o-mini' },
};
/**
 * Mask an API key for display: show first 8 chars + "..." + last 4
 * If key is too short, show fewer characters.
 */
export function maskApiKey(apiKey) {
    if (apiKey.length <= 12) {
        return '***';
    }
    const prefix = apiKey.slice(0, 8);
    const suffix = apiKey.slice(-4);
    return `${prefix}...${suffix}`;
}
/**
 * Validate a provider name and return helpful error if invalid.
 */
function validateProviderName(provider) {
    return SUPPORTED_PROVIDERS.includes(provider);
}
/**
 * Test an API key by making a minimal call to the provider.
 * Returns true on success, throws on error.
 */
export async function testProviderConnection(provider, apiKey) {
    const validation = VALIDATION_MODELS[provider];
    if (!validation) {
        // No validation model for this provider - skip test
        return { success: true, model: '(validation skipped)' };
    }
    try {
        // Dynamically import pi-ai to avoid top-level import
        const { completeSimple, getModel } = await import('@mariozechner/pi-ai');
        const model = getModel(validation.provider, validation.model);
        // Make a minimal test call
        const response = await completeSimple(model, {
            messages: [{ role: 'user', content: 'Respond with only the word "ok".', timestamp: Date.now() }],
        }, {
            apiKey,
            maxTokens: 10,
        });
        // If we get here, the key is valid
        return { success: true, model: response.model };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Check if it's a network error vs auth error
        const isNetworkError = message.includes('ENOTFOUND') ||
            message.includes('ECONNREFUSED') ||
            message.includes('ETIMEDOUT') ||
            message.includes('network') ||
            message.includes('fetch failed');
        // Auth errors typically include 401 or "invalid" or "unauthorized"
        const isAuthError = message.includes('401') ||
            message.toLowerCase().includes('invalid') ||
            message.toLowerCase().includes('unauthorized') ||
            message.toLowerCase().includes('authentication');
        if (isAuthError && !isNetworkError) {
            return { success: false, error: 'Invalid API key', isNetworkError: false };
        }
        return { success: false, error: message, isNetworkError };
    }
}
export function registerCredentialsCommand(program) {
    const oauthProviders = getAvailableOAuthProviders();
    const oauthProviderNames = oauthProviders.map(p => p.id).join(', ');
    const credentialsCmd = program
        .command('credentials')
        .description('Manage AI provider API keys')
        .addHelpText('after', `
${chalk.bold('Credential Priority')}
  Environment variables > OAuth (login) > API keys (file)

${chalk.bold('Storage')}
  API keys: ${chalk.dim('~/.arete/credentials.yaml')} (600 permissions)
  OAuth:    ${chalk.dim('~/.arete/auth.json')} (600 permissions)

${chalk.bold('API Key Providers')}
  ${SUPPORTED_PROVIDERS.join(', ')}

${chalk.bold('OAuth Providers')} (use 'arete credentials login')
  ${oauthProviderNames}
`);
    // --- credentials set <provider> ---
    credentialsCmd
        .command('set <provider>')
        .description('Set API key for a provider')
        .option('--api-key <key>', 'API key (non-interactive)')
        .option('--no-validate', 'Skip validation test call')
        .option('--json', 'Output as JSON')
        .action(async (provider, opts) => {
        // Validate provider name
        if (!validateProviderName(provider)) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: `Unknown provider: ${provider}`,
                    supportedProviders: SUPPORTED_PROVIDERS,
                }));
            }
            else {
                error(`Unknown provider: ${provider}`);
                info(`Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`);
            }
            process.exit(1);
        }
        let apiKey;
        // Get API key from flag or prompt
        if (opts.apiKey) {
            apiKey = opts.apiKey;
        }
        else if (opts.json) {
            // JSON mode requires --api-key flag
            console.log(JSON.stringify({
                success: false,
                error: 'JSON mode requires --api-key option',
            }));
            process.exit(1);
        }
        else {
            // Interactive prompt
            const { password } = await import('@inquirer/prompts');
            const envVar = getEnvVarName(provider);
            console.log('');
            info(`Setting ${chalk.bold(provider)} API key`);
            console.log(chalk.dim(`  Env var override: ${envVar}`));
            console.log('');
            try {
                apiKey = await password({
                    message: `Enter ${provider} API key:`,
                    mask: '*',
                });
            }
            catch (err) {
                // User cancelled (Ctrl+C)
                if (!opts.json) {
                    console.log('');
                    info('Cancelled');
                }
                process.exit(0);
            }
            if (!apiKey.trim()) {
                error('API key cannot be empty');
                process.exit(1);
            }
        }
        apiKey = apiKey.trim();
        // Validate with test call (unless --no-validate)
        let validationResult = null;
        if (opts.validate !== false) {
            if (!opts.json) {
                info('Validating API key...');
            }
            validationResult = await testProviderConnection(provider, apiKey);
            if (!validationResult.success) {
                if (validationResult.isNetworkError) {
                    // Network error - warn but allow save
                    if (opts.json) {
                        // For JSON mode, we'll include the warning in the success response
                    }
                    else {
                        warn(`Could not validate: ${validationResult.error}`);
                        info('Saving anyway (use --no-validate to skip validation)');
                    }
                }
                else {
                    // Auth error - don't save
                    if (opts.json) {
                        console.log(JSON.stringify({
                            success: false,
                            error: validationResult.error,
                            provider,
                        }));
                    }
                    else {
                        error(validationResult.error);
                        info('API key was not saved. Check your key and try again.');
                    }
                    process.exit(1);
                }
            }
        }
        // Save the credential
        saveCredential(provider, apiKey);
        const credPath = getCredentialsPath();
        if (opts.json) {
            const response = {
                success: true,
                provider,
                path: credPath,
                validated: opts.validate !== false,
            };
            if (validationResult && validationResult.success) {
                response.model = validationResult.model;
            }
            if (validationResult && !validationResult.success && validationResult.isNetworkError) {
                response.warning = `Could not validate: ${validationResult.error}`;
            }
            console.log(JSON.stringify(response));
        }
        else {
            console.log('');
            success(`${provider} API key saved`);
            listItem('Path', formatPath(credPath));
            if (validationResult && validationResult.success && validationResult.model !== '(validation skipped)') {
                listItem('Validated with', validationResult.model);
            }
            // Remind about env var override
            const envVar = getEnvVarName(provider);
            if (envVar) {
                console.log('');
                console.log(chalk.dim(`  Note: ${envVar} will override this if set`));
            }
        }
    });
    // --- credentials login [provider] ---
    credentialsCmd
        .command('login [provider]')
        .description('Login via OAuth (Claude Pro/Max, GitHub Copilot, etc.)')
        .option('--json', 'Output as JSON')
        .action(async (providerArg, opts) => {
        const oauthProviders = getAvailableOAuthProviders();
        let providerId;
        // Get provider from arg or prompt
        if (providerArg) {
            providerId = providerArg;
        }
        else if (opts?.json) {
            console.log(JSON.stringify({
                success: false,
                error: 'JSON mode requires provider argument',
                availableProviders: oauthProviders,
            }));
            process.exit(1);
        }
        else {
            // Interactive selection
            const { select } = await import('@inquirer/prompts');
            console.log('');
            header('OAuth Login');
            console.log(chalk.dim('  Login with your AI subscription (Claude Pro/Max, etc.)'));
            console.log('');
            try {
                providerId = await select({
                    message: 'Select provider:',
                    choices: oauthProviders.map(p => ({
                        name: `${p.name} (${p.id})`,
                        value: p.id,
                    })),
                });
            }
            catch {
                // User cancelled
                console.log('');
                info('Cancelled');
                process.exit(0);
            }
        }
        // Validate provider
        const provider = getOAuthProvider(providerId);
        if (!provider) {
            if (opts?.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: `Unknown OAuth provider: ${providerId}`,
                    availableProviders: oauthProviders,
                }));
            }
            else {
                error(`Unknown OAuth provider: ${providerId}`);
                console.log('');
                info('Available OAuth providers:');
                for (const p of oauthProviders) {
                    console.log(`  ${chalk.dim('•')} ${p.name} (${chalk.cyan(p.id)})`);
                }
                console.log('');
            }
            process.exit(1);
        }
        if (!opts?.json) {
            console.log('');
            info(`Logging in to ${chalk.bold(provider.name)}...`);
        }
        // Create readline interface for prompts
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const promptFn = (msg) => {
            return new Promise((resolve) => rl.question(`${msg} `, resolve));
        };
        try {
            const credentials = await provider.login({
                onAuth: (authInfo) => {
                    if (!opts?.json) {
                        console.log('');
                        console.log(chalk.bold('  Open this URL in your browser:'));
                        console.log(`  ${chalk.cyan(authInfo.url)}`);
                        if (authInfo.instructions) {
                            console.log('');
                            console.log(chalk.dim(`  ${authInfo.instructions}`));
                        }
                        console.log('');
                    }
                },
                onPrompt: async (prompt) => {
                    const placeholder = prompt.placeholder ? ` (${prompt.placeholder})` : '';
                    return await promptFn(`${prompt.message}${placeholder}:`);
                },
                onProgress: (msg) => {
                    if (!opts?.json) {
                        console.log(chalk.dim(`  ${msg}`));
                    }
                },
            });
            // Save credentials
            saveOAuthCredentials(providerId, credentials);
            const authPath = getOAuthPath();
            if (opts?.json) {
                console.log(JSON.stringify({
                    success: true,
                    provider: providerId,
                    path: authPath,
                }));
            }
            else {
                console.log('');
                success(`Logged in to ${provider.name}`);
                listItem('Credentials saved', formatPath(authPath));
                console.log('');
                console.log(chalk.dim('  Your AI calls will now use this OAuth session.'));
                console.log(chalk.dim('  Token refresh is automatic.'));
                console.log('');
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (opts?.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: message,
                    provider: providerId,
                }));
            }
            else {
                console.log('');
                error(`Login failed: ${message}`);
            }
            process.exit(1);
        }
        finally {
            rl.close();
        }
    });
    // --- credentials show ---
    credentialsCmd
        .command('show')
        .description('Show configured providers (keys are masked)')
        .option('--json', 'Output as JSON')
        .action(async (opts) => {
        const configured = getConfiguredProviders();
        const credPath = getCredentialsPath();
        const authPath = getOAuthPath();
        const securePerms = hasSecurePermissions();
        const oauthCreds = loadOAuthCredentials();
        // Build provider details with masked keys
        const providers = configured.map((entry) => {
            const apiKey = entry.source !== 'oauth' ? getApiKey(entry.provider) : null;
            const envVar = getEnvVarName(entry.provider);
            const oauthExpires = entry.source === 'oauth' && oauthCreds[entry.provider]
                ? new Date(oauthCreds[entry.provider].expires).toISOString()
                : null;
            return {
                provider: entry.provider,
                source: entry.source,
                envVar,
                maskedKey: apiKey ? maskApiKey(apiKey) : null,
                oauthExpires,
            };
        });
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                credentialsPath: credPath,
                oauthPath: authPath,
                securePermissions: securePerms,
                providers,
            }));
            return;
        }
        header('AI Credentials');
        listItem('API Keys', formatPath(credPath));
        listItem('OAuth', formatPath(authPath));
        listItem('Permissions', securePerms ? '600 (secure)' : chalk.red('INSECURE'));
        console.log('');
        if (providers.length === 0) {
            info('No providers configured');
            console.log('');
            console.log(chalk.dim('  Run: arete credentials set <provider>'));
            console.log(chalk.dim('  Or:  arete credentials login [provider]'));
            console.log('');
            return;
        }
        console.log(chalk.bold('  Configured Providers'));
        console.log(chalk.dim('  ' + '─'.repeat(40)));
        for (const p of providers) {
            const sourceLabel = p.source === 'env'
                ? chalk.cyan('[env]')
                : p.source === 'oauth'
                    ? chalk.green('[oauth]')
                    : chalk.dim('[file]');
            console.log(`  ${chalk.dim('•')} ${chalk.bold(p.provider)} ${sourceLabel}`);
            if (p.maskedKey) {
                console.log(`      ${chalk.dim('Key:')} ${p.maskedKey}`);
            }
            if (p.source === 'env' && p.envVar) {
                console.log(`      ${chalk.dim('Env:')} ${p.envVar}`);
            }
            if (p.source === 'oauth' && p.oauthExpires) {
                console.log(`      ${chalk.dim('Expires:')} ${p.oauthExpires}`);
            }
        }
        console.log('');
    });
    // --- credentials test ---
    credentialsCmd
        .command('test')
        .description('Test configured provider connections')
        .option('--json', 'Output as JSON')
        .action(async (opts) => {
        const configured = getConfiguredProviders();
        if (configured.length === 0) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: true,
                    message: 'No providers configured',
                    results: [],
                }));
            }
            else {
                info('No providers configured');
                console.log('');
                console.log(chalk.dim('  Run: arete credentials set <provider>'));
                console.log('');
            }
            return;
        }
        if (!opts.json) {
            header('Testing Provider Connections');
        }
        const results = [];
        for (const entry of configured) {
            let apiKey = null;
            // Get API key based on source
            if (entry.source === 'oauth') {
                // For OAuth, we need to get the API key asynchronously
                const { getOAuthApiKeyForProvider } = await import('@arete/core');
                try {
                    const result = await getOAuthApiKeyForProvider(entry.provider);
                    apiKey = result?.apiKey ?? null;
                }
                catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    results.push({
                        provider: entry.provider,
                        source: entry.source,
                        success: false,
                        error: `OAuth error: ${errorMsg}`,
                    });
                    if (!opts.json) {
                        console.log(`  ${chalk.red('✗')} ${entry.provider} — OAuth error: ${errorMsg}`);
                    }
                    continue;
                }
            }
            else {
                apiKey = getApiKey(entry.provider);
            }
            if (!apiKey) {
                results.push({
                    provider: entry.provider,
                    source: entry.source,
                    success: false,
                    error: 'No API key available',
                });
                if (!opts.json) {
                    console.log(`  ${chalk.red('✗')} ${entry.provider} — No API key available`);
                }
                continue;
            }
            // Check if we can validate this provider
            if (!VALIDATION_MODELS[entry.provider]) {
                results.push({
                    provider: entry.provider,
                    source: entry.source,
                    success: true,
                    skipped: true,
                });
                if (!opts.json) {
                    console.log(`  ${chalk.yellow('○')} ${entry.provider} — validation skipped (no test model)`);
                }
                continue;
            }
            if (!opts.json) {
                process.stdout.write(`  ${chalk.dim('◌')} ${entry.provider}...`);
            }
            const result = await testProviderConnection(entry.provider, apiKey);
            if (result.success) {
                results.push({
                    provider: entry.provider,
                    source: entry.source,
                    success: true,
                    model: result.model,
                });
                if (!opts.json) {
                    process.stdout.clearLine(0);
                    process.stdout.cursorTo(0);
                    console.log(`  ${chalk.green('✓')} ${entry.provider} — ${chalk.dim(result.model)}`);
                }
            }
            else {
                results.push({
                    provider: entry.provider,
                    source: entry.source,
                    success: false,
                    error: result.error,
                });
                if (!opts.json) {
                    process.stdout.clearLine(0);
                    process.stdout.cursorTo(0);
                    console.log(`  ${chalk.red('✗')} ${entry.provider} — ${result.error}`);
                }
            }
        }
        if (opts.json) {
            const allPassed = results.every((r) => r.success);
            console.log(JSON.stringify({
                success: allPassed,
                results,
            }));
        }
        else {
            console.log('');
            const passed = results.filter((r) => r.success).length;
            const total = results.length;
            if (passed === total) {
                success(`All ${total} provider(s) tested successfully`);
            }
            else {
                warn(`${passed}/${total} provider(s) passed`);
            }
            console.log('');
        }
    });
}
//# sourceMappingURL=credentials.js.map