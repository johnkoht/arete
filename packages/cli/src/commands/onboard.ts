/**
 * arete onboard — Quick identity setup for new workspaces
 *
 * Collects name, email, company to bootstrap context/profile.md
 * before full conversational onboarding.
 */

import { createServices } from '@arete/core';
import type { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join } from 'node:path';
import chalk from 'chalk';
import { header, success, error, info, warn } from '../formatters.js';

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

export function registerOnboardCommand(program: Command): void {
  program
    .command('onboard')
    .description('Quick identity setup for new workspaces')
    .option('--json', 'Output as JSON')
    .option('--name <name>', 'Your name')
    .option('--email <email>', 'Your work email')
    .option('--company <company>', 'Your company name')
    .option('--website <url>', 'Company website URL (optional)')
    .action(async (opts: {
      json?: boolean;
      name?: string;
      email?: string;
      company?: string;
      website?: string;
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

      if (profileExists && !opts.json) {
        const existingContent = await services.storage.read(profilePath);
        if (existingContent && !existingContent.includes('[Your name]')) {
          warn('Profile already exists at context/profile.md');
          info('To update, edit the file directly or delete it first');
          console.log('');
          info('Continue onboarding by saying "Let\'s get started" in chat');
          return;
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

          const companyInput = await rl.question(
            chalk.cyan('What company are you at? (or paste website URL) ')
          );
          if (!companyInput.trim()) {
            error('Company name or website is required');
            process.exit(1);
          }

          // Detect if they pasted a URL
          let company = companyInput.trim();
          let website: string | undefined;

          if (companyInput.includes('.') && (companyInput.includes('http') || companyInput.includes('www'))) {
            website = companyInput.trim();
            // Extract company name from domain
            const domain = extractDomainFromUrl(website);
            if (domain) {
              const companyFromDomain = domain.split('.')[0];
              const derivedCompany = await rl.question(
                chalk.cyan(`Company name? (press enter for "${companyFromDomain}") `)
              );
              company = derivedCompany.trim() || companyFromDomain;
            }
          } else {
            // Ask for website optionally
            const websiteInput = await rl.question(
              chalk.dim('Company website? (optional, press enter to skip) ')
            );
            if (websiteInput.trim()) {
              website = websiteInput.trim();
            }
          }

          answers = { name: name.trim(), email: email.trim(), company, website };
        } finally {
          rl.close();
        }
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
          files: {
            profile: profilePath,
            domainHints: domains.length > 0 ? join(root, 'context', 'domain-hints.md') : null,
          },
        }, null, 2));
        return;
      }

      console.log('');
      success('Profile created!');
      console.log('');
      console.log(chalk.dim('  Profile saved to: context/profile.md'));
      if (domains.length > 0) {
        console.log(chalk.dim('  Domain hints saved to: context/domain-hints.md'));
      }
      console.log('');
      info('Continue onboarding by saying "Let\'s get started" in chat');
      console.log('');
      console.log(chalk.dim('The agent will help you:'));
      console.log(chalk.dim('  • Import your existing docs and context'));
      console.log(chalk.dim('  • Connect integrations (calendar, Fathom)'));
      console.log(chalk.dim('  • Get your first quick win'));
    });
}
