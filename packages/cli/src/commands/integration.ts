/**
 * Integration commands — list, add, configure, remove
 */

import { createServices, KrispMcpClient, saveKrispCredentials } from '@arete/core';
import type { StorageAdapter } from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'path';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { header, success, error, info, warn } from '../formatters.js';

const NOTION_VERSION = '2022-06-28';
const DEFAULT_NOTION_API_BASE = 'https://api.notion.com';

type IntegrationConfigurer = {
  configure: (workspaceRoot: string, integration: string, config: Record<string, unknown>) => Promise<void>;
};

export function registerIntegrationCommands(program: Command): void {
  const integrationCmd = program
    .command('integration')
    .description('Manage integrations');

  integrationCmd
    .command('list')
    .description('List available integrations and their status')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      const entries = root
        ? await services.integrations.list(root)
        : [];

      if (opts.json) {
        console.log(
          JSON.stringify(
            { success: true, workspace: root, integrations: entries },
            null,
            2,
          ),
        );
        return;
      }

      header('Available Integrations');
      if (entries.length === 0) {
        if (!root) {
          info('Not in an Areté workspace. Run "arete install" first.');
        } else {
          info('No integrations configured.');
        }
        console.log('');
        return;
      }

      for (const int of entries) {
        const status =
          int.configured === 'active'
            ? chalk.green(' [active]')
            : int.configured
              ? chalk.yellow(` [${int.configured}]`)
              : '';
        console.log(`  ${chalk.dim('•')} ${int.displayName ?? int.name}${status}`);
        if (int.description) {
          console.log(`    ${chalk.dim(int.description)}`);
        }
      }
      console.log('');
    });

  integrationCmd
    .command('configure <name>')
    .description('Configure an integration')
    .option('--calendars <list>', 'Calendar names (comma-separated)')
    .option('--all', 'Include all calendars')
    .option('--token <value>', 'Notion API token (non-interactive)')
    .option('--json', 'Output as JSON')
    .action(
      async (
        name: string,
        opts: { calendars?: string; all?: boolean; token?: string; json?: boolean },
      ) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
          } else {
            error('Not in an Areté workspace');
          }
          process.exit(1);
        }

        if (name === 'calendar') {
          const selectedCalendars = (opts.calendars ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value.length > 0);

          const calendarConfig: Record<string, unknown> = {
            provider: 'macos',
            status: 'active',
          };

          if (opts.all) {
            calendarConfig.calendars = [];
          } else if (selectedCalendars.length > 0) {
            calendarConfig.calendars = selectedCalendars;
          }

          await services.integrations.configure(root, name, calendarConfig);

          if (opts.json) {
            console.log(
              JSON.stringify({
                success: true,
                integration: name,
                provider: 'macos',
                calendars: opts.all ? 'all' : selectedCalendars,
              }),
            );
          } else {
            success('calendar integration configured');
            if (opts.all) {
              info('Calendar scope: all calendars');
            } else if (selectedCalendars.length > 0) {
              info(`Calendar scope: ${selectedCalendars.join(', ')}`);
            } else {
              info('Calendar scope: provider configured (add --calendars or --all to set scope)');
            }
          }
          return;
        }

        if (name === 'notion') {
          const token = (await resolveNotionToken(opts.token, promptForNotionToken)).trim();
          if (!token) {
            if (opts.json) {
              console.log(JSON.stringify({ success: false, error: 'Notion API token is required' }));
            } else {
              error('Notion API token is required');
              info('Use --token <value> for non-interactive configuration');
            }
            process.exit(1);
          }

          try {
            await configureNotionIntegration({
              storage: services.storage,
              integrationService: services.integrations,
              workspaceRoot: root,
              token,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (opts.json) {
              console.log(JSON.stringify({ success: false, error: message }));
            } else {
              error(message);
            }
            process.exit(1);
          }

          const mcpSnippet = getNotionMcpSnippet();
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: true,
                integration: 'notion',
                credentialsPath: '.credentials/credentials.yaml',
                mcpSnippet,
              }),
            );
          } else {
            success('notion integration configured');
            info('Saved token to .credentials/credentials.yaml (notion.api_key)');
            info('MCP setup (.cursor/mcp.json):');
            console.log(mcpSnippet);
          }
          return;
        }

        if (name === 'google-calendar') {
          // Pre-flight: check for real credentials (beta — no production keys shipped)
          const { getClientCredentials } = await import('@arete/core');
          const { clientId } = getClientCredentials();
          if (clientId === 'PLACEHOLDER_CLIENT_ID') {
            console.log('');
            warn('Google Calendar integration is in beta');
            console.log('');
            console.log('  To connect Google Calendar, choose one of:');
            console.log('');
            console.log(`  ${chalk.bold('1. Bring your own API keys')}`);
            console.log('     → Create a Google Cloud project with Calendar API enabled');
            console.log('     → Create an OAuth 2.0 Client ID (Desktop app type)');
            console.log('     → Set environment variables:');
            console.log(`       ${chalk.cyan('export GOOGLE_CLIENT_ID="your-client-id"')}`);
            console.log(`       ${chalk.cyan('export GOOGLE_CLIENT_SECRET="your-client-secret"')}`);
            console.log('');
            console.log(`  ${chalk.bold('2. Request beta access')}`);
            console.log(`     → Email ${chalk.cyan('john.koht@gmail.com')} to be added as an approved tester`);
            console.log('     → You\'ll receive credentials to set as environment variables');
            console.log('');
            console.log(`  Once configured, re-run: ${chalk.cyan('arete integration configure google-calendar')}`);
            console.log('');
            process.exit(1);
          }

          // 1. Run OAuth flow
          const { authenticateGoogle, listCalendars } = await import('@arete/core');
          console.log('');
          info('Opening browser for Google Calendar authorization...');
          info('If you see an "unverified app" warning, click "Advanced" → "Go to Areté"');
          console.log('');
          await authenticateGoogle(services.storage, root);
          success('Google Calendar authenticated');

          // 2. Fetch and select calendars
          const calendars = await listCalendars(services.storage, root);

          let selectedCalendarIds: string[] = [];
          if (opts.all) {
            selectedCalendarIds = calendars.map(c => c.id);
          } else if (opts.calendars) {
            selectedCalendarIds = opts.calendars.split(',').map(s => s.trim()).filter(Boolean);
          } else if (calendars.length > 0) {
            // Interactive calendar selection
            const { checkbox } = await import('@inquirer/prompts');
            const selected = await checkbox({
              message: 'Select calendars to sync',
              choices: calendars.map(c => ({
                name: `${c.summary}${c.primary ? ' (primary)' : ''}`,
                value: c.id,
                checked: c.primary === true,
              })),
              pageSize: 12,
            });
            selectedCalendarIds = selected;
          }

          // 3. Write config — provider: 'google' (producer-consumer: factory reads this exact string)
          const calendarConfig: Record<string, unknown> = {
            provider: 'google',  // getCalendarProvider reads this — keep in sync
            status: 'active',
            calendars: selectedCalendarIds,
          };
          await services.integrations.configure(root, 'calendar', calendarConfig);

          if (opts.json) {
            console.log(JSON.stringify({
              success: true,
              integration: 'google-calendar',
              provider: 'google',
              calendars: selectedCalendarIds,
            }));
          } else {
            success('Google Calendar configured');
            info(`Syncing ${selectedCalendarIds.length} calendar(s)`);
            info('Run: arete pull calendar');
          }
          return;
        }

        if (name === 'krisp') {
          const client = new KrispMcpClient(services.storage, root);
          const creds = await client.configure(services.storage, root);
          await saveKrispCredentials(services.storage, root, creds);
          await services.integrations.configure(root, 'krisp', { status: 'active' });
          if (opts.json) {
            console.log(JSON.stringify({ success: true, integration: 'krisp' }));
          } else {
            success('✅ Krisp connected. Run `arete pull krisp` to sync meetings.');
          }
          return;
        }

        await services.integrations.configure(root, name, { status: 'active' });
        if (opts.json) {
          console.log(JSON.stringify({ success: true, integration: name }));
        } else {
          success(`${name} integration configured`);
        }
      },
    );
}

