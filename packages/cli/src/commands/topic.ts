/**
 * Topic commands — list, show, refresh, lint
 *
 * The `arete topic` noun (mirrors `arete people`) surfaces the L3
 * topic-wiki layer: list all topics, view a single topic page, refresh
 * a topic's narrative from meetings that mention it, lint for stale /
 * stub / orphan topics.
 *
 * Seed (one-shot backfill from all meetings) is separate — see Step 8.
 */

import {
  createServices,
  renderTopicPage,
  parseMeetingFile,
  hashSource,
  type TopicPage,
} from '@arete/core';
import type { Command } from 'commander';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import {
  header,
  listItem,
  error,
  info,
  success,
  warn,
} from '../formatters.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STALE_DAYS = 60;

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerTopicCommands(program: Command): void {
  const topicCmd = program
    .command('topic')
    .description('List, view, refresh, and lint topic pages (L3 wiki memory)');

  // ---------------------------------------------------------------------------
  // arete topic list
  // ---------------------------------------------------------------------------
  topicCmd
    .command('list')
    .description('List all topic pages')
    .option('--area <slug>', 'Filter to topics in this area')
    .option('--json', 'Output as JSON')
    .action(async (opts: { area?: string; json?: boolean }) => {
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
      const paths = services.workspace.getPaths(root);

      const { topics, errors } = await services.topicMemory.listAll(paths);
      const filtered = opts.area !== undefined
        ? topics.filter((t) => t.frontmatter.area === opts.area)
        : topics;

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          count: filtered.length,
          topics: filtered.map((t) => ({
            slug: t.frontmatter.topic_slug,
            area: t.frontmatter.area ?? null,
            status: t.frontmatter.status,
            last_refreshed: t.frontmatter.last_refreshed,
            sources: t.frontmatter.sources_integrated.length,
          })),
          errors,
        }, null, 2));
        return;
      }

      header(opts.area !== undefined ? `Topics — ${opts.area}` : 'Topics');
      if (filtered.length === 0) {
        if (opts.area !== undefined) {
          info(`No topic pages tagged to area "${opts.area}".`);
        } else {
          info('No topic pages yet.');
          console.log(chalk.dim('  Topics are materialized by `arete meeting apply` or `arete topic refresh`.'));
        }
        if (errors.length > 0) {
          console.log('');
          warn(`${errors.length} topic file(s) could not be parsed — run \`arete topic lint\``);
        }
        return;
      }

      console.log('');
      console.log(chalk.dim('  Slug                         Area              Status       Last refreshed  Sources'));
      console.log(chalk.dim('  ' + '-'.repeat(90)));
      const sorted = [...filtered].sort((a, b) =>
        a.frontmatter.topic_slug < b.frontmatter.topic_slug ? -1 : 1,
      );
      for (const t of sorted) {
        const slug = (t.frontmatter.topic_slug + ' ').slice(0, 30).padEnd(30);
        const area = ((t.frontmatter.area ?? '—') + ' ').slice(0, 18).padEnd(18);
        const status = t.frontmatter.status.padEnd(12);
        const lastRef = t.frontmatter.last_refreshed.padEnd(16);
        const sources = String(t.frontmatter.sources_integrated.length);
        console.log(`  ${slug} ${area} ${status} ${lastRef} ${sources}`);
      }
      console.log('');
      listItem('Total', String(filtered.length));
      if (errors.length > 0) {
        warn(`${errors.length} topic file(s) could not be parsed — run \`arete topic lint\``);
      }
      console.log('');
    });

  // ---------------------------------------------------------------------------
  // arete topic show <slug>
  // ---------------------------------------------------------------------------
  topicCmd
    .command('show <slug>')
    .description('Print a topic page')
    .option('--json', 'Output as JSON (frontmatter + sections)')
    .action(async (slug: string, opts: { json?: boolean }) => {
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
      const paths = services.workspace.getPaths(root);

      const { topics } = await services.topicMemory.listAll(paths);
      const match = topics.find((t) => t.frontmatter.topic_slug === slug);
      if (!match) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Topic "${slug}" not found` }));
        } else {
          error(`Topic "${slug}" not found`);
          info('Run `arete topic list` to see available topics.');
        }
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          topic: match,
        }, null, 2));
        return;
      }

      console.log(renderTopicPage(match));
    });

  // ---------------------------------------------------------------------------
  // arete topic refresh [slug]
  // ---------------------------------------------------------------------------
  topicCmd
    .command('refresh [slug]')
    .description('Refresh a topic page by re-integrating all source meetings')
    .option('--all', 'Refresh every topic (otherwise slug is required)')
    .option('--dry-run', 'Preview what would be refreshed; no LLM calls, no writes')
    .option('--allow-no-llm', 'Write Source trail only when no AI is configured (default: abort)')
    .option('--json', 'Output as JSON')
    .action(async (
      slug: string | undefined,
      opts: { all?: boolean; dryRun?: boolean; allowNoLlm?: boolean; json?: boolean },
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
      const paths = services.workspace.getPaths(root);

      if (!slug && !opts.all) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Specify a slug or --all' }));
        } else {
          error('Specify a topic slug or pass --all.');
          info('e.g., `arete topic refresh cover-whale-templates`');
        }
        process.exit(1);
      }

      const callLLM = services.ai.isConfigured()
        ? async (prompt: string) => {
            const result = await services.ai.call('synthesis', prompt);
            return result.text;
          }
        : undefined;

      if (callLLM === undefined && !opts.allowNoLlm && !opts.dryRun) {
        if (opts.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'AI not configured — pass --allow-no-llm to write source trails only',
          }));
        } else {
          error('AI not configured. Topic refresh requires an LLM for narrative synthesis.');
          info('Pass --allow-no-llm to write Source trail entries only (no narrative).');
        }
        process.exit(1);
      }

      // Load existing topics
      const { topics: existing } = await services.topicMemory.listAll(paths);
      const existingBySlug = new Map<string, TopicPage>(
        existing.map((t) => [t.frontmatter.topic_slug, t]),
      );

      // Determine target slugs
      const targetSlugs: string[] = [];
      if (opts.all) {
        for (const t of existing) targetSlugs.push(t.frontmatter.topic_slug);
      } else if (slug !== undefined) {
        targetSlugs.push(slug);
      }

      if (targetSlugs.length === 0) {
        if (opts.json) {
          console.log(JSON.stringify({ success: true, refreshed: [], message: 'No topics to refresh' }));
        } else {
          info('No topics to refresh.');
        }
        return;
      }

      // For each target, find meetings that tag it and integrate one at a time
      const meetingsDir = join(paths.resources, 'meetings');
      const meetingFiles = (await services.storage.exists(meetingsDir))
        ? await services.storage.list(meetingsDir, { extensions: ['.md'] })
        : [];

      const perTopic: Array<{
        slug: string;
        integrated: number;
        fallback: number;
        skipped: number;
        status: 'ok' | 'no-sources';
      }> = [];

      for (const targetSlug of targetSlugs) {
        let page = existingBySlug.get(targetSlug) ?? null;
        let integrated = 0;
        let fallback = 0;
        let skipped = 0;

        // Find meetings that tag this slug in frontmatter
        const matching: Array<{ path: string; date: string; content: string }> = [];
        for (const meetingPath of meetingFiles) {
          const fileName = basename(meetingPath);
          const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
          if (!dateMatch) continue;
          const content = await services.storage.read(meetingPath);
          if (content === null) continue;
          const parsed = parseMeetingFile(content);
          if (!parsed) continue;
          const meetingTopics = parsed.frontmatter.topics;
          if (!Array.isArray(meetingTopics) || !meetingTopics.includes(targetSlug)) continue;
          matching.push({ path: meetingPath, date: dateMatch[1], content });
        }

        matching.sort((a, b) => a.date.localeCompare(b.date));

        if (matching.length === 0) {
          perTopic.push({ slug: targetSlug, integrated: 0, fallback: 0, skipped: 0, status: 'no-sources' });
          continue;
        }

        if (opts.dryRun) {
          // Dry run: don't spend LLM; just report which meetings would be integrated
          for (const src of matching) {
            const srcHash = hashSource(src.content);
            const already = page?.frontmatter.sources_integrated.some((s) => s.hash === srcHash) ?? false;
            if (already) skipped++;
            else integrated++;
          }
          perTopic.push({ slug: targetSlug, integrated, fallback, skipped, status: 'ok' });
          continue;
        }

        // Real run
        for (const src of matching) {
          const result = await services.topicMemory.integrateSource(
            targetSlug,
            page,
            src,
            { today: today(), callLLM },
          );
          if (result.decision === 'integrated') integrated++;
          else if (result.decision === 'fallback') fallback++;
          else if (result.decision === 'skipped-already-integrated') skipped++;
          page = result.page;
        }

        // Write the final page
        if (page !== null) {
          const outPath = join(paths.memory, 'topics', `${targetSlug}.md`);
          await services.storage.mkdir(join(paths.memory, 'topics'));
          if (services.storage.writeIfChanged !== undefined) {
            await services.storage.writeIfChanged(outPath, renderTopicPage(page));
          } else {
            await services.storage.write(outPath, renderTopicPage(page));
          }
        }

        perTopic.push({ slug: targetSlug, integrated, fallback, skipped, status: 'ok' });
      }

      // Log event (best-effort)
      if (!opts.dryRun) {
        try {
          await services.memoryLog.append(paths, {
            event: 'refresh',
            fields: {
              scope: opts.all ? 'topic_all' : 'topic_one',
              targets: String(targetSlugs.length),
              integrated: String(perTopic.reduce((s, t) => s + t.integrated, 0)),
              fallback: String(perTopic.reduce((s, t) => s + t.fallback, 0)),
            },
          });
        } catch {
          // best-effort
        }
      }

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          dryRun: Boolean(opts.dryRun),
          topics: perTopic,
        }, null, 2));
        return;
      }

      header(opts.dryRun ? 'Topic Refresh (dry run)' : 'Topic Refresh');
      for (const t of perTopic) {
        if (t.status === 'no-sources') {
          info(`${t.slug}: no meetings tag this topic yet`);
          continue;
        }
        const parts = [];
        if (t.integrated > 0) parts.push(chalk.green(`${t.integrated} integrated`));
        if (t.fallback > 0) parts.push(chalk.yellow(`${t.fallback} fallback`));
        if (t.skipped > 0) parts.push(chalk.dim(`${t.skipped} skipped`));
        console.log(`  ${t.slug}: ${parts.join(', ')}`);
      }
      if (!opts.dryRun) {
        const totalIntegrated = perTopic.reduce((s, t) => s + t.integrated, 0);
        if (totalIntegrated > 0) {
          success(`Refreshed ${perTopic.length} topic(s), ${totalIntegrated} sources integrated.`);
        }
      }
    });

  // ---------------------------------------------------------------------------
  // arete topic lint
  // ---------------------------------------------------------------------------
  topicCmd
    .command('lint')
    .description('Flag stale, stub, and orphan topic pages')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
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
      const paths = services.workspace.getPaths(root);

      const { topics, errors: parseErrors } = await services.topicMemory.listAll(paths);

      // Find inbound wikilink references across all topic pages — orphan
      // detection treats a topic with zero inbound references as an orphan.
      const refRe = /\[\[([a-z0-9-]+)\]\]/g;
      const referenced = new Set<string>();
      for (const t of topics) {
        const body = Object.values(t.sections).join('\n');
        let m: RegExpExecArray | null;
        while ((m = refRe.exec(body)) !== null) {
          referenced.add(m[1]);
        }
      }

      const stale: string[] = [];
      const stub: string[] = [];
      const orphan: string[] = [];
      const dangling: Array<{ fromSlug: string; toSlug: string }> = [];

      const allSlugs = new Set(topics.map((t) => t.frontmatter.topic_slug));

      for (const t of topics) {
        const slug = t.frontmatter.topic_slug;
        if (daysSince(t.frontmatter.last_refreshed) > STALE_DAYS) {
          stale.push(slug);
        }
        const current = t.sections['Current state'];
        if (current === undefined || current.trim().length === 0) {
          stub.push(slug);
        }
        if (!referenced.has(slug)) {
          orphan.push(slug);
        }
        // dangling: refs from this topic that point to non-existent slugs
        const body = Object.values(t.sections).join('\n');
        let m: RegExpExecArray | null;
        const re = /\[\[([a-z0-9-]+)\]\]/g;
        while ((m = re.exec(body)) !== null) {
          const target = m[1];
          if (!allSlugs.has(target)) {
            // Skip refs to people (convention: people slugs are two-word; skip is imperfect)
            // For now, flag all non-topic refs as potential dangling topic refs.
            // User review handles false positives on people links.
            dangling.push({ fromSlug: slug, toSlug: target });
          }
        }
      }

      const findings = {
        stale,
        stub,
        orphan,
        dangling,
        parse_errors: parseErrors.map((e) => ({ path: e.path, reason: e.reason })),
      };
      const totalFindings =
        stale.length + stub.length + orphan.length + dangling.length + parseErrors.length;

      // Log event
      try {
        await services.memoryLog.append(paths, {
          event: 'lint',
          fields: {
            findings: String(totalFindings),
            stale: String(stale.length),
            stub: String(stub.length),
            orphan: String(orphan.length),
            dangling: String(dangling.length),
          },
        });
      } catch {
        // best-effort
      }

      if (opts.json) {
        console.log(JSON.stringify({ success: true, findings, total: totalFindings }, null, 2));
        return;
      }

      header('Topic Lint');
      if (totalFindings === 0) {
        success('No findings.');
        return;
      }
      if (stale.length > 0) {
        warn(`Stale (not refreshed in >${STALE_DAYS}d): ${stale.length}`);
        for (const s of stale) console.log(`  - ${s}`);
      }
      if (stub.length > 0) {
        warn(`Stub (empty or missing Current state): ${stub.length}`);
        for (const s of stub) console.log(`  - ${s}`);
      }
      if (orphan.length > 0) {
        warn(`Orphan (no inbound [[refs]]): ${orphan.length}`);
        for (const s of orphan) console.log(`  - ${s}`);
      }
      if (dangling.length > 0) {
        warn(`Dangling refs (wikilink → missing topic or person): ${dangling.length}`);
        for (const d of dangling) console.log(`  - [[${d.toSlug}]] from ${d.fromSlug}`);
      }
      if (parseErrors.length > 0) {
        error(`Parse errors: ${parseErrors.length}`);
        for (const e of parseErrors) console.log(`  - ${e.path}: ${e.reason}`);
      }
      console.log('');
      listItem('Total findings', String(totalFindings));
    });
}
