/**
 * arete meeting commands — add and process meetings
 */

import {
  createServices,
  loadConfig,
  saveMeetingFile,
  meetingFilename,
  slugifyPersonName,
  PEOPLE_CATEGORIES,
  refreshQmdIndex,
  extractMeetingIntelligence,
  formatStagedSections,
  updateMeetingContent,
  processMeetingExtraction,
  extractUserNotes,
  parseStagedSections,
  parseStagedItemStatus,
  writeItemStatusToFile,
  commitApprovedItems,
  clearApprovedSections,
  formatFilteredStagedSections,
} from '@arete/core';
import type {
  MeetingForSave,
  PersonCategory,
  QmdRefreshResult,
  MeetingLLMCallFn,
  MeetingExtractionResult,
  FilteredItem,
  StagedItemStatus,
} from '@arete/core';
import type { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import chalk from 'chalk';
import { success, error, info, warn, listItem } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';

type AttendeeCandidate = {
  name?: string;
  email?: string | null;
  text?: string;
  source: string;
};

const DEFAULT_TEMPLATE = `# {title}
**Date**: {date}
**Duration**: {duration}
**Source**: {integration}

## Summary
{summary}

## Key Points
{key_points}

## Action Items
{action_items}

## Transcript
{transcript}
`;

export function registerMeetingCommands(program: Command): void {
  const meetingCmd = program.command('meeting').description('Add meetings');

  meetingCmd
    .command('add')
    .description('Add a meeting from JSON file or stdin')
    .option('--file <path>', 'Path to JSON file')
    .option('--stdin', 'Read JSON from stdin')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .action(
      async (opts: { file?: string; stdin?: boolean; skipQmd?: boolean; json?: boolean }) => {
        if (!opts.file && !opts.stdin) {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: 'Provide --file <path> or --stdin',
              }),
            );
          } else {
            error('Provide --file <path> or --stdin');
            info('Example: arete meeting add --file meeting.json');
          }
          process.exit(1);
        }

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

        const config = await loadConfig(services.storage, root);

        let raw: Record<string, unknown>;
        try {
          if (opts.stdin) {
            const chunks: Buffer[] = [];
            for await (const chunk of process.stdin) {
              chunks.push(chunk as Buffer);
            }
            raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } else if (opts.file) {
            raw = JSON.parse(readFileSync(opts.file, 'utf8'));
          } else {
            throw new Error('No input');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: `Invalid JSON: ${msg}` }));
          } else {
            error(`Invalid JSON: ${msg}`);
          }
          process.exit(1);
        }

        const meeting = normalizeMeetingInput(raw);
        const paths = services.workspace.getPaths(root);
        const outputDir = join(paths.resources, 'meetings');

        const fullPath = await saveMeetingFile(
          services.storage,
          meeting,
          outputDir,
          DEFAULT_TEMPLATE,
          { integration: 'Manual', force: false },
        );

        // Auto-refresh qmd index after write (skip if meeting already existed or --skip-qmd)
        let qmdResult: QmdRefreshResult | undefined;
        if (fullPath !== null && !opts.skipQmd) {
          qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }

        if (opts.json) {
          console.log(
            JSON.stringify({
              success: !!fullPath,
              saved: !!fullPath,
              path: fullPath,
              filename: fullPath ? meetingFilename(meeting) : null,
              qmd: qmdResult ?? { indexed: false, skipped: true },
            }),
          );
          return;
        }

        if (fullPath) {
          success(`Saved: ${fullPath}`);
        } else {
          info(`Skipped (already exists): ${meetingFilename(meeting)}`);
        }
        displayQmdResult(qmdResult);
      },
    );

  meetingCmd
    .command('process')
    .description('Process a meeting file with People Intelligence classification')
    .option('--file <path>', 'Path to meeting markdown file (relative to workspace or absolute)')
    .option('--latest', 'Process latest meeting in resources/meetings')
    .option('--threshold <n>', 'Confidence threshold override (default from policy or 0.65)')
    .option('--feature-extraction-tuning', 'Enable extraction tuning for this run')
    .option('--feature-enrichment', 'Enable optional enrichment for this run')
    .option('--dry-run', 'Analyze only; do not write people files or attendee_ids')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .action(async (opts: {
      file?: string;
      latest?: boolean;
      threshold?: string;
      featureExtractionTuning?: boolean;
      featureEnrichment?: boolean;
      dryRun?: boolean;
      skipQmd?: boolean;
      json?: boolean;
    }) => {
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

      const config = await loadConfig(services.storage, root);

      if (!opts.file && !opts.latest) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Provide --file <path> or --latest' }));
        } else {
          error('Provide --file <path> or --latest');
        }
        process.exit(1);
      }

      const paths = services.workspace.getPaths(root);
      const meetingPath = await resolveMeetingPath(
        services,
        paths.resources,
        root,
        opts.file,
        Boolean(opts.latest),
      );

      if (!meetingPath) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'No meeting file found to process' }));
        } else {
          error('No meeting file found to process');
        }
        process.exit(1);
      }

      const content = await services.storage.read(meetingPath);
      if (!content) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Meeting not found: ${meetingPath}` }));
        } else {
          error(`Meeting not found: ${meetingPath}`);
        }
        process.exit(1);
      }

      const attendees = extractAttendeesFromMeeting(content, meetingPath, root);
      if (attendees.length === 0) {
        if (opts.json) {
          console.log(JSON.stringify({ success: true, meeting: meetingPath, candidates: 0, message: 'No attendees detected' }));
        } else {
          warn('No attendees detected in meeting content.');
        }
        return;
      }

      const thresholdRaw = opts.threshold ? Number(opts.threshold) : undefined;
      const confidenceThreshold =
        typeof thresholdRaw === 'number' && Number.isFinite(thresholdRaw)
          ? thresholdRaw
          : undefined;

      const digest = await services.entity.suggestPeopleIntelligence(
        attendees.map((candidate) => ({
          name: candidate.name,
          email: candidate.email ?? null,
          text: candidate.text ?? null,
          source: candidate.source,
        })),
        paths,
        {
          confidenceThreshold,
          features: {
            enableExtractionTuning: Boolean(opts.featureExtractionTuning),
            enableEnrichment: Boolean(opts.featureEnrichment),
          },
        },
      );

      const dryRun = Boolean(opts.dryRun);
      const applied: Array<{ slug: string; category: PersonCategory }> = [];
      const unknownQueue = digest.suggestions.filter((s) => s.recommendation.category === 'unknown_queue');

      if (!dryRun) {
        for (const suggestion of digest.suggestions) {
          const category = suggestion.recommendation.category;
          if (category === 'unknown_queue') continue;

          const name = suggestion.candidate.name?.trim();
          if (!name) continue;

          const slug = slugifyPersonName(name);
          const personPath = join(paths.people, category, `${slug}.md`);
          const exists = await services.storage.exists(personPath);

          if (!exists) {
            const frontmatter = [
              '---',
              `name: "${name.replace(/"/g, '\\"')}"`,
              `category: "${category}"`,
              suggestion.candidate.email ? `email: "${suggestion.candidate.email}"` : null,
              suggestion.candidate.company ? `company: "${suggestion.candidate.company}"` : null,
              '---',
              '',
              `# ${name}`,
              '',
              `- Created from meeting process on ${new Date().toISOString().slice(0, 10)}`,
              '',
            ].filter((line): line is string => line != null).join('\n');
            await services.storage.write(personPath, frontmatter);
          }

          applied.push({ slug, category });
        }

        const attendeeIds = [...new Set(applied.map((p) => p.slug))];
        if (attendeeIds.length > 0) {
          const updatedMeeting = upsertAttendeeIds(content, attendeeIds);
          if (updatedMeeting !== content) {
            await services.storage.write(meetingPath, updatedMeeting);
          }
        }

        if (applied.length > 0) {
          await services.entity.buildPeopleIndex(paths);
        }
      }

      // Auto-refresh qmd index after write (skip if nothing written or dry-run or --skip-qmd)
      let qmdResult: QmdRefreshResult | undefined;
      if (applied.length > 0 && !opts.skipQmd) {
        qmdResult = await refreshQmdIndex(root, config.qmd_collection);
      }

      const response = {
        success: true,
        meeting: meetingPath,
        candidates: attendees.length,
        digest,
        dryRun,
        applied,
        unknownQueue: unknownQueue.map((u) => ({
          name: u.candidate.name ?? null,
          confidence: u.confidence,
          rationale: u.rationale,
        })),
        qmd: qmdResult ?? { indexed: false, skipped: true },
      };

      if (opts.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      success(`Processed meeting: ${meetingPath}`);
      info(`Candidates: ${attendees.length}`);
      info(`Applied: ${applied.length}`);
      info(`Unknown queue: ${unknownQueue.length}`);
      if (unknownQueue.length > 0) {
        warn('Some attendees remain in unknown_queue and require review.');
      }
      displayQmdResult(qmdResult);
    });

  // Extract subcommand - uses AIService for LLM-based extraction
  meetingCmd
    .command('extract <file>')
    .description('Extract intelligence from a meeting transcript using AI')
    .option('--json', 'Output as JSON')
    .option('--stage', 'Write staged sections to the meeting file')
    .option('--dry-run', 'Show what would be written without writing')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--clear-approved', 'Clear approved sections before re-extracting (requires --stage)')
    .action(async (file: string, opts: {
      json?: boolean;
      stage?: boolean;
      dryRun?: boolean;
      skipQmd?: boolean;
      clearApproved?: boolean;
    }) => {
      const services = await createServices(process.cwd());

      // Early check: --clear-approved requires --stage
      if (opts.clearApproved && !opts.stage) {
        if (opts.json) {
          console.log(JSON.stringify({
            success: false,
            error: '--clear-approved requires --stage',
          }));
        } else {
          error('--clear-approved requires --stage');
        }
        process.exit(1);
      }

      // Early check: is AI configured?
      if (!services.ai.isConfigured()) {
        if (opts.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'No AI provider configured. Run `arete credentials configure` or set up via arete.yaml.',
          }));
        } else {
          error('No AI provider configured. Run `arete credentials configure` or set up via arete.yaml.');
        }
        process.exit(1);
      }

      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
        }
        process.exit(1);
      }

      const config = await loadConfig(services.storage, root);
      const paths = services.workspace.getPaths(root);

      // Resolve file path
      const meetingPath = file.startsWith('/') ? file : join(root, file);

      // Read meeting content
      const content = await services.storage.read(meetingPath);
      if (!content) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Meeting file not found: ${file}` }));
        } else {
          error(`Meeting file not found: ${file}`);
        }
        process.exit(1);
      }

      // Extract transcript/body for analysis
      let { frontmatter, body } = extractFrontmatter(content);

      // Handle --clear-approved: clear approved sections and metadata before re-extraction
      if (opts.clearApproved && opts.stage) {
        // Clear approved sections from body (using backend's pattern)
        body = clearApprovedSections(body);

        // Delete approved metadata from frontmatter
        delete frontmatter['approved_items'];
        delete frontmatter['approved_at'];
        delete frontmatter['status'];

        // Write the cleared file
        const clearedFile = `---\n${stringifyYaml(frontmatter)}---\n\n${body}`;
        await services.storage.write(meetingPath, clearedFile);
      }

      const transcript = body.trim();

      if (!transcript) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Meeting file has no content to extract from' }));
        } else {
          error('Meeting file has no content to extract from');
        }
        process.exit(1);
      }

      // Get attendees from frontmatter if available
      const attendees: string[] = [];
      if (Array.isArray(frontmatter.attendees)) {
        for (const a of frontmatter.attendees) {
          if (typeof a === 'string') {
            const parsed = parseAttendeeToken(a);
            if (parsed.name) attendees.push(parsed.name);
          }
        }
      }

      // Create LLM call wrapper using AIService
      const callLLM: MeetingLLMCallFn = async (prompt: string) => {
        const result = await services.ai.call('extraction', prompt);
        return result.text;
      };

      // Extract intelligence
      let extractionResult: MeetingExtractionResult;
      try {
        extractionResult = await extractMeetingIntelligence(transcript, callLLM, {
          attendees: attendees.length > 0 ? attendees : undefined,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Extraction failed: ${msg}` }));
        } else {
          error(`Extraction failed: ${msg}`);
        }
        process.exit(1);
      }

      // Handle --stage (write to file with full metadata)
      let qmdResult: QmdRefreshResult | undefined;
      const dryRun = Boolean(opts.dryRun);
      const shouldStage = Boolean(opts.stage);

      // For --stage: process extraction to get filtered items and metadata
      let stagedSections: string;
      if (shouldStage) {
        // Extract user notes and process extraction (filtering, dedup, metadata)
        const userNotes = extractUserNotes(body);
        const processed = processMeetingExtraction(extractionResult, userNotes);

        // Format body sections from filtered items (IDs in body match IDs in metadata)
        stagedSections = formatFilteredStagedSections(
          processed.filteredItems,
          extractionResult.intelligence.summary,
        );

        if (!dryRun) {
          // Clone frontmatter before mutating (pre-mortem mitigation: caching/mutation)
          const fm = { ...frontmatter };

          // Write full metadata (snake_case keys)
          fm['status'] = 'processed';
          fm['processed_at'] = new Date().toISOString();
          fm['staged_item_source'] = processed.stagedItemSource;
          fm['staged_item_confidence'] = processed.stagedItemConfidence;
          fm['staged_item_status'] = processed.stagedItemStatus;
          if (Object.keys(processed.stagedItemOwner).length > 0) {
            fm['staged_item_owner'] = processed.stagedItemOwner;
          }

          // Update body with staged sections
          const updatedBody = updateMeetingContent(body, stagedSections);

          // Reconstruct file: frontmatter + body
          const updatedFile = `---\n${stringifyYaml(fm)}---\n\n${updatedBody}`;
          await services.storage.write(meetingPath, updatedFile);

          // Refresh qmd index unless --skip-qmd
          if (!opts.skipQmd) {
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
          }
        }
      } else {
        // Non-stage mode: just format for display (uses raw extraction, no metadata)
        stagedSections = formatStagedSections(extractionResult);
      }

      // Build response
      const response = {
        success: true,
        file: meetingPath,
        intelligence: extractionResult.intelligence,
        validationWarnings: extractionResult.validationWarnings,
        staged: shouldStage,
        dryRun,
        qmd: qmdResult ?? { indexed: false, skipped: true },
      };

      if (opts.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      // Human-readable output
      if (shouldStage && dryRun) {
        info('Dry run — would write the following staged sections:');
        console.log('');
        console.log(stagedSections);
        return;
      }

      if (shouldStage) {
        success(`Staged sections written to: ${meetingPath}`);
        displayQmdResult(qmdResult);
        return;
      }

      // Default: output formatted extraction
      const { intelligence } = extractionResult;

      console.log('');
      console.log(chalk.bold('Summary'));
      console.log(chalk.dim('─'.repeat(40)));
      console.log(intelligence.summary);
      console.log('');

      if (intelligence.actionItems.length > 0) {
        console.log(chalk.bold('Action Items'));
        console.log(chalk.dim('─'.repeat(40)));
        for (const item of intelligence.actionItems) {
          const arrow = item.direction === 'i_owe_them' ? '→' : '←';
          const counterparty = item.counterpartySlug ? ` @${item.counterpartySlug}` : '';
          const due = item.due ? chalk.dim(` (${item.due})`) : '';
          console.log(`  • [@${item.ownerSlug} ${arrow}${counterparty}] ${item.description}${due}`);
        }
        console.log('');
      }

      if (intelligence.decisions.length > 0) {
        console.log(chalk.bold('Decisions'));
        console.log(chalk.dim('─'.repeat(40)));
        for (const decision of intelligence.decisions) {
          console.log(`  • ${decision}`);
        }
        console.log('');
      }

      if (intelligence.learnings.length > 0) {
        console.log(chalk.bold('Learnings'));
        console.log(chalk.dim('─'.repeat(40)));
        for (const learning of intelligence.learnings) {
          console.log(`  • ${learning}`);
        }
        console.log('');
      }

      if (extractionResult.validationWarnings.length > 0) {
        warn(`${extractionResult.validationWarnings.length} items rejected during validation`);
      }
    });

  // Approve subcommand - commit staged items to memory
  meetingCmd
    .command('approve <slug>')
    .description('Commit approved staged items to memory files')
    .option('--all', 'Mark all pending items as approved before committing')
    .option('--items <ids>', 'Comma-separated item IDs to mark as approved (e.g., ai_001,de_001)')
    .option('--skip <ids>', 'Comma-separated item IDs to mark as skipped (won\'t be committed)')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .action(async (slug: string, opts: {
      all?: boolean;
      items?: string;
      skip?: string;
      skipQmd?: boolean;
      json?: boolean;
    }) => {
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

      const config = await loadConfig(services.storage, root);
      const paths = services.workspace.getPaths(root);

      // Resolve meeting file path from slug
      const meetingPath = join(paths.resources, 'meetings', `${slug}.md`);
      const content = await services.storage.read(meetingPath);

      if (!content) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Meeting not found: ${slug}` }));
        } else {
          error(`Meeting not found: ${slug}`);
        }
        process.exit(1);
      }

      // Parse frontmatter to check status
      const { frontmatter, body } = extractFrontmatter(content);
      const status = frontmatter['status'] as string | undefined;

      // Error if already approved
      if (status === 'approved') {
        if (opts.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'Meeting already approved',
            hint: 'This meeting has already been approved. Use `arete meeting extract --stage` to reprocess if needed.',
          }));
        } else {
          error('Meeting already approved');
          info('This meeting has already been approved. Use `arete meeting extract --stage` to reprocess if needed.');
        }
        process.exit(1);
      }

      // Error if not processed (no staged items)
      if (status !== 'processed') {
        if (opts.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'Meeting not processed',
            hint: 'Run `arete meeting extract <file> --stage` to process this meeting first.',
          }));
        } else {
          error('Meeting not processed');
          info('Run `arete meeting extract <file> --stage` to process this meeting first.');
        }
        process.exit(1);
      }

      // Parse staged sections and current status
      const stagedSections = parseStagedSections(body);
      const currentStatus = parseStagedItemStatus(content);
      const allItems = [
        ...stagedSections.actionItems,
        ...stagedSections.decisions,
        ...stagedSections.learnings,
      ];

      // Parse --items and --skip flags
      const itemsToApprove = opts.items ? opts.items.split(',').map((id) => id.trim()) : [];
      const itemsToSkip = opts.skip ? opts.skip.split(',').map((id) => id.trim()) : [];

      // Handle --all: mark all pending items as approved
      if (opts.all) {
        for (const item of allItems) {
          const existingStatus = currentStatus[item.id];
          if (!existingStatus || existingStatus === 'pending') {
            await writeItemStatusToFile(services.storage, meetingPath, item.id, { status: 'approved' });
          }
        }
      }

      // Handle --items: mark specific IDs as approved
      for (const itemId of itemsToApprove) {
        const exists = allItems.some((item) => item.id === itemId);
        if (!exists) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: `Item not found: ${itemId}` }));
          } else {
            error(`Item not found: ${itemId}`);
          }
          process.exit(1);
        }
        await writeItemStatusToFile(services.storage, meetingPath, itemId, { status: 'approved' });
      }

      // Handle --skip: mark specific IDs as skipped
      for (const itemId of itemsToSkip) {
        const exists = allItems.some((item) => item.id === itemId);
        if (!exists) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: `Item not found: ${itemId}` }));
          } else {
            error(`Item not found: ${itemId}`);
          }
          process.exit(1);
        }
        await writeItemStatusToFile(services.storage, meetingPath, itemId, { status: 'skipped' });
      }

      // Re-read to get updated status after flag processing
      const updatedContent = await services.storage.read(meetingPath);
      if (!updatedContent) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Failed to read updated meeting file' }));
        } else {
          error('Failed to read updated meeting file');
        }
        process.exit(1);
      }
      const finalStatus = parseStagedItemStatus(updatedContent);

      // Count approved items
      const approvedIds = Object.entries(finalStatus)
        .filter(([, s]) => s === 'approved')
        .map(([id]) => id);

      // Error if no approved items (and not using --all or --items)
      if (approvedIds.length === 0) {
        if (opts.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'No items approved',
            hint: 'Use --all to approve all items, or --items <id1,id2,...> to approve specific items.',
          }));
        } else {
          error('No items approved');
          info('Use --all to approve all items, or --items <id1,id2,...> to approve specific items.');
        }
        process.exit(1);
      }

      // Commit approved items
      const memoryDir = join(root, '.arete', 'memory', 'items');
      await commitApprovedItems(services.storage, meetingPath, memoryDir);

      // Refresh QMD index unless --skip-qmd
      let qmdResult: QmdRefreshResult | undefined;
      if (!opts.skipQmd) {
        qmdResult = await refreshQmdIndex(root, config.qmd_collection);
      }

      // Read final meeting state for response
      const finalContent = await services.storage.read(meetingPath);
      const { frontmatter: finalFm } = extractFrontmatter(finalContent ?? '');

      // Build response
      const approvedItems = finalFm['approved_items'] as {
        actionItems?: string[];
        decisions?: string[];
        learnings?: string[];
      } | undefined;

      const response = {
        success: true,
        slug,
        approvedItems: {
          actionItems: approvedItems?.actionItems ?? [],
          decisions: approvedItems?.decisions ?? [],
          learnings: approvedItems?.learnings ?? [],
        },
        memoryUpdated: {
          decisions: (approvedItems?.decisions?.length ?? 0) > 0,
          learnings: (approvedItems?.learnings?.length ?? 0) > 0,
        },
        qmd: qmdResult ?? { indexed: false, skipped: true },
      };

      if (opts.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      // Human-readable output
      success(`Meeting approved: ${slug}`);

      const actionCount = approvedItems?.actionItems?.length ?? 0;
      const decisionCount = approvedItems?.decisions?.length ?? 0;
      const learningCount = approvedItems?.learnings?.length ?? 0;

      if (actionCount > 0) {
        listItem('Action items', `${actionCount}`);
      }
      if (decisionCount > 0) {
        listItem('Decisions', `${decisionCount} (written to memory)`);
      }
      if (learningCount > 0) {
        listItem('Learnings', `${learningCount} (written to memory)`);
      }

      displayQmdResult(qmdResult);
    });
}

async function resolveMeetingPath(
  services: Awaited<ReturnType<typeof createServices>>,
  resourcesPath: string,
  root: string,
  file: string | undefined,
  latest: boolean,
): Promise<string | null> {
  if (file) {
    return file.startsWith('/') ? file : join(root, file);
  }

  if (!latest) return null;
  const meetingsDir = join(resourcesPath, 'meetings');
  const files = await services.storage.list(meetingsDir, { extensions: ['.md'] });
  const filtered = files
    .filter((path) => !path.endsWith('/index.md') && !path.endsWith('index.md'))
    .sort((a, b) => b.localeCompare(a));
  return filtered[0] ?? null;
}

function extractFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  try {
    const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
    return { frontmatter, body: match[2] };
  } catch {
    return { frontmatter: {}, body: content };
  }
}

function parseAttendeeToken(token: string): { name?: string; email?: string | null } {
  const trimmed = token.trim();
  if (!trimmed) return {};

  const angleMatch = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (angleMatch) {
    return {
      name: angleMatch[1].trim(),
      email: angleMatch[2].trim().toLowerCase(),
    };
  }

  const emailOnly = trimmed.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  if (emailOnly) {
    return {
      name: trimmed.split('@')[0].replace(/[._-]/g, ' '),
      email: trimmed.toLowerCase(),
    };
  }

  return { name: trimmed, email: null };
}

function dedupeCandidates(candidates: AttendeeCandidate[]): AttendeeCandidate[] {
  const seen = new Set<string>();
  const unique: AttendeeCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.email?.toLowerCase() ?? ''}|${candidate.name?.toLowerCase() ?? ''}`;
    if (!candidate.name && !candidate.email) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}

function extractAttendeesFromMeeting(
  content: string,
  sourcePath: string,
  root: string,
): AttendeeCandidate[] {
  const { frontmatter, body } = extractFrontmatter(content);
  const candidates: AttendeeCandidate[] = [];

  const attendees = frontmatter.attendees;
  if (Array.isArray(attendees)) {
    for (const attendee of attendees) {
      if (typeof attendee === 'string') {
        const parsed = parseAttendeeToken(attendee);
        candidates.push({ ...parsed, source: relativePath(sourcePath, root), text: body.slice(0, 400) });
      }
    }
  } else if (typeof attendees === 'string') {
    for (const token of attendees.split(',')) {
      const parsed = parseAttendeeToken(token);
      candidates.push({ ...parsed, source: relativePath(sourcePath, root), text: body.slice(0, 400) });
    }
  }

  const attendeesLine = body.match(/\*\*Attendees\*\*:\s*(.+)$/im) || body.match(/^Attendees:\s*(.+)$/im);
  if (attendeesLine && attendeesLine[1]) {
    for (const token of attendeesLine[1].split(',')) {
      const parsed = parseAttendeeToken(token);
      candidates.push({ ...parsed, source: relativePath(sourcePath, root), text: body.slice(0, 400) });
    }
  }

  const speakerRegex = /\*\*(?:\[[^\]]+\]\s*)?([^*:\n]{2,80})\*\*:/g;
  let match: RegExpExecArray | null = null;
  while ((match = speakerRegex.exec(body)) !== null) {
    const speakerName = match[1].trim();
    if (/^(unknown|you|host|speaker|attendees|date|duration|source)$/i.test(speakerName)) continue;
    candidates.push({
      name: speakerName,
      email: null,
      source: relativePath(sourcePath, root),
      text: body.slice(Math.max(0, match.index - 120), Math.min(body.length, match.index + 220)),
    });
  }

  return dedupeCandidates(candidates);
}

