/**
 * arete credentials — Manage AI provider API keys
 *
 * Commands:
 *   arete credentials set <provider>  - Set API key for a provider
 *   arete credentials show             - Show configured providers (masked keys)
 *   arete credentials test             - Test configured provider connections
 *
 * Credentials stored in ~/.arete/credentials.yaml with 600 permissions.
 * Environment variables override file credentials.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import {
  saveCredential,
  getApiKey,
  getEnvVarName,
  getConfiguredProviders,
  getCredentialsPath,
  hasSecurePermissions,
  loadCredentials,
} from '@arete/core';
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
] as const;

type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/** Models used for validation test calls */
const VALIDATION_MODELS: Partial<Record<SupportedProvider, { provider: string; model: string }>> = {
  anthropic: { provider: 'anthropic', model: 'claude-haiku' },
  google: { provider: 'google', model: 'gemini-2.0-flash' },
  openai: { provider: 'openai', model: 'gpt-4o-mini' },
};

/**
 * Mask an API key for display: show first 8 chars + "..." + last 4
 * If key is too short, show fewer characters.
 */
export function maskApiKey(apiKey: string): string {
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
function validateProviderName(provider: string): provider is SupportedProvider {
  return SUPPORTED_PROVIDERS.includes(provider as SupportedProvider);
}

/**
 * Test an API key by making a minimal call to the provider.
 * Returns true on success, throws on error.
 */
async function testProviderConnection(
  provider: SupportedProvider,
  apiKey: string,
): Promise<{ success: true; model: string } | { success: false; error: string; isNetworkError: boolean }> {
  const validation = VALIDATION_MODELS[provider];
  
  if (!validation) {
    // No validation model for this provider - skip test
    return { success: true, model: '(validation skipped)' };
  }

  try {
    // Dynamically import pi-ai to avoid top-level import
    const { completeSimple, getModel } = await import('@mariozechner/pi-ai');
    
    const model = getModel(
      validation.provider as 'anthropic' | 'google' | 'openai',
      validation.model as never,
    );

    // Make a minimal test call
    const response = await completeSimple(model, {
      messages: [{ role: 'user', content: 'Respond with only the word "ok".', timestamp: Date.now() }],
    }, {
      apiKey,
      maxTokens: 10,
    });

    // If we get here, the key is valid
    return { success: true, model: response.model };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    
    // Check if it's a network error vs auth error
    const isNetworkError =
      message.includes('ENOTFOUND') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('network') ||
      message.includes('fetch failed');

    // Auth errors typically include 401 or "invalid" or "unauthorized"
    const isAuthError =
      message.includes('401') ||
      message.toLowerCase().includes('invalid') ||
      message.toLowerCase().includes('unauthorized') ||
      message.toLowerCase().includes('authentication');

    if (isAuthError && !isNetworkError) {
      return { success: false, error: 'Invalid API key', isNetworkError: false };
    }

    return { success: false, error: message, isNetworkError };
  }
}

export function registerCredentialsCommand(program: Command): void {
  const credentialsCmd = program
    .command('credentials')
    .description('Manage AI provider API keys')
    .addHelpText('after', `
${chalk.bold('Provider Priority')}
  Environment variables take precedence over stored credentials.
  Set ${chalk.cyan('ANTHROPIC_API_KEY')}, ${chalk.cyan('OPENAI_API_KEY')}, etc. to override.

${chalk.bold('Storage')}
  Credentials stored in ${chalk.dim('~/.arete/credentials.yaml')} with secure permissions (600).

${chalk.bold('Supported Providers')}
  ${SUPPORTED_PROVIDERS.join(', ')}
`);

  // --- credentials set <provider> ---
  credentialsCmd
    .command('set <provider>')
    .description('Set API key for a provider')
    .option('--api-key <key>', 'API key (non-interactive)')
    .option('--no-validate', 'Skip validation test call')
    .option('--json', 'Output as JSON')
    .action(async (provider: string, opts: {
      apiKey?: string;
      validate?: boolean; // Commander uses --no-validate → validate=false
      json?: boolean;
    }) => {
      // Validate provider name
      if (!validateProviderName(provider)) {
        if (opts.json) {
          console.log(JSON.stringify({
            success: false,
            error: `Unknown provider: ${provider}`,
            supportedProviders: SUPPORTED_PROVIDERS,
          }));
        } else {
          error(`Unknown provider: ${provider}`);
          info(`Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`);
        }
        process.exit(1);
      }

      let apiKey: string;

      // Get API key from flag or prompt
      if (opts.apiKey) {
        apiKey = opts.apiKey;
      } else if (opts.json) {
        // JSON mode requires --api-key flag
        console.log(JSON.stringify({
          success: false,
          error: 'JSON mode requires --api-key option',
        }));
        process.exit(1);
      } else {
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
        } catch (err) {
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
      let validationResult: Awaited<ReturnType<typeof testProviderConnection>> | null = null;
      
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
            } else {
              warn(`Could not validate: ${validationResult.error}`);
              info('Saving anyway (use --no-validate to skip validation)');
            }
          } else {
            // Auth error - don't save
            if (opts.json) {
              console.log(JSON.stringify({
                success: false,
                error: validationResult.error,
                provider,
              }));
            } else {
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
        const response: Record<string, unknown> = {
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
      } else {
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

  // --- credentials show ---
  credentialsCmd
    .command('show')
    .description('Show configured providers (keys are masked)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const configured = getConfiguredProviders();
      const credentials = loadCredentials();
      const credPath = getCredentialsPath();
      const securePerms = hasSecurePermissions();

      // Build provider details with masked keys
      const providers = configured.map((entry) => {
        const apiKey = getApiKey(entry.provider);
        const envVar = getEnvVarName(entry.provider);
        
        return {
          provider: entry.provider,
          source: entry.source,
          envVar,
          maskedKey: apiKey ? maskApiKey(apiKey) : null,
        };
      });

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          credentialsPath: credPath,
          securePermissions: securePerms,
          providers,
        }));
        return;
      }

      header('AI Credentials');

      listItem('Path', formatPath(credPath));
      listItem('Permissions', securePerms ? '600 (secure)' : chalk.red('INSECURE'));
      console.log('');

      if (providers.length === 0) {
        info('No providers configured');
        console.log('');
        console.log(chalk.dim('  Run: arete credentials set <provider>'));
        console.log(chalk.dim(`  Supported: ${SUPPORTED_PROVIDERS.join(', ')}`));
        console.log('');
        return;
      }

      console.log(chalk.bold('  Configured Providers'));
      console.log(chalk.dim('  ' + '─'.repeat(40)));

      for (const p of providers) {
        const sourceLabel = p.source === 'env'
          ? chalk.cyan('[env]')
          : chalk.dim('[file]');
        
        console.log(`  ${chalk.dim('•')} ${chalk.bold(p.provider)} ${sourceLabel}`);
        if (p.maskedKey) {
          console.log(`      ${chalk.dim('Key:')} ${p.maskedKey}`);
        }
        if (p.source === 'env' && p.envVar) {
          console.log(`      ${chalk.dim('Env:')} ${p.envVar}`);
        }
      }
      console.log('');
    });

  // --- credentials test ---
  credentialsCmd
    .command('test')
    .description('Test configured provider connections')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const configured = getConfiguredProviders();

      if (configured.length === 0) {
        if (opts.json) {
          console.log(JSON.stringify({
            success: true,
            message: 'No providers configured',
            results: [],
          }));
        } else {
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

      const results: Array<{
        provider: string;
        source: string;
        success: boolean;
        model?: string;
        error?: string;
        skipped?: boolean;
      }> = [];

      for (const entry of configured) {
        const apiKey = getApiKey(entry.provider);
        
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
        if (!VALIDATION_MODELS[entry.provider as SupportedProvider]) {
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

        const result = await testProviderConnection(
          entry.provider as SupportedProvider,
          apiKey,
        );

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
        } else {
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
      } else {
        console.log('');
        const passed = results.filter((r) => r.success).length;
        const total = results.length;
        if (passed === total) {
          success(`All ${total} provider(s) tested successfully`);
        } else {
          warn(`${passed}/${total} provider(s) passed`);
        }
        console.log('');
      }
    });
}
