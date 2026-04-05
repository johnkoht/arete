/**
 * Tests for IntelligenceService email enrichment (Phase 1b).
 *
 * Verifies that:
 * - assembleBriefing works identically without emailProvider (backward compat)
 * - assembleBriefing includes email context when emailProvider is available
 * - assembleBriefing skips email when no entities have emails
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { getSearchProvider } from '../../src/search/factory.js';
import { ContextService } from '../../src/services/context.js';
import { MemoryService } from '../../src/services/memory.js';
import { EntityService } from '../../src/services/entity.js';
import { IntelligenceService } from '../../src/services/intelligence.js';
import type { WorkspacePaths } from '../../src/models/index.js';
import type { EmailProvider, EmailThread } from '../../src/integrations/gws/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaths(root: string): WorkspacePaths {
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

function writeFile(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

function createMockEmailProvider(threads: EmailThread[] = []): EmailProvider {
  return {
    name: 'mock-gmail',
    async isAvailable() { return true; },
    async searchThreads(_query: string, _options?: { maxResults?: number }) {
      return threads;
    },
    async getThread(threadId: string) {
      const found = threads.find(t => t.id === threadId);
      if (!found) throw new Error(`Thread ${threadId} not found`);
      return found;
    },
    async getImportantUnread(_options?: { maxResults?: number }) {
      return threads.filter(t => t.unread);
    },
  };
}

const SAMPLE_THREADS: EmailThread[] = [
  {
    id: 'thread-1',
    subject: 'Roadmap Q2 Discussion',
    snippet: 'Here is the updated roadmap for Q2...',
    from: 'jane@example.com',
    date: '2026-04-01',
    labels: ['INBOX'],
    unread: false,
  },
  {
    id: 'thread-2',
    subject: 'Re: Sprint Review Notes',
    snippet: 'Key decisions from the sprint review...',
    from: 'jane@example.com',
    date: '2026-03-28',
    labels: ['INBOX'],
    unread: true,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntelligenceService email enrichment', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'intel-email-'));
    paths = makePaths(tmpDir);

    // Create minimal workspace structure
    writeFile(tmpDir, 'context/overview.md', '# Overview\n\nTest workspace.');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('assembleBriefing works without emailProvider (backward compat)', async () => {
    const storage = new FileStorageAdapter();
    const search = getSearchProvider(tmpDir);
    const context = new ContextService(storage, search);
    const memory = new MemoryService(storage, search);
    const entity = new EntityService(storage);

    // No emailProvider — 3-arg constructor (backward compatible)
    const intelligence = new IntelligenceService(context, memory, entity);

    const briefing = await intelligence.assembleBriefing({
      task: 'Prepare for meeting with Jane',
      paths,
    });

    assert.ok(briefing.markdown.includes('Primitive Briefing'));
    assert.ok(briefing.assembledAt);
    assert.ok(briefing.context);
    // No email context files should be present
    const emailFiles = briefing.context.files.filter(f => f.path.startsWith('email:'));
    assert.equal(emailFiles.length, 0);
  });

  it('assembleBriefing works with null emailProvider', async () => {
    const storage = new FileStorageAdapter();
    const search = getSearchProvider(tmpDir);
    const context = new ContextService(storage, search);
    const memory = new MemoryService(storage, search);
    const entity = new EntityService(storage);

    // Explicit null emailProvider
    const intelligence = new IntelligenceService(context, memory, entity, null);

    const briefing = await intelligence.assembleBriefing({
      task: 'Prepare for meeting with Jane',
      paths,
    });

    assert.ok(briefing.markdown.includes('Primitive Briefing'));
    const emailFiles = briefing.context.files.filter(f => f.path.startsWith('email:'));
    assert.equal(emailFiles.length, 0);
  });

  it('assembleBriefing includes email context when emailProvider is available', async () => {
    // Create a person entity with an email so the email search triggers
    writeFile(tmpDir, 'people/internal/jane-smith.md', [
      '---',
      'name: Jane Smith',
      'email: jane@example.com',
      'role: PM',
      'company: Acme',
      'category: internal',
      '---',
      '',
      '# Jane Smith',
      '',
      'Product Manager at Acme.',
    ].join('\n'));

    const storage = new FileStorageAdapter();
    const search = getSearchProvider(tmpDir);
    const context = new ContextService(storage, search);
    const memory = new MemoryService(storage, search);
    const entity = new EntityService(storage);
    const emailProvider = createMockEmailProvider(SAMPLE_THREADS);

    const intelligence = new IntelligenceService(context, memory, entity, emailProvider);

    const briefing = await intelligence.assembleBriefing({
      task: 'Prepare for meeting with Jane Smith',
      paths,
    });

    // Email context files should be present
    const emailFiles = briefing.context.files.filter(f => f.path.startsWith('email:'));
    assert.ok(emailFiles.length > 0, 'Should have email context files');
    assert.ok(
      emailFiles.some(f => f.summary?.includes('Roadmap Q2 Discussion')),
      'Should include thread subject in summary',
    );
  });

  it('assembleBriefing skips email when no entities have emails', async () => {
    // Create a person entity WITHOUT an email
    writeFile(tmpDir, 'people/internal/bob-jones.md', [
      '---',
      'name: Bob Jones',
      'role: Engineer',
      'category: internal',
      '---',
      '',
      '# Bob Jones',
      '',
      'Engineer on the platform team.',
    ].join('\n'));

    let searchCalled = false;
    const emailProvider: EmailProvider = {
      name: 'mock-gmail',
      async isAvailable() { return true; },
      async searchThreads() {
        searchCalled = true;
        return [];
      },
      async getThread() { throw new Error('not implemented'); },
      async getImportantUnread() { return []; },
    };

    const storage = new FileStorageAdapter();
    const search = getSearchProvider(tmpDir);
    const context = new ContextService(storage, search);
    const memory = new MemoryService(storage, search);
    const entity = new EntityService(storage);

    const intelligence = new IntelligenceService(context, memory, entity, emailProvider);

    const briefing = await intelligence.assembleBriefing({
      task: 'Prepare for meeting with Bob Jones',
      paths,
    });

    assert.ok(briefing.markdown.includes('Primitive Briefing'));
    // searchThreads should NOT have been called since Bob has no email
    assert.equal(searchCalled, false, 'Should not search emails for entities without email addresses');
    const emailFiles = briefing.context.files.filter(f => f.path.startsWith('email:'));
    assert.equal(emailFiles.length, 0);
  });
});