function upsertAttendeeIds(content: string, attendeeIds: string[]): string {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    const frontmatter = stringifyYaml({ attendee_ids: attendeeIds }).trimEnd();
    return `---\n${frontmatter}\n---\n\n${content}`;
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = (parseYaml(match[1]) as Record<string, unknown>) ?? {};
  } catch {
    parsed = {};
  }

  parsed.attendee_ids = attendeeIds;
  const yaml = stringifyYaml(parsed).trimEnd();
  return `---\n${yaml}\n---\n\n${match[2]}`;
}

function relativePath(path: string, root: string): string {
  return path.startsWith(root) ? path.slice(root.length + 1) : path;
}

function normalizeMeetingInput(raw: Record<string, unknown>): MeetingForSave {
  const today = new Date().toISOString().slice(0, 10);
  const title = (raw.title as string)?.trim() || 'Untitled Meeting';
  const date = (raw.date as string)?.trim()?.slice(0, 10) || today;
  const summary = (raw.summary as string)?.trim() ?? '';
  const transcript = (raw.transcript as string)?.trim() ?? '';
  if (!summary && !transcript) {
    throw new Error('At least one of summary or transcript is required');
  }
  const actionItems = Array.isArray(raw.action_items)
    ? (raw.action_items as unknown[]).filter((a): a is string => typeof a === 'string')
    : [];
  const attendees = Array.isArray(raw.attendees)
    ? (raw.attendees as unknown[]).map((a): string | { name?: string | null; email?: string | null } =>
      typeof a === 'string'
        ? a
        : {
          name: (a as Record<string, unknown>).name as string | undefined,
          email: (a as Record<string, unknown>).email as string | undefined,
        },
    )
    : [];

  return {
    title,
    date,
    duration_minutes: (typeof raw.duration_minutes === 'number' ? raw.duration_minutes : 0) as number,
    summary: summary || 'No summary available.',
    transcript: transcript || 'No transcript available.',
    action_items: actionItems,
    highlights: [],
    attendees,
    url: (raw.url as string)?.trim() ?? '',
  };
}


