import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspacePaths } from '../../src/models/index.js';
import type {
  TestMeetingInput,
  TestMemoryItemInput,
  TestPersonInput,
  TestProjectInput,
  TestWorkspaceFixture,
} from './types.js';

function getWorkspacePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    tools: join(root, '.cursor', 'tools'),
    integrations: join(root, '.cursor', 'integrations'),
    context: join(root, 'context'),
    memory: join(root, '.arete', 'memory'),
    now: join(root, 'now'),
    goals: join(root, 'goals'),
    projects: join(root, 'projects'),
    resources: join(root, 'resources'),
    people: join(root, 'people'),
    credentials: join(root, '.credentials'),
    templates: join(root, 'templates'),
  };
}

function writeRelative(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  const directory = fullPath.slice(0, fullPath.lastIndexOf('/'));
  mkdirSync(directory, { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

function buildPersonContent(input: TestPersonInput): string {
  return `---\nname: ${input.name}\nemail: ${input.email ?? ''}\nrole: ${input.role ?? ''}\ncompany: ${input.company ?? ''}\nteam: ${input.team ?? ''}\ncategory: ${input.category}\n---\n\n# ${input.name}\n`;
}

function buildMeetingContent(input: TestMeetingInput): string {
  const attendeeIds = input.attendeeIds ?? [];
  const attendees = input.attendeesLabel ?? attendeeIds.join(', ');

  return `---\ntitle: "${input.title}"\ndate: "${input.date}"\nsource: "test"\nattendees: "${attendees}"\nattendee_ids: [${attendeeIds.map((id) => `"${id}"`).join(', ')}]\n---\n\n# ${input.title}\n\n${input.body ?? ''}\n`;
}

function appendMemoryItem(
  root: string,
  fileName: 'decisions.md' | 'learnings.md',
  input: TestMemoryItemInput,
): void {
  const filePath = join(root, '.arete', 'memory', 'items', fileName);
  mkdirSync(join(root, '.arete', 'memory', 'items'), { recursive: true });

  const heading = fileName === 'decisions.md' ? '# Decisions' : '# Learnings';
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : `${heading}\n\n`;
  const entry = `### ${input.date}: ${input.title}\n${input.body}\n\n`;

  writeFileSync(filePath, `${existing}${entry}`, 'utf8');
}

export function createTestWorkspace(root: string): TestWorkspaceFixture {
  const paths = getWorkspacePaths(root);

  return {
    root,
    paths,
    writeFile(relativePath: string, content: string): void {
      writeRelative(root, relativePath, content);
    },
    addPerson(input: TestPersonInput): void {
      writeRelative(root, `people/${input.category}/${input.slug}.md`, buildPersonContent(input));
    },
    addMeeting(input: TestMeetingInput): void {
      writeRelative(root, `resources/meetings/${input.date}-${input.slug}.md`, buildMeetingContent(input));
    },
    addProject(input: TestProjectInput): void {
      const status = input.status === 'archive' ? 'archive' : 'active';
      writeRelative(root, `projects/${status}/${input.slug}/README.md`, input.readme);
    },
    addMemoryDecision(input: TestMemoryItemInput): void {
      appendMemoryItem(root, 'decisions.md', input);
    },
    addMemoryLearning(input: TestMemoryItemInput): void {
      appendMemoryItem(root, 'learnings.md', input);
    },
  };
}

export type {
  TestMeetingInput,
  TestMemoryItemInput,
  TestPersonInput,
  TestProjectInput,
  TestWorkspaceFixture,
} from './types.js';
