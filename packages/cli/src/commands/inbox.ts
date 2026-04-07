/**
 * arete inbox — Manage inbox items for triage.
 *
 * Lightweight helper for adding content to the workspace inbox.
 * Items can also arrive via web clippers, manual file drops, or agent chat.
 */

import {
  createServices,
  loadConfig,
  refreshQmdIndex,
  slugify,
  type QmdRefreshResult,
  type StorageAdapter,
} from '@arete/core';
import type { Command } from 'commander';
import { join, basename, extname } from 'node:path';
import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import {
  success,
  error,
  info,
  listItem,
} from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';

/** Build frontmatter + body for an inbox markdown file. */
function buildInboxMarkdown(opts: {
  title: string;
  source: string;
  body: string;
  type?: string;
}): string {
  const now = new Date().toISOString();
  const lines = [
    '---',
    `title: "${opts.title.replace(/"/g, '\\"')}"`,
    `source: "${opts.source.replace(/"/g, '\\"')}"`,
    `clipped: ${now}`,
  ];
  if (opts.type) {
    lines.push(`type: ${opts.type}`);
  }
  lines.push('status: unprocessed');
  lines.push('tags: []');
  lines.push('---');
  lines.push('');
  lines.push(opts.body);
  return lines.join('\n');
}

/** Extract a title from HTML content (basic <title> tag). */
function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

/**
 * Convert HTML to basic markdown. Handles headings, paragraphs, line breaks,
 * list items, and common entities. Strips scripts/styles.
 * Limitations: tables, nested lists, code blocks, and images are lost.
 * A library like turndown would be a natural v2 upgrade.
 */
function htmlToBasicMarkdown(html: string): string {
  // Remove script and style blocks
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  // Convert some tags
  text = text.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_, level, content) =>
    '#'.repeat(Number(level)) + ' ' + content.trim());
  text = text.replace(/<p[^>]*>/gi, '\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '- ');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  // Collapse excessive whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export interface InboxAddResult {
  success: boolean;
  path: string;
  title: string;
  source: string;
  qmd?: QmdRefreshResult | { indexed: false; skipped: true };
}

export interface InboxAddDeps {
  createServices: typeof createServices;
  loadConfig: typeof loadConfig;
  refreshQmdIndex: typeof refreshQmdIndex;
  fetchFn?: typeof fetch;
  readFileSync?: typeof readFileSync;
  copyFileSync?: typeof copyFileSync;
  existsSync?: typeof existsSync;
}

function getDefaultDeps(): InboxAddDeps {
  return {
    createServices,
    loadConfig,
    refreshQmdIndex,
    fetchFn: fetch,
    readFileSync,
    copyFileSync,
    existsSync,
  };
}

