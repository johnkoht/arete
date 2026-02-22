/**
 * arete onboard — Quick identity setup for new workspaces
 *
 * Collects name, email, company to bootstrap context/profile.md
 * before full conversational onboarding.
 */

import {
  createServices,
  KrispMcpClient,
  saveKrispCredentials,
  listIcalBuddyCalendars,
  saveFathomApiKey,
} from '@arete/core';
import type { AreteServices, IntegrationListEntry } from '@arete/core';
import type { Command } from 'commander';
import { input, confirm, checkbox } from '@inquirer/prompts';
import { join } from 'node:path';
import chalk from 'chalk';
import { parse as parseYaml } from 'yaml';
import { header, success, error, info } from '../formatters.js';

interface OnboardAnswers {
  name: string;
  email: string;
  company: string;
  website?: string;
}

interface IntegrationResult {
  calendar: { configured: boolean; calendars?: string[]; skipped?: boolean; installRequired?: boolean };
  fathom: { configured: boolean; skipped?: boolean };
  krisp: { configured: boolean; skipped?: boolean; timedOut?: boolean };
}

interface IntegrationOpts {
  json?: boolean;
  skipIntegrations?: boolean;
  calendar?: boolean;
  calendars?: string;
  fathomKey?: string;
}

export interface ParsedProfile {
  name?: string;
  email?: string;
  company?: string;
  website?: string;
  created?: string;
}

export function parseProfileFrontmatter(content: string): ParsedProfile {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    const parsed = parseYaml(match[1]) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
      company: typeof parsed.company === 'string' ? parsed.company : undefined,
      website: typeof parsed.website === 'string' ? parsed.website : undefined,
      created: typeof parsed.created === 'string' ? parsed.created : undefined,
    };
  } catch {
    return {};
  }
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

function findIntegration(entries: IntegrationListEntry[], name: string): IntegrationListEntry | undefined {
  return entries.find(e => e.name === name);
}

function statusLabel(entry: IntegrationListEntry | undefined): string {
  return entry?.active ? chalk.green(' [active]') : '';
}

