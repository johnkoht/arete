/**
 * arete onboard — Quick identity setup for new workspaces
 *
 * Collects name, email, company to bootstrap context/profile.md
 * before full conversational onboarding. Optionally configures AI credentials
 * via OAuth login or API key.
 */

import {
  createServices,
  loadConfig,
  refreshQmdIndex,
  saveCredential,
  getApiKey,
  getAvailableOAuthProviders,
  saveOAuthCredentials,
  getOAuthPath,
  hasOAuthCredentials,
} from '@arete/core';
import { getOAuthProvider } from '@mariozechner/pi-ai/oauth';
import type { QmdRefreshResult } from '@arete/core';
import type { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { createInterface as createReadlineInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { join } from 'node:path';
import chalk from 'chalk';
import { header, success, error, info, warn, listItem } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';
import { testProviderConnection, maskApiKey } from './credentials.js';

/**
 * Default AI tier + task mapping written to a fresh workspace's `arete.yaml`
 * during onboarding (both OAuth and API-key flows). Exported for unit
 * verification — keeping the value testable prevents silent drift, since
 * the *runtime* default in `config.ts` and `services/ai.ts` is `'standard'`
 * for reconciliation but the workspace value wins when explicit.
 *
 * `reconciliation: 'standard'` is deliberate: Haiku is too non-deterministic
 * at the cross-meeting + LLM batch review pass (false-positive rate measurably
 * worse than Sonnet on real data — see `2026-04-30_self-match-reconciliation-fix.md`).
 */
export const ONBOARD_DEFAULT_AI_CONFIG = {
  tiers: {
    fast: 'anthropic/claude-3-5-haiku-latest',
    standard: 'anthropic/claude-sonnet-4-latest',
    frontier: 'anthropic/claude-opus-4-latest',
  },
  tasks: {
    summary: 'fast',
    extraction: 'fast',
    decision_extraction: 'standard',
    learning_extraction: 'standard',
    significance_analysis: 'frontier',
    reconciliation: 'standard',
  },
} as const;

interface OnboardAnswers {
  name: string;
  email: string;
  company: string;
  website?: string;
}

function extractDomainFromEmail(email: string): string | null {
  const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
  return match ? match[1] : null;
}

function extractDomainFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Open a URL in the default browser (cross-platform)
 */
async function openBrowser(url: string): Promise<void> {
  const { exec } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    // macOS uses 'open', Linux uses 'xdg-open', Windows uses 'start'
    let command: string;
    if (process.platform === 'darwin') {
      command = `open "${url}"`;
    } else if (process.platform === 'win32') {
      command = `start "" "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }
    exec(command, (err) => {
      if (err) reject(new Error('Unable to open browser automatically.'));
      else resolve();
    });
  });
}

export function registerOnboardCommand(program: Command): void {
  program
    .command('onboard')
    .description('Quick identity setup for new workspaces')
    .option('--json', 'Output as JSON')
    .option('--name <name>', 'Your name')
    .option('--email <email>', 'Your work email')
    .option('--company <company>', 'Your company name')
    .option('--website <url>', 'Company website URL (optional)')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--skip-ai', 'Skip AI configuration step')
    .option('--api-key <key>', 'Anthropic API key (non-interactive)')
    .action(async (opts: {
      json?: boolean;
      name?: string;
      email?: string;
      company?: string;
      website?: string;
      skipQmd?: boolean;
      skipAi?: boolean;
      apiKey?: string;
    }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();

      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
          info('Run "arete install" to create a workspace first');
        }
        process.exit(1);
      }

      // Check if profile already exists
      const profilePath = join(root, 'context', 'profile.md');
      const profileExists = await services.storage.exists(profilePath);
      let profileSkipped = false;

      if (profileExists) {
        const existingContent = await services.storage.read(profilePath);
        if (existingContent && !existingContent.includes('[Your name]')) {
          profileSkipped = true;
          if (!opts.json) {
            warn('Profile already exists — skipping profile setup');
          }
          // DON'T return here — continue to AI config
        }
      }

      // ========================================
      // PHASE 1: Profile Setup
      // ========================================
      let answers: OnboardAnswers | null = null;
      let domains: string[] = [];

      if (!profileSkipped) {
        // Use CLI options if all required fields provided
        if (opts.name && opts.email && opts.company) {
          answers = {
            name: opts.name,
            email: opts.email,
            company: opts.company,
            website: opts.website,
          };
        } else if (opts.json) {
          // JSON mode requires all fields via options
          console.log(JSON.stringify({
            success: false,
            error: 'JSON mode requires --name, --email, and --company options',
          }));
          process.exit(1);
        } else {
          // Interactive mode
          header('Areté Onboarding');
          console.log('Let me get to know you before we set up your workspace.');
          console.log('');

          const rl = createInterface({ input, output });

          try {
            const name = await rl.question(chalk.cyan('What\'s your name? '));
            if (!name.trim()) {
              error('Name is required');
              process.exit(1);
            }

            const email = await rl.question(chalk.cyan('What\'s your work email? '));
            if (!email.trim() || !email.includes('@')) {
              error('Valid email is required');
              process.exit(1);
            }

            const company = await rl.question(chalk.cyan('What company are you at? '));
            if (!company.trim()) {
              error('Company name is required');
              process.exit(1);
            }

            // Ask for website optionally
            const websiteInput = await rl.question(
              chalk.dim('Company website? (optional, press enter to skip) ')
            );
            const website = websiteInput.trim() || undefined;

            answers = { name: name.trim(), email: email.trim(), company: company.trim(), website };
          } finally {
            rl.close();
          }
        }

        // Extract domains for People Intelligence
        const emailDomain = extractDomainFromEmail(answers.email);
        if (emailDomain) domains.push(emailDomain);
        if (answers.website) {
          const websiteDomain = extractDomainFromUrl(answers.website);
          if (websiteDomain && !domains.includes(websiteDomain)) {
            domains.push(websiteDomain);
          }
        }

        // Generate profile content
        const now = new Date().toISOString();
        const profileContent = `---
name: ${answers.name}
email: ${answers.email}
company: ${answers.company}
${answers.website ? `website: ${answers.website}` : '# website: (not provided)'}
created: ${now}
---

# Profile

Personal context for Areté personalization.

## Identity

- **Name**: ${answers.name}
- **Email**: ${answers.email}
- **Company**: ${answers.company}
${answers.website ? `- **Website**: ${answers.website}` : ''}

## Company Domains

${domains.length > 0 ? domains.map(d => `- ${d}`).join('\n') : '- (none extracted)'}

*These domains help identify internal vs external contacts in People Intelligence.*
`;

        // Write profile
        await services.storage.write(profilePath, profileContent);

        // Write domain hints for Contract v1
        if (domains.length > 0) {
          const emailDomain = extractDomainFromEmail(answers.email);
          const domainHintsPath = join(root, 'context', 'domain-hints.md');
          const domainHintsContent = `---
domains:
${domains.map(d => `  - ${d}`).join('\n')}
extracted_from:
  - onboard_cli
generated: ${now}
---

# Domain Hints

Automatically extracted domain signals for People Intelligence.

## Domains

${domains.map(d => `- \`${d}\``).join('\n')}

## Sources

- Email domain: ${emailDomain || '(none)'}
- Website domain: ${answers.website ? extractDomainFromUrl(answers.website) || '(none)' : '(not provided)'}
`;
          await services.storage.write(domainHintsPath, domainHintsContent);
        }

        // Auto-refresh qmd index after writes
        if (!opts.skipQmd) {
          const config = await loadConfig(services.storage, root);
          await refreshQmdIndex(root, config.qmd_collection);
        }

        if (!opts.json) {
          console.log('');
          success('Profile created!');
          console.log('');
          console.log(chalk.dim('  Profile saved to: context/profile.md'));
          if (domains.length > 0) {
            console.log(chalk.dim('  Domain hints saved to: context/domain-hints.md'));
          }
        }
      }

      // ========================================
      // PHASE 2: AI Configuration
      // ========================================
      let aiConfigured = false;
      let aiSkipped = false;

      if (opts.skipAi) {
        aiSkipped = true;
      } else {
        const existingKey = getApiKey('anthropic');
        const existingOAuth = hasOAuthCredentials('anthropic');

        // Determine if we should prompt for AI credentials
        let shouldPrompt = false;
        let apiKeyToSave: string | null = null;
        let aiHeaderShown = false;

        if (opts.apiKey) {
          // Non-interactive: use provided key
          apiKeyToSave = opts.apiKey;
        } else if (opts.json) {
          // JSON mode without --api-key: skip AI config (can't prompt)
          aiSkipped = true;
        } else if (existingKey || existingOAuth) {
          // Interactive mode with existing credentials: just use them
          const currentCred = existingOAuth ? 'Claude subscription' : 'API key';
          success(`Using existing AI credentials (${currentCred})`);
          aiConfigured = true;
          // No need to prompt - credentials are global and already working
        } else {
          // Interactive mode with no existing credentials: prompt for setup
          shouldPrompt = true;
        }

        // Prompt for key if needed
        if (shouldPrompt && !opts.json) {
          // Only show header if we haven't already shown it
          if (!aiHeaderShown) {
            console.log('');
            info('AI Configuration');
            console.log(chalk.dim('  Areté uses AI to extract insights from your meetings and context.'));
            console.log('');
          }

          const { select, password } = await import('@inquirer/prompts');

          // Offer choice between OAuth login and API key
          type AuthChoice = 'oauth' | 'apikey' | 'skip';
          let authChoice: AuthChoice;
          try {
            authChoice = await select<AuthChoice>({
              message: 'How would you like to authenticate with Anthropic?',
              choices: [
                {
                  name: 'Login with Claude subscription (Pro/Max)',
                  value: 'oauth' as AuthChoice,
                  description: 'Opens browser for OAuth login — no API key needed',
                },
                {
                  name: 'Paste API key',
                  value: 'apikey' as AuthChoice,
                  description: 'Get key from console.anthropic.com',
                },
                {
                  name: 'Skip for now',
                  value: 'skip' as AuthChoice,
                  description: 'Configure later with: arete credentials login',
                },
              ],
            });
          } catch {
            // User cancelled
            aiSkipped = true;
            authChoice = 'skip';
          }

          if (authChoice === 'oauth') {
            // OAuth flow
            const provider = getOAuthProvider('anthropic');
            if (!provider) {
              error('OAuth provider not available');
              aiSkipped = true;
            } else {
              console.log('');
              info(`Logging in to ${chalk.bold(provider.name)}...`);

              const rl = createReadlineInterface({ input, output });
              const promptFn = (msg: string): Promise<string> => {
                return new Promise((resolve) => rl.question(`${msg} `, resolve));
              };

              try {
                const credentials = await provider.login({
                  onAuth: async (authInfo) => {
                    console.log('');
                    info('Opening browser for Claude authorization...');
                    try {
                      await openBrowser(authInfo.url);
                    } catch {
                      // Fallback: show URL if browser won't open
                      console.log(chalk.bold('  Open this URL in your browser:'));
                      console.log(`  ${chalk.cyan(authInfo.url)}`);
                    }
                    if (authInfo.instructions) {
                      console.log('');
                      console.log(chalk.dim(`  ${authInfo.instructions}`));
                    }
                    console.log('');
                  },
                  onPrompt: async (prompt) => {
                    const placeholder = prompt.placeholder ? ` (${prompt.placeholder})` : '';
                    return await promptFn(`${prompt.message}${placeholder}:`);
                  },
                  onProgress: (msg) => {
                    console.log(chalk.dim(`  ${msg}`));
                  },
                });

                // Save OAuth credentials
                saveOAuthCredentials('anthropic', credentials);

                // Write default AI config to arete.yaml
                await services.workspace.updateManifestField(root, 'ai', ONBOARD_DEFAULT_AI_CONFIG);

                aiConfigured = true;

                console.log('');
                success('Logged in to Anthropic');
                listItem('Credentials saved', getOAuthPath());
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                error(`Login failed: ${message}`);
                info('You can try again later with: arete credentials login anthropic');
                aiSkipped = true;
              } finally {
                rl.close();
              }
            }
          } else if (authChoice === 'apikey') {
            // API key flow
            console.log(chalk.dim('  Get your API key at: https://console.anthropic.com/account/keys'));
            console.log('');

            try {
              const apiKeyInput = await password({
                message: 'Enter your Anthropic API key:',
              });

              if (apiKeyInput && apiKeyInput.trim()) {
                apiKeyToSave = apiKeyInput.trim();
                // Show masked key so user can verify they pasted correctly
                console.log(chalk.dim(`  Key entered: ${maskApiKey(apiKeyToSave)}`));
              } else {
                aiSkipped = true;
                info('Skipping AI configuration — you can configure later with: arete credentials set anthropic');
              }
            } catch {
              // User cancelled (Ctrl+C)
              aiSkipped = true;
            }
          } else {
            // Skip
            aiSkipped = true;
            info('Skipping AI configuration — you can configure later with: arete credentials login');
          }
        }

        // Validate and save key if we have one
        if (apiKeyToSave) {
          if (!opts.json) {
            info('Validating API key...');
          }

          const result = await testProviderConnection('anthropic', apiKeyToSave);

          if (result.success) {
            // Save credential
            saveCredential('anthropic', apiKeyToSave);

            // Write default AI config to arete.yaml
            await services.workspace.updateManifestField(root, 'ai', ONBOARD_DEFAULT_AI_CONFIG);

            aiConfigured = true;

            if (!opts.json) {
              success('API key validated and saved');
              listItem('Model', result.model);
            }
          } else {
            // Validation failed
            if (result.isNetworkError) {
              // Network error - warn but allow save
              if (!opts.json) {
                warn(`Could not validate: ${result.error}`);
                info('Saving anyway');
              }

              saveCredential('anthropic', apiKeyToSave);

              // Still write AI config
              await services.workspace.updateManifestField(root, 'ai', ONBOARD_DEFAULT_AI_CONFIG);
              aiConfigured = true;
            } else {
              // Auth error - don't save
              if (opts.json) {
                console.log(JSON.stringify({
                  success: false,
                  error: `Invalid API key: ${result.error}`,
                }));
                process.exit(1);
              } else {
                error(`Invalid API key: ${result.error}`);
                info('API key was not saved. Run "arete credentials set anthropic" to try again.');
                aiSkipped = true;
              }
            }
          }
        }
      }

      // ========================================
      // PHASE 2.5: Calendar Integration
      // ========================================
      let calendarConfigured = false;
      let calendarSkipped = false;

      if (!opts.json) {
        console.log('');
        info('Calendar Integration');
        console.log(chalk.dim('  Connecting a calendar enables meeting prep and daily planning.'));
        console.log('');

        const { select } = await import('@inquirer/prompts');
        type CalendarChoice = 'apple' | 'google' | 'skip';
        let calendarChoice: CalendarChoice;

        try {
          calendarChoice = await select<CalendarChoice>({
            message: 'Would you like to connect a calendar?',
            choices: [
              { name: 'Apple Calendar', value: 'apple', description: 'Syncs with macOS Calendar app' },
              { name: 'Google Calendar', value: 'google', description: 'Opens browser for OAuth' },
              { name: 'Skip for now', value: 'skip', description: 'Configure later via: arete integration configure' },
            ],
          });
        } catch {
          calendarSkipped = true;
          calendarChoice = 'skip';
        }

        if (calendarChoice === 'apple') {
          // Configure Apple Calendar with all calendars
          await services.integrations.configure(root, 'calendar', {
            provider: 'macos',
            status: 'active',
            calendars: [], // Empty = all calendars
          });
          calendarConfigured = true;
          success('Apple Calendar connected (all calendars)');
        } else if (calendarChoice === 'google') {
          // Check for real credentials
          const { getClientCredentials, authenticateGoogle, listCalendars } = await import('@arete/core');
          const { clientId } = getClientCredentials();

          if (clientId === 'PLACEHOLDER_CLIENT_ID') {
            // Beta: no production keys — show guidance
            warn('Google Calendar is in beta');
            console.log('');
            console.log(chalk.dim('  To connect Google Calendar, you need API credentials:'));
            console.log(chalk.dim('  1. Create a Google Cloud project with Calendar API enabled'));
            console.log(chalk.dim('  2. Create an OAuth 2.0 Client ID (Desktop app type)'));
            console.log(chalk.dim('  3. Set environment variables:'));
            console.log(chalk.dim('     export GOOGLE_CLIENT_ID="your-client-id"'));
            console.log(chalk.dim('     export GOOGLE_CLIENT_SECRET="your-client-secret"'));
            console.log('');
            console.log(chalk.dim('  Or request beta access: john.koht@gmail.com'));
            console.log(chalk.dim('  Then re-run: arete onboard or arete integration configure google-calendar'));
            console.log('');
            calendarSkipped = true;
          } else {
            // Run OAuth flow inline
            try {
              console.log('');
              info('Opening browser for Google Calendar authorization...');
              info('If you see an "unverified app" warning, click "Advanced" → "Go to Areté"');
              console.log('');
              await authenticateGoogle(services.storage, root);
              success('Google Calendar authenticated');

              // Fetch calendars and configure with all of them
              const calendars = await listCalendars(services.storage, root);
              const selectedCalendarIds = calendars.map(c => c.id);

              await services.integrations.configure(root, 'calendar', {
                provider: 'google',
                status: 'active',
                calendars: selectedCalendarIds,
              });
              calendarConfigured = true;
              success(`Google Calendar connected (${selectedCalendarIds.length} calendar${selectedCalendarIds.length === 1 ? '' : 's'})`);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              error(`Google Calendar setup failed: ${message}`);
              info('You can try again later with: arete integration configure google-calendar');
              calendarSkipped = true;
            }
          }
        } else {
          calendarSkipped = true;
        }
      } else {
        // JSON mode: skip calendar setup
        calendarSkipped = true;
      }

      // ========================================
      // PHASE 2.6: Context Prompts (Optional)
      // ========================================
      let contextProvided = false;

      if (!opts.json && !profileSkipped) {
        // Only ask if we just created a profile (not skipped)
        console.log('');
        info('Quick Context (optional)');
        console.log(chalk.dim('  A few sentences about your business helps the agent give better advice.'));
        console.log(chalk.dim('  Press Enter to skip any question.'));
        console.log('');

        const { input: inputPrompt } = await import('@inquirer/prompts');

        try {
          const businessDesc = await inputPrompt({
            message: 'What does your company do? (1-2 sentences)',
            default: '',
          });

          const usersDesc = await inputPrompt({
            message: 'Who are your primary users?',
            default: '',
          });

          // Write to context files if provided
          if (businessDesc.trim() || usersDesc.trim()) {
            contextProvided = true;

            if (businessDesc.trim()) {
              const businessPath = join(root, 'context', 'business-overview.md');
              const existing = await services.storage.read(businessPath) ?? '';
              // Append to "Problem Space" or "Company" section
              const updated = existing.replace(
                '[Describe the customer problem you solve]',
                businessDesc.trim()
              );
              await services.storage.write(businessPath, updated);
            }

            if (usersDesc.trim()) {
              const usersPath = join(root, 'context', 'users-personas.md');
              const existing = await services.storage.read(usersPath) ?? '';
              const updated = existing.replace(
                '[Who uses your product]',
                usersDesc.trim()
              );
              await services.storage.write(usersPath, updated);
            }
          }
        } catch {
          // User cancelled - fine
        }
      }

      // ========================================
      // PHASE 3: Output
      // ========================================
      if (opts.json) {
        const output: Record<string, unknown> = {
          success: true,
          profile: profileSkipped
            ? { skipped: true }
            : {
                name: answers!.name,
                email: answers!.email,
                company: answers!.company,
                website: answers!.website,
                domains,
              },
          files: profileSkipped
            ? { profile: profilePath, domainHints: null }
            : {
                profile: profilePath,
                domainHints: domains.length > 0 ? join(root, 'context', 'domain-hints.md') : null,
              },
          ai: {
            configured: aiConfigured,
            provider: aiConfigured ? 'anthropic' : null,
            skipped: aiSkipped,
          },
          calendar: { configured: calendarConfigured, skipped: calendarSkipped },
          context: { provided: contextProvided },
        };
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      // Non-JSON: First win suggestions
      console.log('');
      success('Setup complete!');
      console.log('');
      console.log(chalk.bold('  Try one of these to get started:'));
      console.log('');
      console.log('    • "Prep for my next meeting" — get context on attendees');
      console.log('    • "Plan my week" — set priorities and focus');
      console.log('    • "Let\'s get started" — guided workspace setup');
      console.log('');

      // Ensure clean exit (readline interfaces may keep process alive)
      process.exit(0);
    });
}
