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
  parseStagedItemEdits,
  parseStagedItemOwner,
  writeItemStatusToFile,
  commitApprovedItems,
  clearApprovedSections,
  formatFilteredStagedSections,
  parseGoals,
  extractAttendeeSlugs,
  buildMeetingContext,
  applyMeetingIntelligence,
  generateMeetingManifest,
  getCompletedItems,
  getOpenTasks,
  calculateSpeakingRatio,
  inferUrgency,
  loadReconciliationContext,
  reconcileMeetingBatch,
  loadRecentMeetingBatch,
  batchLLMReview,
} from '@arete/core';
import type {
  MeetingForSave,
  PersonCategory,
  QmdRefreshResult,
  MeetingLLMCallFn,
  MeetingExtractionResult,
  FilteredItem,
  StagedItemStatus,
  MeetingContextBundle,
  MeetingIntelligence,
  ApplyMeetingResult,
  PriorItem,
  Importance,
  ExtractionMode,
  TaskDestination,
  MeetingExtractionBatch,
  ReconciliationResult,
  ReconciliationContext,
} from '@arete/core';
import { execSync } from 'child_process';
import type { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import chalk from 'chalk';
import { success, error, info, warn, listItem } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';
import type { StorageAdapter } from '@arete/core';
import { displayReconciliationDetails, displayReconciledCompletedItems } from '../lib/reconciliation-output.js';

/**
 * Format a person slug as a display name.
 * E.g., 'john-smith' → 'John Smith'
 */
function formatSlugAsName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Add an entry to the ## Waiting On section in week.md.
 * Creates the section if it doesn't exist.
 * 
 * Format: - [ ] Person Name: What they owe @person(slug) @from(commitment:hashPrefix)
 */
async function addWaitingOnEntry(
  storage: StorageAdapter,
  nowPath: string,
  personName: string,
  personSlug: string,
  text: string,
  commitmentHashPrefix: string,
): Promise<void> {
  const weekFile = join(nowPath, 'week.md');
  let content = await storage.read(weekFile);
  
  if (!content) {
    // File doesn't exist, create minimal structure
    content = `# Week\n\n## Waiting On\n`;
  }
  
  const entry = `- [ ] ${personName}: ${text} @person(${personSlug}) @from(commitment:${commitmentHashPrefix})`;
  
  // Find ## Waiting On section
  const waitingOnMatch = content.match(/^## Waiting On\s*$/m);
  
  if (waitingOnMatch) {
    // Section exists - insert entry after header
    const insertPos = (waitingOnMatch.index ?? 0) + waitingOnMatch[0].length;
    const before = content.slice(0, insertPos);
    const after = content.slice(insertPos);
    content = `${before}\n${entry}${after}`;
  } else {
    // Section doesn't exist - append it
    // Find a good place to insert (after Tasks section or at end)
    const tasksMatch = content.match(/^### Could complete[\s\S]*?(?=\n## |\n---|\z)/m);
    if (tasksMatch && tasksMatch.index !== undefined) {
      const insertPos = tasksMatch.index + tasksMatch[0].length;
      const before = content.slice(0, insertPos);
      const after = content.slice(insertPos);
      content = `${before}\n\n## Waiting On\n${entry}${after}`;
    } else {
      // Append at end
      content = content.trimEnd() + `\n\n## Waiting On\n${entry}\n`;
    }
  }
  
  await storage.write(weekFile, content);
}

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
    .option('--dry-run-topics', 'Run lexical topic detection only (no LLM call); print detected topics with scores + matched tokens for tuning')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--clear-approved', 'Clear approved sections before re-extracting (requires --stage)')
    .option('--clear', 'Alias for --clear-approved (requires --stage)')
    .option('--context <file>', 'Context bundle JSON file (use - for stdin)')
    .option('--prior-items <file>', 'Prior items JSON file for deduplication (use - for stdin)')
    .option('--importance <level>', 'Override importance level (skip, light, normal, important)')
    .option('--reconcile', 'Run cross-meeting reconciliation (dedup + relevance scoring)')
    .option('--reconcile-days <n>', 'Days of recent meetings to include (default: 7)', '7')
    .action(async (file: string, opts: {
      json?: boolean;
      stage?: boolean;
      dryRun?: boolean;
      dryRunTopics?: boolean;
      skipQmd?: boolean;
      clearApproved?: boolean;
      clear?: boolean;
      context?: string;
      priorItems?: string;
      importance?: string;
      reconcile?: boolean;
      reconcileDays?: string;
    }) => {
      // Merge --clear into --clear-approved
      if (opts.clear) opts.clearApproved = true;

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

      // Early check: stdin can only be consumed once
      if (opts.context === '-' && opts.priorItems === '-') {
        if (opts.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'Cannot read both --context and --prior-items from stdin',
          }));
        } else {
          error('Cannot read both --context and --prior-items from stdin');
        }
        process.exit(1);
      }

      // Early check: is AI configured?
      // --dry-run-topics skips the LLM entirely (lexical detection only),
      // so don't require an AI provider for that path.
      if (!opts.dryRunTopics && !services.ai.isConfigured()) {
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

      // (Fail-fast for --reconcile + missing standard tier is deferred until
      // after the importance-skip short-circuit below so `--importance skip`
      // can exit without paying any LLM cost even on misconfigured workspaces.)

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

      // --dry-run-topics: lexical topic detection only. Pre-mortem R2's
      // empirical-tuning lever — operator sees the score + matched
      // tokens for each detected topic so they can tune STOP_TOKENS and
      // the threshold constants without paying any LLM cost. Skips the
      // actual extraction call entirely.
      if (opts.dryRunTopics) {
        const { detectTopicsLexicalDetailed, TopicMemoryService } = await import('@arete/core');
        const { topics } = await services.topicMemory.listAll(paths);
        const identities = TopicMemoryService.toIdentities(topics);
        const detected = detectTopicsLexicalDetailed(transcript, identities);

        if (opts.json) {
          console.log(JSON.stringify({
            detectedTopics: detected.map((d) => ({
              slug: d.slug,
              score: d.score,
              nonStopMatches: d.nonStopMatches,
              stopMatches: d.stopMatches,
              lastRefreshed: d.lastRefreshed ?? null,
            })),
          }, null, 2));
        } else if (detected.length === 0) {
          info('Detected topics: (none)');
        } else {
          info('Detected topics:');
          detected.forEach((d, idx) => {
            console.log(`  ${idx + 1}. ${d.slug}`);
            console.log(`     Score: ${d.score.toFixed(2)}`);
            console.log(`     Non-stop matches: ${d.nonStopMatches.length > 0 ? d.nonStopMatches.join(', ') : '(none)'}`);
            console.log(`     Stop matches: ${d.stopMatches.length > 0 ? d.stopMatches.join(', ') : '(none)'}`);
            console.log(`     Last refreshed: ${d.lastRefreshed ?? '(unknown)'}`);
          });
        }
        return;
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

      // Parse context bundle if provided
      let contextBundle: MeetingContextBundle | undefined;
      if (opts.context) {
        try {
          let contextJson: string;
          if (opts.context === '-') {
            // Read from stdin
            const chunks: Buffer[] = [];
            for await (const chunk of process.stdin) {
              chunks.push(chunk as Buffer);
            }
            contextJson = Buffer.concat(chunks).toString('utf8');
          } else {
            // Read from file
            contextJson = readFileSync(opts.context, 'utf8');
          }
          const parsed = JSON.parse(contextJson) as Record<string, unknown>;
          // Handle wrapped format (success: true, ...) from `arete meeting context --json`
          if (parsed.success === true && parsed.meeting) {
            // Extract the bundle fields from the response
            contextBundle = {
              meeting: parsed.meeting as MeetingContextBundle['meeting'],
              agenda: (parsed.agenda ?? null) as MeetingContextBundle['agenda'],
              attendees: (parsed.attendees ?? []) as MeetingContextBundle['attendees'],
              unknownAttendees: (parsed.unknownAttendees ?? []) as MeetingContextBundle['unknownAttendees'],
              relatedContext: (parsed.relatedContext ?? { goals: [], projects: [], recentDecisions: [], recentLearnings: [] }) as MeetingContextBundle['relatedContext'],
              warnings: (parsed.warnings ?? []) as MeetingContextBundle['warnings'],
            };
          } else if (parsed.meeting && typeof parsed.meeting === 'object') {
            // Direct bundle format with required fields
            contextBundle = {
              meeting: parsed.meeting as MeetingContextBundle['meeting'],
              agenda: (parsed.agenda ?? null) as MeetingContextBundle['agenda'],
              attendees: (parsed.attendees ?? []) as MeetingContextBundle['attendees'],
              unknownAttendees: (parsed.unknownAttendees ?? []) as MeetingContextBundle['unknownAttendees'],
              relatedContext: (parsed.relatedContext ?? { goals: [], projects: [], recentDecisions: [], recentLearnings: [] }) as MeetingContextBundle['relatedContext'],
              warnings: (parsed.warnings ?? []) as MeetingContextBundle['warnings'],
            };
          } else {
            throw new Error('Invalid context format: missing required "meeting" field');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: `Failed to parse context: ${msg}` }));
          } else {
            error(`Failed to parse context: ${msg}`);
          }
          process.exit(1);
        }
      }

      // Parse prior items if provided
      let priorItems: PriorItem[] | undefined;
      if (opts.priorItems) {
        try {
          let priorItemsJson: string;
          if (opts.priorItems === '-') {
            // Read from stdin
            const chunks: Buffer[] = [];
            for await (const chunk of process.stdin) {
              chunks.push(chunk as Buffer);
            }
            priorItemsJson = Buffer.concat(chunks).toString('utf8');
          } else {
            // Read from file
            const content = await services.storage.read(opts.priorItems);
            if (!content) {
              if (opts.json) {
                console.log(JSON.stringify({ success: false, error: `Prior items file not found: ${opts.priorItems}` }));
              } else {
                error(`Prior items file not found: ${opts.priorItems}`);
              }
              process.exit(1);
            }
            priorItemsJson = content;
          }
          const parsed = JSON.parse(priorItemsJson);
          if (!Array.isArray(parsed)) {
            throw new Error('Prior items must be an array');
          }
          // Validate each element has required fields
          for (const item of parsed) {
            if (!item.type || !item.text) {
              throw new Error('Each prior item must have type and text');
            }
          }
          priorItems = parsed as PriorItem[];
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: `Failed to parse prior items: ${msg}` }));
          } else {
            error(`Failed to parse prior items: ${msg}`);
          }
          process.exit(1);
        }
      }

      // Determine effective importance:
      // 1. CLI flag overrides frontmatter
      // 2. Frontmatter importance used if no flag
      // 3. Default to undefined (normal processing)
      let effectiveImportance: Importance | undefined = undefined;
      if (opts.importance) {
        // Validate CLI flag value
        const validLevels: Importance[] = ['skip', 'light', 'normal', 'important'];
        if (validLevels.includes(opts.importance as Importance)) {
          effectiveImportance = opts.importance as Importance;
        } else {
          if (opts.json) {
            console.log(JSON.stringify({
              success: false,
              error: `Invalid importance level: ${opts.importance}. Valid values: skip, light, normal, important`,
            }));
          } else {
            error(`Invalid importance level: ${opts.importance}. Valid values: skip, light, normal, important`);
          }
          process.exit(1);
        }
      } else if (frontmatter.importance) {
        // Read from frontmatter
        effectiveImportance = frontmatter.importance as Importance;
      }

      // Handle importance === 'skip': return early with empty result
      if (effectiveImportance === 'skip') {
        const response = {
          success: true,
          file: meetingPath,
          intelligence: {
            summary: '',
            actionItems: [],
            nextSteps: [],
            decisions: [],
            learnings: [],
          },
          validationWarnings: [],
          staged: false,
          dryRun: Boolean(opts.dryRun),
          skipped: true,
          reason: 'importance: skip',
          contextUsed: false,
          priorItemsUsed: false,
          reconciled: [],
          qmd: { indexed: false, skipped: true },
        };

        if (opts.json) {
          console.log(JSON.stringify(response, null, 2));
        } else {
          info(`Skipped extraction: ${meetingPath} (importance: skip)`);
        }
        return;
      }

      // Fail-fast (moved here from earlier): --reconcile requires the 'standard'
      // tier because batchLLMReview routes to it. Placed AFTER the
      // importance-skip short-circuit so `--importance skip` exits cleanly on
      // workspaces missing the tier. Still runs before any LLM call, so no
      // extraction tier cost is paid if config is bad.
      if (opts.reconcile && !config.ai?.tiers?.standard) {
        const msg = '`--reconcile` requires `ai.tiers.standard` to be set in arete.yaml. Run `arete credentials configure` or set the standard tier explicitly.';
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          error(msg);
        }
        process.exit(1);
      }

      // Speaking ratio upgrade: If importance === 'light', check speaking ratio
      // If owner speaks > 40%, upgrade to 'normal' (they led the meeting)
      if (effectiveImportance === 'light') {
        try {
          const ownerName = execSync('git config user.name', { encoding: 'utf-8' }).trim();
          if (ownerName) {
            const ratio = calculateSpeakingRatio(transcript, ownerName);
            if (ratio !== undefined && ratio > 0.4) {
              const percentage = (ratio * 100).toFixed(0);
              if (!opts.json) {
                info(`Speaking ratio ${percentage}% > 40%, upgrading importance to 'normal'`);
              }
              effectiveImportance = 'normal';
            }
          }
        } catch {
          // git config unavailable, keep inferred importance
        }
      }

      // Determine extraction mode:
      // - Reprocessing (status: processed or approved) → thorough mode
      // - Light importance → light mode
      // - Otherwise → normal mode
      const currentStatus = frontmatter.status;
      const mode: ExtractionMode =
        (currentStatus === 'processed' || currentStatus === 'approved')
          ? 'thorough'
          : (effectiveImportance === 'light' ? 'light' : 'normal');

      // Create LLM call wrapper using AIService
      const callLLM: MeetingLLMCallFn = async (prompt: string) => {
        const result = await services.ai.call('extraction', prompt);
        return result.text;
      };

      // Reconciliation review runs on the cheaper 'reconciliation' tier
      // (typically 'standard'/Sonnet) rather than the 'extraction' tier
      // (often 'frontier'/Opus). Keep callLLM bound to 'extraction' so the
      // main extraction path is unchanged; only batchLLMReview uses this.
      const callLLMReconciliation: MeetingLLMCallFn = async (prompt: string) => {
        const result = await services.ai.call('reconciliation', prompt);
        return result.text;
      };

      // Load active topic slugs (bare, no wikilinks) to bias the extraction
      // prompt toward reusing existing topics — first line of sprawl defense
      // (plan Phase A #3). Best-effort: failure to load degrades to no bias,
      // which is the prior behavior.
      let activeTopicSlugs: string | undefined;
      try {
        const { loadMemorySummary, renderActiveTopicsAsSlugList } = await import('@arete/core');
        const paths = services.workspace.getPaths(root);
        const memory = await loadMemorySummary(services.topicMemory, paths);
        const rendered = renderActiveTopicsAsSlugList(memory.activeTopics);
        activeTopicSlugs = rendered.length > 0 ? rendered : undefined;
      } catch {
        activeTopicSlugs = undefined;
      }

      // Extract intelligence
      let extractionResult: MeetingExtractionResult;
      try {
        extractionResult = await extractMeetingIntelligence(transcript, callLLM, {
          attendees: attendees.length > 0 ? attendees : undefined,
          context: contextBundle,
          priorItems,
          mode,
          activeTopicSlugs,
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

      // Run cross-meeting reconciliation if requested
      let reconciliationResult: ReconciliationResult | undefined;
      let cachedReconciliationContext: ReconciliationContext | undefined;
      if (opts.reconcile) {
        try {
          // Load reconciliation context (area memories + committed items)
          cachedReconciliationContext = await loadReconciliationContext(
            services.storage,
            root,
          );

          // Load recent meetings batch
          const meetingsDir = join(root, paths.resources, 'meetings');
          const days = parseInt(opts.reconcileDays || '7', 10);
          const recentBatch = await loadRecentMeetingBatch(
            services.storage,
            meetingsDir,
            days,
          );

          // Add current extraction to batch
          const currentBatch: MeetingExtractionBatch = {
            meetingPath: meetingPath,
            extraction: extractionResult.intelligence,
          };

          // Run reconciliation
          reconciliationResult = reconcileMeetingBatch(
            [...recentBatch, currentBatch],
            cachedReconciliationContext!,
          );
        } catch (err) {
          // Graceful degradation: log warning but continue without reconciliation
          const msg = err instanceof Error ? err.message : String(err);
          if (!opts.json) {
            warn(`Reconciliation failed, continuing without it: ${msg}`);
          }
        }
      }

      // Handle --stage (write to file with full metadata)
      let qmdResult: QmdRefreshResult | undefined;
      const dryRun = Boolean(opts.dryRun);
      const shouldStage = Boolean(opts.stage);

      // For --stage: process extraction to get filtered items and metadata
      let stagedSections: string;
      let processed: ReturnType<typeof processMeetingExtraction> | undefined;
      if (shouldStage) {
        // Extract user notes and process extraction (filtering, dedup, metadata)
        const userNotes = extractUserNotes(body);

        // Read completed items from week.md and scratchpad.md for reconciliation,
        // and read OPEN tasks from week.md and tasks.md for existing-task dedup.
        const weekContent = await services.storage.read(join(paths.now, 'week.md')) ?? '';
        const scratchpadContent = await services.storage.read(join(paths.now, 'scratchpad.md')) ?? '';
        const tasksContent = await services.storage.read(join(paths.now, 'tasks.md')) ?? '';
        const completedItems = [
          ...getCompletedItems(weekContent),
          ...getCompletedItems(scratchpadContent),
        ];
        const openTasks = [
          ...getOpenTasks(weekContent),
          ...getOpenTasks(tasksContent),
        ];

        processed = processMeetingExtraction(extractionResult, userNotes, {
          priorItems,
          completedItems,
          openTasks,
          importance: effectiveImportance,
        });

        // Merge reconciliation decisions into processed items
        if (reconciliationResult) {
          for (const reconciledItem of reconciliationResult.items) {
            // Skip items that reconciliation wants to keep
            if (reconciledItem.status === 'keep') continue;

            // Find matching filtered item by text
            const matchingItem = processed.filteredItems.find((fi) => {
              if (reconciledItem.type === 'action' && typeof reconciledItem.original !== 'string') {
                return fi.text === reconciledItem.original.description;
              }
              return fi.text === reconciledItem.original;
            });

            if (!matchingItem) continue;

            // Only override if processing didn't already skip this item
            const currentStatus = processed.stagedItemStatus[matchingItem.id];
            if (currentStatus === 'skipped') continue;

            // Items flagged 'duplicate' or 'completed' → skipped
            if (reconciledItem.status === 'duplicate' || reconciledItem.status === 'completed') {
              processed.stagedItemStatus[matchingItem.id] = 'skipped';
              processed.stagedItemSource[matchingItem.id] = 'reconciled';
            }
          }
        }

        // Run batch LLM quality review when reconciliation is active
        if (opts.reconcile && processed) {
          try {
            const proc = processed;
            const reviewItems = proc.filteredItems
              .filter(fi => proc.stagedItemStatus[fi.id] !== 'skipped')
              .map(fi => ({ text: fi.text, type: fi.type, id: fi.id }));

            if (reviewItems.length > 0) {
              // Reuse cached context to avoid redundant I/O
              const ctx = cachedReconciliationContext ?? await loadReconciliationContext(
                services.storage,
                root,
              );
              const drops = await batchLLMReview(
                reviewItems,
                ctx.recentCommittedItems,
                callLLMReconciliation,
              );
              for (const drop of drops) {
                processed.stagedItemStatus[drop.id] = 'skipped';
                processed.stagedItemSource[drop.id] = 'reconciled';
              }
              if (drops.length > 0 && !opts.json) {
                warn(`Batch review dropped ${drops.length} item(s)`);
              }
            }
          } catch {
            if (!opts.json) {
              warn('Batch LLM review skipped due to error');
            }
          }
        }

        // Format body sections from filtered items (IDs in body match IDs in metadata).
        // Task 10: thread `core` and `could_include` (from Task 7's wiki-aware
        // extraction) so the formatter emits `## Core` + `## Could include`
        // when the LLM populates them. Falls back to `## Summary` when absent
        // (formatter handles the precedence — see meeting-processing.ts:625).
        stagedSections = formatFilteredStagedSections(
          processed.filteredItems,
          extractionResult.intelligence.summary,
          extractionResult.intelligence.core,
          extractionResult.intelligence.could_include,
        );

        if (!dryRun) {
          // Clone frontmatter before mutating (pre-mortem mitigation: caching/mutation)
          const fm = { ...frontmatter };

          // Write full metadata (snake_case keys)
          fm['status'] = effectiveImportance === 'light' ? 'approved' : 'processed';
          fm['processed_at'] = new Date().toISOString();
          fm['staged_item_source'] = processed.stagedItemSource;
          fm['staged_item_confidence'] = processed.stagedItemConfidence;
          fm['staged_item_status'] = processed.stagedItemStatus;
          if (Object.keys(processed.stagedItemOwner).length > 0) {
            fm['staged_item_owner'] = processed.stagedItemOwner;
          }
          if (processed.stagedItemMatchedText && Object.keys(processed.stagedItemMatchedText).length > 0) {
            fm['staged_item_matched_text'] = processed.stagedItemMatchedText;
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

      // Build reconciled items array for JSON output
      const reconciled = processed?.stagedItemMatchedText
        ? Object.entries(processed.stagedItemMatchedText).map(([id, matchedText]) => ({
            id,
            matchedText,
          }))
        : [];

      // Per-source skip tally (observability for dedup behavior).
      // Lets users see why items were skipped without spelunking through frontmatter.
      const skippedBySource = processed
        ? Object.entries(processed.stagedItemStatus).reduce(
            (acc, [id, status]) => {
              if (status !== 'skipped') return acc;
              const source = processed.stagedItemSource[id];
              if (source === 'reconciled') acc.reconciled += 1;
              else if (source === 'existing-task') acc.existingTask += 1;
              else if (source === 'slack-resolved') acc.slackResolved += 1;
              return acc;
            },
            { reconciled: 0, existingTask: 0, slackResolved: 0 },
          )
        : { reconciled: 0, existingTask: 0, slackResolved: 0 };

      // Build response
      const response: Record<string, unknown> = {
        success: true,
        file: meetingPath,
        intelligence: extractionResult.intelligence,
        validationWarnings: extractionResult.validationWarnings,
        staged: shouldStage,
        dryRun,
        contextUsed: !!contextBundle,
        priorItemsUsed: !!priorItems,
        reconciled,
        skippedBySource,
        qmd: qmdResult ?? { indexed: false, skipped: true },
      };

      // Add reconciliation stats when reconciliation was run
      if (reconciliationResult) {
        response.reconciliation = {
          enabled: true,
          stats: reconciliationResult.stats,
          items: reconciliationResult.items.map((item) => ({
            type: item.type,
            status: item.status,
            relevanceTier: item.relevanceTier,
            relevanceScore: item.relevanceScore,
            annotations: item.annotations,
          })),
        };
      }

      if (opts.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      // Human-readable output
      if (shouldStage && dryRun) {
        info('Dry run — would write the following staged sections:');
        console.log('');
        console.log(stagedSections);

        // Display reconciliation details
        if (reconciliationResult) {
          displayReconciliationDetails(reconciliationResult, reconciled);
        } else if (reconciled.length > 0) {
          displayReconciledCompletedItems(reconciled);
        }
        return;
      }

      if (shouldStage) {
        success(`Staged sections written to: ${meetingPath}`);

        // Per-source skip summary
        const totalSkipped = skippedBySource.reconciled + skippedBySource.existingTask + skippedBySource.slackResolved;
        if (totalSkipped > 0) {
          const parts: string[] = [];
          if (skippedBySource.reconciled > 0) parts.push(`${skippedBySource.reconciled} reconciled`);
          if (skippedBySource.existingTask > 0) parts.push(`${skippedBySource.existingTask} existing-task`);
          if (skippedBySource.slackResolved > 0) parts.push(`${skippedBySource.slackResolved} slack-resolved`);
          info(`Skipped ${totalSkipped} items: ${parts.join(', ')}`);
        }

        // Display reconciliation details
        if (reconciliationResult) {
          displayReconciliationDetails(reconciliationResult, reconciled);
        } else if (reconciled.length > 0) {
          displayReconciledCompletedItems(reconciled);
        }

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
    .option('--skip-topics', 'Skip topic page integration after commit (defer to `arete memory refresh`)')
    .option('--json', 'Output as JSON')
    .action(async (slug: string, opts: {
      all?: boolean;
      items?: string;
      skip?: string;
      skipQmd?: boolean;
      skipTopics?: boolean;
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

      // --------------------------------------------------------------------------
      // Goal linking: prompt user to link action items to goals
      // --------------------------------------------------------------------------
      let selectedGoalSlug: string | undefined;
      const approvedActionItemIds = approvedIds.filter((id) => id.startsWith('ai_'));
      
      if (approvedActionItemIds.length > 0 && !opts.json) {
        // Load active goals
        const goalsDir = join(root, 'goals');
        const allGoals = await parseGoals(goalsDir, services.storage);
        const activeGoals = allGoals.filter((g) => g.status === 'active');
        
        if (activeGoals.length === 0) {
          info('No active goals found, skipping goal linking');
        } else if (activeGoals.length <= 2) {
          // Inline prompt for 1-2 goals
          const { confirm } = await import('@inquirer/prompts');
          for (const goal of activeGoals) {
            const confirmed = await confirm({
              message: `Link action items to ${goal.id} "${goal.title}"?`,
              default: false,
            });
            if (confirmed) {
              selectedGoalSlug = goal.slug;
              break;
            }
          }
        } else {
          // Numbered list for 3+ goals
          const { select } = await import('@inquirer/prompts');
          const choices = [
            ...activeGoals.map((g) => ({
              name: `${g.id} ${g.title}`,
              value: g.slug,
            })),
            { name: 'None', value: '__none__' },
          ];
          const result = await select({
            message: 'Link action items to a goal:',
            choices,
          });
          if (result !== '__none__') {
            selectedGoalSlug = result;
          }
        }
      }

      // --------------------------------------------------------------------------
      // Save owner metadata BEFORE commitApprovedItems clears it
      // --------------------------------------------------------------------------
      const ownerMap = parseStagedItemOwner(updatedContent);
      const editsMap = parseStagedItemEdits(updatedContent);
      
      // Get meeting metadata for task/commitment creation
      const meetingDate = typeof frontmatter['date'] === 'string' 
        ? new Date(frontmatter['date'].slice(0, 10))
        : new Date();
      const meetingArea = typeof frontmatter['area'] === 'string'
        ? frontmatter['area']
        : undefined;

      // Commit approved items (decisions, learnings to memory)
      const memoryDir = join(root, '.arete', 'memory', 'items');
      await commitApprovedItems(services.storage, meetingPath, memoryDir);

      // --------------------------------------------------------------------------
      // Hook 2 — Integrate this meeting into its topic wiki pages (Phase A #2)
      //
      // After commit succeeds, materialize the LLM-synthesized narrative into
      // each topic page tagged on the meeting. Uses refreshAllFromMeetings
      // scoped to this meeting's slugs — content-hash idempotency means only
      // this new meeting's integration spends LLM; any previously-integrated
      // sources for the same topics skip cleanly.
      //
      // Gated on `services.ai.isConfigured()` + `!opts.skipTopics`. Non-fatal:
      // failure is reported to the user but never blocks the approve flow
      // (the committed items are already persisted at this point).
      // --------------------------------------------------------------------------
      let topicIntegration: {
        topics: number;
        integrated: number;
        fallback: number;
        skipped: number;
        durationMs?: number;
      } | undefined;
      if (!opts.skipTopics && services.ai.isConfigured() && process.env.ARETE_NO_LLM !== '1') {
        try {
          // Re-read the just-committed file to get the post-alias topics list.
          const committed = await services.storage.read(meetingPath);
          if (committed !== null) {
            const { parseMeetingFile } = await import('@arete/core');
            const parsed = parseMeetingFile(committed);
            const meetingTopics = parsed?.frontmatter.topics ?? [];
            if (meetingTopics.length > 0) {
              const topicCallLLM = async (prompt: string) => {
                const r = await services.ai.call('synthesis', prompt);
                return r.text;
              };
              const integrationStart = Date.now();
              const result = await services.topicMemory.refreshAllFromMeetings(paths, {
                today: new Date().toISOString().slice(0, 10),
                callLLM: topicCallLLM,
                slugs: meetingTopics,
                workspaceRoot: root,
                lockLabel: 'meeting approve (topic ingest)',
              });
              topicIntegration = {
                topics: result.topics.length,
                integrated: result.totalIntegrated,
                fallback: result.totalFallback,
                skipped: result.totalSkipped,
                durationMs: Date.now() - integrationStart,
              };
            }
          }
        } catch (err) {
          // Non-fatal: approve already succeeded. Report and move on.
          if (err instanceof Error && err.name === 'SeedLockHeldError') {
            warn(`Topic integration skipped: ${err.message}`);
          } else {
            warn(`Topic integration failed (non-fatal): ${err instanceof Error ? err.message : 'unknown'}`);
          }
        }
      }

      // --------------------------------------------------------------------------
      // Create commitments and tasks from action items
      // --------------------------------------------------------------------------
      let tasksCreated = 0;
      let waitingOnCreated = 0;
      
      if (approvedActionItemIds.length > 0) {
        for (const itemId of approvedActionItemIds) {
          const item = stagedSections.actionItems.find((ai) => ai.id === itemId);
          if (!item) continue;
          
          const ownerMeta = ownerMap[itemId];
          const text = editsMap[itemId] ?? item.text;
          const direction = (ownerMeta?.direction ?? item.direction ?? 'i_owe_them') as 'i_owe_them' | 'they_owe_me';
          const counterpartySlug = ownerMeta?.counterpartySlug ?? item.counterpartySlug;
          const ownerSlug = ownerMeta?.ownerSlug ?? item.ownerSlug;
          
          // Determine person slug (the other party in the commitment)
          const personSlug = direction === 'i_owe_them' ? counterpartySlug : ownerSlug;
          if (!personSlug) continue;
          
          // Get person display name
          const personName = formatSlugAsName(personSlug);
          
          if (direction === 'i_owe_them') {
            // I owe them: create commitment + task with urgency-based bucket
            const result = await services.commitments.create(
              text,
              personSlug,
              personName,
              'i_owe_them',
              {
                createTask: false, // We'll create the task manually with proper bucket
                goalSlug: selectedGoalSlug,
                area: meetingArea,
                date: meetingDate,
                source: `${slug}.md`,
              },
            );
            
            // Infer urgency and create task with proper bucket
            const urgencyBucket = inferUrgency(text);
            const taskDestination: TaskDestination = urgencyBucket;
            
            await services.tasks.addTask(text, taskDestination, {
              area: meetingArea,
              person: personSlug,
              from: { type: 'commitment', id: result.commitment.id.slice(0, 8) },
            });
            tasksCreated++;
            
          } else {
            // They owe me: create commitment only + add to Waiting On
            const result = await services.commitments.create(
              text,
              personSlug,
              personName,
              'they_owe_me',
              {
                createTask: false,
                goalSlug: selectedGoalSlug,
                area: meetingArea,
                date: meetingDate,
                source: `${slug}.md`,
              },
            );
            
            // Add to Waiting On section in week.md
            await addWaitingOnEntry(
              services.storage,
              paths.now,
              personName,
              personSlug,
              text,
              result.commitment.id.slice(0, 8),
            );
            waitingOnCreated++;
          }
        }
      }

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
        ...(selectedGoalSlug ? { goalSlug: selectedGoalSlug } : {}),
        topicIntegration: topicIntegration ?? null,
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
        const goalNote = selectedGoalSlug ? ` (linked to ${selectedGoalSlug})` : '';
        listItem('Action items', `${actionCount}${goalNote}`);
      }
      if (decisionCount > 0) {
        listItem('Decisions', `${decisionCount} (written to memory)`);
      }
      if (learningCount > 0) {
        listItem('Learnings', `${learningCount} (written to memory)`);
      }
      if (topicIntegration !== undefined) {
        const parts: string[] = [];
        if (topicIntegration.integrated > 0) parts.push(`${topicIntegration.integrated} integrated`);
        if (topicIntegration.fallback > 0) parts.push(`${topicIntegration.fallback} fallback`);
        if (topicIntegration.skipped > 0) parts.push(`${topicIntegration.skipped} skipped`);
        if (parts.length > 0) {
          listItem('Topics', `${topicIntegration.topics} touched (${parts.join(', ')})`);
        }
        const dur = topicIntegration.durationMs ?? 0;
        if (dur > 5000 || topicIntegration.topics > 2) {
          const secs = (dur / 1000).toFixed(1);
          warn(`Topic integration took ${secs}s (${topicIntegration.topics} topics). Use --skip-topics to defer; run \`arete memory refresh\` later to catch up.`);
        }
      }

      displayQmdResult(qmdResult);
    });

  // Context subcommand - assemble context bundle for a meeting
  meetingCmd
    .command('context <file>')
    .description('Assemble a context bundle for a meeting file')
    .option('--json', 'Output as JSON (required for piping)')
    .option('--skip-agenda', 'Skip agenda lookup')
    .option('--skip-people', 'Skip attendee resolution')
    .action(async (file: string, opts: {
      json?: boolean;
      skipAgenda?: boolean;
      skipPeople?: boolean;
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

      const paths = services.workspace.getPaths(root);

      // Resolve file path
      const meetingPath = file.startsWith('/') ? file : join(root, file);

      // Build context bundle
      let bundle: MeetingContextBundle;
      try {
        bundle = await buildMeetingContext(meetingPath, {
          storage: services.storage,
          intelligence: services.intelligence,
          entity: services.entity,
          paths,
          topicMemory: services.topicMemory,
        }, {
          skipAgenda: opts.skipAgenda,
          skipPeople: opts.skipPeople,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          error(msg);
        }
        process.exit(1);
      }

      // Output
      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          ...bundle,
        }, null, 2));
        return;
      }

      // Human-readable output
      console.log('');
      console.log(chalk.bold('Meeting Context Bundle'));
      console.log(chalk.dim('─'.repeat(50)));
      console.log('');

      // Meeting info
      console.log(chalk.bold('Meeting'));
      console.log(`  Title: ${bundle.meeting.title}`);
      console.log(`  Date: ${bundle.meeting.date}`);
      console.log(`  Attendees: ${bundle.meeting.attendees.length}`);
      console.log(`  Transcript length: ${bundle.meeting.transcript.length} chars`);
      console.log('');

      // Agenda
      if (bundle.agenda) {
        console.log(chalk.bold('Agenda'));
        console.log(`  Path: ${bundle.agenda.path}`);
        console.log(`  Items: ${bundle.agenda.items.length}`);
        console.log(`  Unchecked: ${bundle.agenda.unchecked.length}`);
        console.log('');
      } else {
        console.log(chalk.dim('No agenda found'));
        console.log('');
      }

      // Resolved attendees
      if (bundle.attendees.length > 0) {
        console.log(chalk.bold('Resolved Attendees'));
        for (const attendee of bundle.attendees) {
          console.log(`  • ${attendee.name} (@${attendee.slug}) — ${attendee.category}`);
          if (attendee.stances.length > 0) {
            console.log(`    Stances: ${attendee.stances.length}`);
          }
          if (attendee.openItems.length > 0) {
            console.log(`    Open items: ${attendee.openItems.length}`);
          }
        }
        console.log('');
      }

      // Unknown attendees
      if (bundle.unknownAttendees.length > 0) {
        console.log(chalk.yellow('Unknown Attendees'));
        for (const unknown of bundle.unknownAttendees) {
          console.log(`  • ${unknown.name || unknown.email}`);
        }
        console.log('');
      }

      // Related context
      const rc = bundle.relatedContext;
      if (rc.goals.length > 0 || rc.projects.length > 0 || rc.recentDecisions.length > 0 || rc.recentLearnings.length > 0) {
        console.log(chalk.bold('Related Context'));
        if (rc.goals.length > 0) {
          console.log(`  Goals: ${rc.goals.map(g => g.title).join(', ')}`);
        }
        if (rc.projects.length > 0) {
          console.log(`  Projects: ${rc.projects.map(p => p.title).join(', ')}`);
        }
        if (rc.recentDecisions.length > 0) {
          console.log(`  Recent decisions: ${rc.recentDecisions.length}`);
        }
        if (rc.recentLearnings.length > 0) {
          console.log(`  Recent learnings: ${rc.recentLearnings.length}`);
        }
        console.log('');
      }

      // Warnings
      if (bundle.warnings.length > 0) {
        console.log(chalk.yellow('Warnings'));
        for (const warning of bundle.warnings) {
          console.log(`  ⚠ ${warning}`);
        }
        console.log('');
      }

      success('Context bundle assembled');
    });

  // Apply subcommand - apply extracted intelligence to a meeting file
  meetingCmd
    .command('apply <file>')
    .description('Apply extracted intelligence to a meeting file')
    .option('--intelligence <json>', 'Intelligence JSON (or - for stdin)')
    .option('--skip-agenda', 'Skip agenda archival')
    .option('--clear', 'Clear existing staged sections before writing')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--skip-topics', 'Skip topic alias/merge pass (write intelligence.topics verbatim; `arete memory refresh` will normalize later)')
    .option('--json', 'Output as JSON')
    .action(async (file: string, opts: {
      intelligence?: string;
      skipAgenda?: boolean;
      clear?: boolean;
      skipQmd?: boolean;
      skipTopics?: boolean;
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

      // Parse intelligence from --intelligence flag or stdin
      if (!opts.intelligence) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Provide --intelligence <json> or --intelligence -' }));
        } else {
          error('Provide --intelligence <json> or --intelligence -');
          info('Example: arete meeting apply meeting.md --intelligence \'{"summary":"..."}\'');
          info('Example: arete meeting extract meeting.md --json | arete meeting apply meeting.md --intelligence -');
        }
        process.exit(1);
      }

      let intelligenceJson: string;
      if (opts.intelligence === '-') {
        // Read from stdin
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer);
        }
        intelligenceJson = Buffer.concat(chunks).toString('utf8');
      } else {
        intelligenceJson = opts.intelligence;
      }

      // Parse intelligence JSON
      let intelligence: MeetingIntelligence;
      try {
        const parsed = JSON.parse(intelligenceJson) as Record<string, unknown>;
        // Handle both wrapped (success: true, intelligence: {...}) and unwrapped formats
        if (parsed.intelligence && typeof parsed.intelligence === 'object') {
          intelligence = parsed.intelligence as MeetingIntelligence;
        } else {
          intelligence = parsed as MeetingIntelligence;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Invalid intelligence JSON: ${msg}` }));
        } else {
          error(`Invalid intelligence JSON: ${msg}`);
        }
        process.exit(1);
      }

      // Resolve file path
      const meetingPath = file.startsWith('/') ? file : join(root, file);

      // Apply intelligence using the core service. Threads TopicMemoryService
      // + callLLM so the alias/merge pass (Phase A #1 of topic-wiki-memory)
      // normalizes `intelligence.topics` against existing topic pages before
      // writing frontmatter. `--skip-topics` bypasses the pass.
      const applyCallLLM = services.ai.isConfigured() && process.env.ARETE_NO_LLM !== '1'
        ? async (prompt: string) => {
            const r = await services.ai.call('synthesis', prompt);
            return r.text;
          }
        : undefined;
      const applyPaths = services.workspace.getPaths(root);

      let result: ApplyMeetingResult;
      try {
        result = await applyMeetingIntelligence(meetingPath, intelligence, {
          storage: services.storage,
          workspaceRoot: root,
          topicMemory: services.topicMemory,
          workspacePaths: applyPaths,
          callLLM: applyCallLLM,
        }, {
          skipAgenda: opts.skipAgenda,
          clear: opts.clear,
          skipTopicAlias: opts.skipTopics,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          error(msg);
        }
        process.exit(1);
      }

      // Refresh QMD index unless --skip-qmd
      let qmdResult: QmdRefreshResult | undefined;
      if (!opts.skipQmd) {
        qmdResult = await refreshQmdIndex(root, config.qmd_collection);
      }

      // Build response
      const response = {
        success: true,
        ...result,
        qmd: qmdResult ?? { indexed: false, skipped: true },
      };

      if (opts.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      // Human-readable output
      success(`Applied intelligence to: ${file}`);
      listItem('Action items staged', `${result.actionItemsStaged}`);
      listItem('Decisions staged', `${result.decisionsStaged}`);
      listItem('Learnings staged', `${result.learningsStaged}`);

      if (result.agendaArchived) {
        info(`Agenda archived: ${result.agendaArchived}`);
      }

      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          warn(warning);
        }
      }

      displayQmdResult(qmdResult);

      // Fire-and-forget manifest refresh (non-blocking — do not await)
      const paths = services.workspace.getPaths(root);
      generateMeetingManifest(paths, services.storage).catch((err: unknown) => {
        warn(`Meeting manifest update failed: ${err instanceof Error ? err.message : String(err)}`);
      });
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