/** Core logic for inbox add, exported for testing. */
export async function runInboxAdd(
  opts: {
    title?: string;
    body?: string;
    source?: string;
    url?: string;
    file?: string;
    skipQmd?: boolean;
    json?: boolean;
  },
  deps: InboxAddDeps = getDefaultDeps(),
): Promise<void> {
  const services = await deps.createServices(process.cwd());
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

  // Determine mode: --title/--body, --url, or --file
  const modes = [
    opts.title || opts.body ? 'text' : null,
    opts.url ? 'url' : null,
    opts.file ? 'file' : null,
  ].filter(Boolean);

  if (modes.length === 0) {
    const errorMsg = 'Provide --title/--body, --url, or --file';
    if (opts.json) {
      console.log(JSON.stringify({ success: false, error: errorMsg }));
    } else {
      error(errorMsg);
      info('Examples:');
      info('  arete inbox add --title "Note" --body "Content"');
      info('  arete inbox add --url "https://example.com"');
      info('  arete inbox add --file ./doc.pdf');
    }
    process.exit(1);
  }

  // Allow --url with --title (title override), but reject all other multi-mode combos
  const isUrlWithTitleOverride = modes.length === 2 && modes.includes('url') && modes.includes('text') && !opts.file;
  if (modes.length > 1 && !isUrlWithTitleOverride) {
    const errorMsg = 'Use only one of: --title/--body, --url, or --file';
    if (opts.json) {
      console.log(JSON.stringify({ success: false, error: errorMsg }));
    } else {
      error(errorMsg);
    }
    process.exit(1);
  }

  let title: string;
  let body: string;
  let source: string;
  let itemType: string | undefined;
  let binaryFileName: string | undefined;

  if (opts.url) {
    // URL mode: fetch and convert
    const fetchFn = deps.fetchFn ?? fetch;
    let html: string;
    try {
      const response = await fetchFn(opts.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      html = await response.text();
    } catch (err) {
      const errorMsg = `Failed to fetch URL: ${(err as Error).message}`;
      if (opts.json) {
        console.log(JSON.stringify({ success: false, error: errorMsg }));
      } else {
        error(errorMsg);
      }
      process.exit(1);
    }

    title = opts.title || extractHtmlTitle(html!) || new URL(opts.url).pathname.split('/').pop() || 'untitled';
    body = htmlToBasicMarkdown(html!);
    source = opts.url;
    itemType = 'article';
  } else if (opts.file) {
    // File mode: copy file + create companion .md
    const filePath = opts.file;
    const checkExists = deps.existsSync ?? existsSync;

    if (!checkExists(filePath)) {
      const errorMsg = `File not found: ${filePath}`;
      if (opts.json) {
        console.log(JSON.stringify({ success: false, error: errorMsg }));
      } else {
        error(errorMsg);
      }
      process.exit(1);
    }

    const ext = extname(filePath).toLowerCase();
    const fileBaseName = basename(filePath, ext);
    title = opts.title || fileBaseName;
    source = basename(filePath);
    binaryFileName = basename(filePath);

    if (ext === '.md' || ext === '.txt') {
      // Text files: read content directly
      const readFn = deps.readFileSync ?? readFileSync;
      body = readFn(filePath, 'utf-8') as string;
      itemType = 'note';
    } else {
      // Binary files: copy + create companion .md
      body = `Companion file for \`${binaryFileName}\`. Run \`inbox-triage\` to analyze content.`;
      itemType = ext === '.pdf' ? 'pdf' : 'reference';
    }
  } else {
    // Text mode: --title/--body
    title = opts.title || 'Untitled';
    body = opts.body || '';
    source = opts.source || 'manual';
    itemType = 'note';
  }

  const fileSlug = slugify(title);
  const inboxDir = join(root, 'inbox');

  // For binary files, copy the original (ensure inbox/ exists first)
  if (binaryFileName && opts.file) {
    mkdirSync(inboxDir, { recursive: true });
    const destBinary = join(inboxDir, binaryFileName);
    const copyFn = deps.copyFileSync ?? copyFileSync;
    try {
      copyFn(opts.file, destBinary);
    } catch (err) {
      const errorMsg = `Failed to copy file: ${(err as Error).message}`;
      if (opts.json) {
        console.log(JSON.stringify({ success: false, error: errorMsg }));
      } else {
        error(errorMsg);
      }
      process.exit(1);
    }
  }

  // Write the markdown file
  const mdPath = join(inboxDir, `${fileSlug}.md`);
  const markdown = buildInboxMarkdown({ title, source, body, type: itemType });
  await services.storage.write(mdPath, markdown);

  // Refresh QMD index
  let qmdResult: QmdRefreshResult | undefined;
  if (!opts.skipQmd) {
    const config = await deps.loadConfig(services.storage, root);
    qmdResult = await deps.refreshQmdIndex(root, config.qmd_collection);
  }

  // Output
  const relativePath = binaryFileName
    ? `inbox/${binaryFileName} + inbox/${fileSlug}.md`
    : `inbox/${fileSlug}.md`;

  if (opts.json) {
    console.log(JSON.stringify({
      success: true,
      path: `inbox/${fileSlug}.md`,
      title,
      source,
      qmd: qmdResult ?? { indexed: false, skipped: true },
    }, null, 2));
    return;
  }

  console.log('');
  success('Item added to inbox');
  console.log('');
  listItem('Title', title);
  listItem('Path', relativePath);
  listItem('Source', source);
  displayQmdResult(qmdResult);
  console.log('');
}

export function registerInboxCommand(program: Command): void {
  const inboxCmd = program
    .command('inbox')
    .description('Manage inbox items');

  inboxCmd
    .command('add')
    .description('Add item to inbox for triage')
    .option('--title <title>', 'Item title')
    .option('--body <body>', 'Item content (markdown)')
    .option('--source <source>', 'Content source (e.g., "agent-chat", "manual")')
    .option('--url <url>', 'Fetch URL and add as article')
    .option('--file <path>', 'Copy file into inbox')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .action(async (opts: {
      title?: string;
      body?: string;
      source?: string;
      url?: string;
      file?: string;
      skipQmd?: boolean;
      json?: boolean;
    }) => {
      await runInboxAdd(opts);
    });
}
