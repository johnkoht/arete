/**
 * Meeting agenda template discovery and loading.
 * Resolves templates from workspace custom dir first, then package default dir.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { getSourcePaths } from './workspace.js';

const MEETING_AGENDAS_SUBDIR = 'meeting-agendas';
const SECTION_HEADING_REGEX = /^##\s+(.+)$/gm;

export type MeetingAgendaTemplate = {
  name: string;
  type: string;
  description?: string;
  path: string;
  sections?: string[];
  timeAllocation?: Record<string, number>;
  body?: string;
};

type Frontmatter = {
  name?: string;
  type?: string;
  description?: string;
  time_allocation?: Record<string, number>;
};

function getDefaultTemplatesDir(): string {
  const sourcePaths = getSourcePaths();
  return join(sourcePaths.templates, MEETING_AGENDAS_SUBDIR);
}

function getCustomTemplatesDir(workspaceRoot: string): string {
  return join(workspaceRoot, '.arete', 'templates', MEETING_AGENDAS_SUBDIR);
}

function parseFrontmatterAndBody(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const [, fm, body] = match;
  const frontmatter = (parseYaml(fm || '') as Frontmatter) || {};
  return { frontmatter, body: body?.trim() ?? '' };
}

function extractSections(body: string): string[] {
  const sections: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(SECTION_HEADING_REGEX.source, 'gm');
  while ((m = re.exec(body)) !== null) {
    sections.push(m[1].trim());
  }
  return sections;
}

function loadTemplateFile(filePath: string, typeFromFilename: string): MeetingAgendaTemplate | null {
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, 'utf8');
    const { frontmatter, body } = parseFrontmatterAndBody(content);
    const name = frontmatter.name ?? typeFromFilename;
    const type = frontmatter.type ?? typeFromFilename;
    const description = frontmatter.description;
    const timeAllocation = frontmatter.time_allocation;
    const sections = extractSections(body);
    return {
      name,
      type,
      description,
      path: filePath,
      sections: sections.length > 0 ? sections : undefined,
      timeAllocation,
      body
    };
  } catch {
    return null;
  }
}

function listTemplatesInDir(dir: string): MeetingAgendaTemplate[] {
  if (!existsSync(dir)) return [];
  const results: MeetingAgendaTemplate[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    const typeFromFilename = e.name.slice(0, -3);
    const filePath = join(dir, e.name);
    const t = loadTemplateFile(filePath, typeFromFilename);
    if (t) results.push(t);
  }
  return results;
}

/**
 * List all meeting agenda templates: default (package) and custom (workspace).
 */
export function listMeetingAgendaTemplates(
  workspaceRoot: string
): Promise<{ default: MeetingAgendaTemplate[]; custom: MeetingAgendaTemplate[] }> {
  const defaultDir = getDefaultTemplatesDir();
  const customDir = getCustomTemplatesDir(workspaceRoot);
  const defaultTemplates = listTemplatesInDir(defaultDir);
  const customTemplates = listTemplatesInDir(customDir);
  return Promise.resolve({ default: defaultTemplates, custom: customTemplates });
}

/**
 * Get a single template by type. Custom (workspace) overrides default for the same type.
 */
export function getMeetingAgendaTemplate(
  workspaceRoot: string,
  type: string
): Promise<MeetingAgendaTemplate | null> {
  const customDir = getCustomTemplatesDir(workspaceRoot);
  const customPath = join(customDir, `${type}.md`);
  if (existsSync(customPath)) {
    const t = loadTemplateFile(customPath, type);
    return Promise.resolve(t);
  }
  const defaultDir = getDefaultTemplatesDir();
  const defaultPath = join(defaultDir, `${type}.md`);
  if (existsSync(defaultPath)) {
    const t = loadTemplateFile(defaultPath, type);
    return Promise.resolve(t);
  }
  return Promise.resolve(null);
}
