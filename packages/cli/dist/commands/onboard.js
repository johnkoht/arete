/**
 * arete onboard — Quick identity setup for new workspaces
 *
 * Collects name, email, company to bootstrap context/profile.md
 * before full conversational onboarding. Optionally configures AI credentials.
 */
import { createServices, loadConfig, refreshQmdIndex, saveCredential, getApiKey } from '@arete/core';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join } from 'node:path';
import chalk from 'chalk';
import { header, success, error, info, warn, listItem } from '../formatters.js';
import { testProviderConnection, maskApiKey } from './credentials.js';
function extractDomainFromEmail(email) {
    const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
    return match ? match[1] : null;
}
function extractDomainFromUrl(url) {
    try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        return parsed.hostname.replace(/^www\./, '');
    }
    catch {
        return null;
    }
}
export function registerOnboardCommand(program) {
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
        .action(async (opts) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
            }
            else {
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
        let answers = null;
        let domains = [];
        if (!profileSkipped) {
            // Use CLI options if all required fields provided
            if (opts.name && opts.email && opts.company) {
                answers = {
                    name: opts.name,
                    email: opts.email,
                    company: opts.company,
                    website: opts.website,
                };
            }
            else if (opts.json) {
                // JSON mode requires all fields via options
                console.log(JSON.stringify({
                    success: false,
                    error: 'JSON mode requires --name, --email, and --company options',
                }));
                process.exit(1);
            }
            else {
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
                    const websiteInput = await rl.question(chalk.dim('Company website? (optional, press enter to skip) '));
                    const website = websiteInput.trim() || undefined;
                    answers = { name: name.trim(), email: email.trim(), company: company.trim(), website };
                }
                finally {
                    rl.close();
                }
            }
            // Extract domains for People Intelligence
            const emailDomain = extractDomainFromEmail(answers.email);
            if (emailDomain)
                domains.push(emailDomain);
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
        }
        else {
            const existingKey = getApiKey('anthropic');
            // Determine if we should prompt for AI key
            let shouldPrompt = false;
            let apiKeyToSave = null;
            if (opts.apiKey) {
                // Non-interactive: use provided key
                apiKeyToSave = opts.apiKey;
            }
            else if (opts.json) {
                // JSON mode without --api-key: skip AI config (can't prompt)
                aiSkipped = true;
            }
            else if (existingKey) {
                // Interactive mode with existing key: ask to update
                console.log('');
                const { confirm } = await import('@inquirer/prompts');
                try {
                    const update = await confirm({
                        message: `Update Anthropic API key? (current: ${maskApiKey(existingKey)})`,
                        default: false,
                    });
                    if (update) {
                        shouldPrompt = true;
                    }
                    else {
                        info('Keeping existing API key');
                        aiConfigured = true; // Already configured
                    }
                }
                catch {
                    // User cancelled (Ctrl+C)
                    aiSkipped = true;
                }
            }
            else {
                // Interactive mode with no existing key: prompt for initial key
                shouldPrompt = true;
            }
            // Prompt for key if needed
            if (shouldPrompt && !opts.json) {
                console.log('');
                info('AI Configuration');
                console.log(chalk.dim('  Areté uses AI to extract insights from your meetings and context.'));
                console.log(chalk.dim('  Get your API key at: https://console.anthropic.com/account/keys'));
                console.log('');
                const { password } = await import('@inquirer/prompts');
                try {
                    const apiKeyInput = await password({
                        message: 'Enter your Anthropic API key (or press Enter to skip):',
                    });
                    if (apiKeyInput && apiKeyInput.trim()) {
                        apiKeyToSave = apiKeyInput.trim();
                    }
                    else {
                        aiSkipped = true;
                        info('Skipping AI configuration — you can configure later with: arete credentials set anthropic');
                    }
                }
                catch {
                    // User cancelled (Ctrl+C)
                    aiSkipped = true;
                }
            }
            // Default AI configuration for the workspace
            const DEFAULT_AI_CONFIG = {
                tiers: {
                    fast: 'gemini-2.0-flash',
                    standard: 'claude-sonnet-4-20250514',
                    frontier: 'claude-3-opus',
                },
                tasks: {
                    summary: 'fast',
                    extraction: 'fast',
                    decision_extraction: 'standard',
                    learning_extraction: 'standard',
                    significance_analysis: 'frontier',
                    reconciliation: 'fast',
                },
            };
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
                    await services.workspace.updateManifestField(root, 'ai', DEFAULT_AI_CONFIG);
                    aiConfigured = true;
                    if (!opts.json) {
                        success('API key validated and saved');
                        listItem('Model', result.model);
                    }
                }
                else {
                    // Validation failed
                    if (result.isNetworkError) {
                        // Network error - warn but allow save
                        if (!opts.json) {
                            warn(`Could not validate: ${result.error}`);
                            info('Saving anyway');
                        }
                        saveCredential('anthropic', apiKeyToSave);
                        // Still write AI config
                        await services.workspace.updateManifestField(root, 'ai', DEFAULT_AI_CONFIG);
                        aiConfigured = true;
                    }
                    else {
                        // Auth error - don't save
                        if (opts.json) {
                            console.log(JSON.stringify({
                                success: false,
                                error: `Invalid API key: ${result.error}`,
                            }));
                            process.exit(1);
                        }
                        else {
                            error(`Invalid API key: ${result.error}`);
                            info('API key was not saved. Run "arete credentials set anthropic" to try again.');
                            aiSkipped = true;
                        }
                    }
                }
            }
        }
        // ========================================
        // PHASE 3: Output
        // ========================================
        if (opts.json) {
            const output = {
                success: true,
                profile: profileSkipped
                    ? { skipped: true }
                    : {
                        name: answers.name,
                        email: answers.email,
                        company: answers.company,
                        website: answers.website,
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
            };
            console.log(JSON.stringify(output, null, 2));
            return;
        }
        // Non-JSON mode final output
        console.log('');
        if (!aiSkipped && !aiConfigured) {
            info('Continue onboarding by saying "Let\'s get started" in chat');
        }
        else {
            info('Continue onboarding by saying "Let\'s get started" in chat');
        }
        console.log('');
        console.log(chalk.dim('The agent will help you:'));
        console.log(chalk.dim('  • Import your existing docs and context'));
        console.log(chalk.dim('  • Connect integrations (calendar, Fathom)'));
        console.log(chalk.dim('  • Get your first quick win'));
    });
}
//# sourceMappingURL=onboard.js.map