export async function resolveNotionToken(
  tokenFromOption: string | undefined,
  promptFn: () => Promise<string>,
): Promise<string> {
  if (tokenFromOption !== undefined) {
    return tokenFromOption;
  }
  return promptFn();
}

async function promptForNotionToken(): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return await rl.question('Enter Notion API token: ');
  } finally {
    rl.close();
  }
}

export async function configureNotionIntegration(input: {
  storage: StorageAdapter;
  integrationService: IntegrationConfigurer;
  workspaceRoot: string;
  token: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
}): Promise<void> {
  await validateNotionToken(input.token, {
    fetchFn: input.fetchFn,
    baseUrl: input.baseUrl,
  });
  await saveNotionApiKey(input.storage, input.workspaceRoot, input.token);
  await input.integrationService.configure(input.workspaceRoot, 'notion', { status: 'active' });
}

export async function validateNotionToken(
  token: string,
  deps: { fetchFn?: typeof fetch; baseUrl?: string } = {},
): Promise<void> {
  const fetchFn = deps.fetchFn ?? fetch;
  const baseUrl = (deps.baseUrl ?? process.env.ARETE_NOTION_API_BASE ?? DEFAULT_NOTION_API_BASE)
    .replace(/\/$/, '');
  const response = await fetchFn(`${baseUrl}/v1/users/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
    },
  });

  if (response.status === 401) {
    throw new Error('Invalid Notion API token. Check your token at notion.so/profile/integrations');
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const details = body ? `: ${body}` : '';
    throw new Error(`Failed to validate Notion token (${response.status})${details}`);
  }
}

export async function saveNotionApiKey(
  storage: StorageAdapter,
  workspaceRoot: string,
  token: string,
): Promise<void> {
  const credPath = join(workspaceRoot, '.credentials', 'credentials.yaml');
  let existing: Record<string, unknown> = {};

  const exists = await storage.exists(credPath);
  if (exists) {
    const content = await storage.read(credPath);
    if (content) {
      try {
        const parsed = parseYaml(content);
        if (parsed && typeof parsed === 'object') {
          existing = parsed as Record<string, unknown>;
        }
      } catch {
        existing = {};
      }
    }
  }

  const notion = existing.notion;
  const notionObject = notion && typeof notion === 'object'
    ? notion as Record<string, unknown>
    : {};

  const merged: Record<string, unknown> = {
    ...existing,
    notion: {
      ...notionObject,
      api_key: token,
    },
  };

  await storage.write(credPath, stringifyYaml(merged));
}

export function getNotionMcpSnippet(): string {
  const snippet = {
    mcpServers: {
      notion: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-notion'],
        env: {
          NOTION_API_KEY: '<paste-your-token>',
        },
      },
    },
  };

  return JSON.stringify(snippet, null, 2);
}