async function runIntegrationPhase(
  services: AreteServices,
  root: string,
  opts: IntegrationOpts,
): Promise<IntegrationResult> {
  const result: IntegrationResult = {
    calendar: { configured: false, skipped: true },
    fathom: { configured: false, skipped: true },
    krisp: { configured: false, skipped: true },
  };

  const hasExplicitFlags = !!(opts.calendar || opts.fathomKey);
  const skipPrompts = opts.skipIntegrations || opts.json;

  // Load integration status only if we need it (for prompts or explicit flags)
  const entries = hasExplicitFlags || !skipPrompts
    ? await services.integrations.list(root)
    : [];
  const calendarEntry = findIntegration(entries, 'calendar');
  const fathomEntry = findIntegration(entries, 'fathom');
  const krispEntry = findIntegration(entries, 'krisp');

  // --- Calendar ---
  if (opts.calendar) {
    // Non-interactive: --calendar flag
    const selectedCalendars = (opts.calendars ?? '')
      .split(',')
      .map(v => v.trim())
      .filter(v => v.length > 0);

    await services.integrations.configure(root, 'calendar', {
      provider: 'macos',
      status: 'active',
      calendars: selectedCalendars,
    });
    result.calendar = { configured: true, calendars: selectedCalendars };
  } else if (!skipPrompts) {
    // Interactive calendar prompt
    const calStatus = statusLabel(calendarEntry);
    const wantCalendar = await confirm({
      message: `Set up calendar integration?${calStatus}`,
      default: false,
    });

    if (wantCalendar) {
      const { available, calendars } = await listIcalBuddyCalendars();

      if (!available) {
        console.log('');
        info('icalBuddy is required for macOS calendar integration.');
        console.log(chalk.dim('  Install: brew install ical-buddy'));
        console.log(chalk.dim('  Then rerun: arete onboard'));
        console.log('');
        result.calendar = { configured: false, installRequired: true };
      } else if (calendars.length > 0) {
        const choices = [
          { name: 'All calendars', value: '__all__' },
          ...calendars.map(c => ({ name: c, value: c })),
        ];
        const selected = await checkbox({
          message: 'Select calendars to sync:',
          choices,
          pageSize: 12,
        });

        const useAll = selected.includes('__all__');
        const selectedCalendars = useAll ? [] : selected;

        await services.integrations.configure(root, 'calendar', {
          provider: 'macos',
          status: 'active',
          calendars: selectedCalendars,
        });
        result.calendar = {
          configured: true,
          calendars: useAll ? calendars : selectedCalendars,
        };
      } else {
        // icalBuddy available but no calendars found
        await services.integrations.configure(root, 'calendar', {
          provider: 'macos',
          status: 'active',
          calendars: [],
        });
        result.calendar = { configured: true, calendars: [] };
      }
    }
  }

  // --- Fathom ---
  if (opts.fathomKey) {
    // Non-interactive: --fathom-key flag
    await saveFathomApiKey(services.storage, root, opts.fathomKey);
    await services.integrations.configure(root, 'fathom', { status: 'active' });
    result.fathom = { configured: true };
  } else if (!skipPrompts) {
    // Interactive fathom prompt
    const fathomStatus = statusLabel(fathomEntry);
    const wantFathom = await confirm({
      message: `Set up Fathom meeting transcripts?${fathomStatus}`,
      default: false,
    });

    if (wantFathom) {
      console.log(chalk.dim('  Get your API key from https://fathom.video/customize'));
      const apiKey = await input({
        message: 'Fathom API key:',
      });

      if (apiKey.trim()) {
        await saveFathomApiKey(services.storage, root, apiKey.trim());
        await services.integrations.configure(root, 'fathom', { status: 'active' });
        result.fathom = { configured: true };
      }
    }
  }

  // --- Krisp ---
  if (!skipPrompts) {
    const krispStatus = statusLabel(krispEntry);
    const wantKrisp = await confirm({
      message: `Set up Krisp meeting notes?${krispStatus}`,
      default: false,
    });

    if (wantKrisp) {
      const client = new KrispMcpClient(services.storage, root);
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 120_000)
      );

      try {
        info('Opening browser for Krisp authorization...');
        const creds = await Promise.race([client.configure(services.storage, root), timeout]);
        await saveKrispCredentials(services.storage, root, creds);
        await services.integrations.configure(root, 'krisp', { status: 'active' });
        result.krisp = { configured: true };
      } catch {
        console.log('');
        info('Krisp setup timed out or was cancelled. You can set it up later:');
        console.log(chalk.dim('  arete integration configure krisp'));
        console.log('');
        result.krisp = { configured: false, timedOut: true };
      }
    }
  }

  return result;
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
    .option('--skip-integrations', 'Skip integration setup prompts')
    .option('--calendar', 'Configure calendar integration (non-interactive)')
    .option('--calendars <list>', 'Calendar names to sync (comma-separated, use with --calendar)')
    .option('--fathom-key <key>', 'Fathom API key (non-interactive)')
    .action(async (opts: {
      json?: boolean;
      name?: string;
      email?: string;
      company?: string;
      website?: string;
      skipIntegrations?: boolean;
      calendar?: boolean;
      calendars?: string;
      fathomKey?: string;
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

      // Read existing profile for rerun-safe defaults
      const profilePath = join(root, 'context', 'profile.md');
      const profileExists = await services.storage.exists(profilePath);
      let existing: ParsedProfile = {};
      if (profileExists) {
        const content = await services.storage.read(profilePath);
        if (content) {
          existing = parseProfileFrontmatter(content);
        }
      }

      let answers: OnboardAnswers;

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
        // Interactive mode with rerun-safe defaults
        header('Areté Onboarding');
        console.log('Let me get to know you before we set up your workspace.');
        console.log('');

        const name = await input({
          message: 'What\'s your name?',
          default: existing.name,
        });
        if (!name.trim()) {
          error('Name is required');
          process.exit(1);
        }

        const email = await input({
          message: 'What\'s your work email?',
          default: existing.email,
        });
        if (!email.trim() || !email.includes('@')) {
          error('Valid email is required');
          process.exit(1);
        }

        const company = await input({
          message: 'What company are you at?',
          default: existing.company,
        });
        if (!company.trim()) {
          error('Company name is required');
          process.exit(1);
        }

        const websiteInput = await input({
          message: 'Company website? (optional, press enter to skip)',
          default: existing.website,
        });
        const website = websiteInput.trim() || undefined;

        answers = { name: name.trim(), email: email.trim(), company: company.trim(), website };
      }

      // Extract domains for People Intelligence
      const domains: string[] = [];
      const emailDomain = extractDomainFromEmail(answers.email);
      if (emailDomain) domains.push(emailDomain);
      if (answers.website) {
        const websiteDomain = extractDomainFromUrl(answers.website);
        if (websiteDomain && !domains.includes(websiteDomain)) {
          domains.push(websiteDomain);
        }
      }

      // Generate profile content — preserve created timestamp on rerun
      const now = existing.created || new Date().toISOString();
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

      // Run integration phase
      const integrations = await runIntegrationPhase(services, root, opts);

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          profile: {
            name: answers.name,
            email: answers.email,
            company: answers.company,
            website: answers.website,
            domains,
          },
          integrations,
          files: {
            profile: profilePath,
            domainHints: domains.length > 0 ? join(root, 'context', 'domain-hints.md') : null,
          },
        }, null, 2));
        return;
      }

      // Interactive summary
      console.log('');
      success('Profile saved');

      // Calendar status
      if (integrations.calendar.configured) {
        const calNames = integrations.calendar.calendars?.length
          ? integrations.calendar.calendars.join(', ')
          : 'all';
        console.log(chalk.dim(`  Calendar: configured (${calNames})`));
      } else if (integrations.calendar.installRequired) {
        console.log(chalk.dim('  Calendar: install icalBuddy to enable'));
      } else {
        console.log(chalk.dim('  Calendar: skipped'));
      }

      // Fathom status
      console.log(chalk.dim(`  Fathom: ${integrations.fathom.configured ? 'configured' : 'skipped'}`));

      // Krisp status
      if (integrations.krisp.configured) {
        console.log(chalk.dim('  Krisp: connected'));
      } else if (integrations.krisp.timedOut) {
        console.log(chalk.dim('  Krisp: timed out'));
      } else {
        console.log(chalk.dim('  Krisp: skipped'));
      }

      console.log('');
      info('Continue onboarding by saying "Let\'s get started" in chat');
    });
}
