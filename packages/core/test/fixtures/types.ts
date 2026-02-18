import type { WorkspacePaths, PersonCategory } from '../../src/models/index.js';

export type TestPersonInput = {
  slug: string;
  name: string;
  category: PersonCategory;
  email?: string;
  role?: string;
  company?: string;
  team?: string;
};

export type TestMeetingInput = {
  slug: string;
  date: string;
  title: string;
  attendeeIds?: string[];
  attendeesLabel?: string;
  body?: string;
};

export type TestProjectInput = {
  slug: string;
  status?: 'active' | 'archive';
  readme: string;
};

export type TestMemoryItemInput = {
  title: string;
  body: string;
  date: string;
};

export type TestWorkspaceFixture = {
  root: string;
  paths: WorkspacePaths;
  writeFile(relativePath: string, content: string): void;
  addPerson(input: TestPersonInput): void;
  addMeeting(input: TestMeetingInput): void;
  addProject(input: TestProjectInput): void;
  addMemoryDecision(input: TestMemoryItemInput): void;
  addMemoryLearning(input: TestMemoryItemInput): void;
};
