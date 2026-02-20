/**
 * Conversation save logic — uses StorageAdapter, no direct fs.
 * Follows saveMeetingFile() pattern from ../meetings.ts.
 */

import { join } from 'path';
import type { StorageAdapter } from '../../storage/adapter.js';
import type { ConversationForSave } from './types.js';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a filename for a conversation artifact.
 * Format: {date}-{title-slug}.md
 */
export function conversationFilename(conversation: ConversationForSave): string {
  let dateStr = conversation.date;
  if (dateStr?.includes('T')) dateStr = dateStr.slice(0, 10);
  if (!dateStr) dateStr = new Date().toISOString().slice(0, 10);
  const titleSlug = slugify(conversation.title || 'untitled');
  return `${dateStr}-${titleSlug}.md`;
}

/**
 * Render a conversation as markdown with YAML frontmatter.
 */
function renderConversationMarkdown(conversation: ConversationForSave): string {
  const { title, date, source, participants, rawTranscript, normalizedContent, insights, provenance } = conversation;

  // Frontmatter
  const frontmatter = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `date: "${date}"`,
    `source: "${source}"`,
    `captured_at: "${provenance.capturedAt}"`,
    '---',
  ].join('\n');

  // Sections
  const sections: string[] = [];

  sections.push(`# ${title}`);
  sections.push(`**Date**: ${date}`);
  sections.push(`**Source**: ${source}`);

  if (participants.length > 0) {
    sections.push(`\n## Participants\n${participants.map(p => `- ${p}`).join('\n')}`);
  }

  // Insights — only include sections that have content
  if (insights.summary) {
    sections.push(`\n## Summary\n${insights.summary}`);
  }

  if (insights.decisions && insights.decisions.length > 0) {
    sections.push(`\n## Decisions\n${insights.decisions.map(d => `- ${d}`).join('\n')}`);
  }

  if (insights.actionItems && insights.actionItems.length > 0) {
    sections.push(`\n## Action Items\n${insights.actionItems.map(a => `- [ ] ${a}`).join('\n')}`);
  }

  if (insights.openQuestions && insights.openQuestions.length > 0) {
    sections.push(`\n## Open Questions\n${insights.openQuestions.map(q => `- ${q}`).join('\n')}`);
  }

  if (insights.stakeholders && insights.stakeholders.length > 0) {
    sections.push(`\n## Stakeholders\n${insights.stakeholders.map(s => `- ${s}`).join('\n')}`);
  }

  if (insights.risks && insights.risks.length > 0) {
    sections.push(`\n## Risks\n${insights.risks.map(r => `- ${r}`).join('\n')}`);
  }

  if (normalizedContent) {
    sections.push(`\n## Conversation\n${normalizedContent}`);
  }

  if (rawTranscript) {
    sections.push(`\n## Raw Transcript\n${rawTranscript}`);
  }

  return frontmatter + '\n\n' + sections.join('\n') + '\n';
}

/**
 * Save a conversation artifact to disk as a markdown file.
 *
 * @returns The full path of the saved file, or null if the file already exists (and force is false).
 */
export async function saveConversationFile(
  storage: StorageAdapter,
  conversation: ConversationForSave,
  outputDir: string,
  options: { force?: boolean } = {},
): Promise<string | null> {
  const { force = false } = options;
  const filename = conversationFilename(conversation);
  const fullPath = join(outputDir, filename);

  const exists = await storage.exists(fullPath);
  if (!force && exists) return null;

  const content = renderConversationMarkdown(conversation);

  await storage.mkdir(outputDir);
  await storage.write(fullPath, content);
  return fullPath;
}
