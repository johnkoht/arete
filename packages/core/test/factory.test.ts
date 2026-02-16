/**
 * Tests for createServices factory — verifies the service container
 * wires up all services with correct dependencies.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServices } from '../src/index.js';
import { ContextService } from '../src/services/context.js';
import { MemoryService } from '../src/services/memory.js';
import { EntityService } from '../src/services/entity.js';
import { IntelligenceService } from '../src/services/intelligence.js';
import { WorkspaceService } from '../src/services/workspace.js';
import { SkillService } from '../src/services/skills.js';
import { IntegrationService } from '../src/services/integrations.js';
import { FileStorageAdapter } from '../src/storage/file.js';
import { getDefaultConfig } from '../src/config.js';

describe('createServices', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'svc-factory-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns all expected service keys', async () => {
    const services = await createServices(tmpDir);
    const keys = Object.keys(services).sort();
    assert.deepStrictEqual(keys, [
      'context',
      'entity',
      'integrations',
      'intelligence',
      'memory',
      'search',
      'skills',
      'storage',
      'workspace',
    ]);
  });

  it('creates instances of the correct service types', async () => {
    const services = await createServices(tmpDir);
    assert.ok(services.storage instanceof FileStorageAdapter, 'storage is FileStorageAdapter');
    assert.ok(services.context instanceof ContextService, 'context is ContextService');
    assert.ok(services.memory instanceof MemoryService, 'memory is MemoryService');
    assert.ok(services.entity instanceof EntityService, 'entity is EntityService');
    assert.ok(services.intelligence instanceof IntelligenceService, 'intelligence is IntelligenceService');
    assert.ok(services.workspace instanceof WorkspaceService, 'workspace is WorkspaceService');
    assert.ok(services.skills instanceof SkillService, 'skills is SkillService');
    assert.ok(services.integrations instanceof IntegrationService, 'integrations is IntegrationService');
  });

  it('search provider has the expected interface', async () => {
    const services = await createServices(tmpDir);
    assert.ok(typeof services.search.name === 'string', 'search has name');
    assert.ok(typeof services.search.isAvailable === 'function', 'search has isAvailable');
    assert.ok(typeof services.search.search === 'function', 'search has search method');
    assert.ok(typeof services.search.semanticSearch === 'function', 'search has semanticSearch');
  });

  it('accepts an optional config override', async () => {
    const config = getDefaultConfig();
    const services = await createServices(tmpDir, { config });
    assert.ok(services.integrations instanceof IntegrationService);
  });

  it('services are functional — workspace.isWorkspace returns false for empty dir', async () => {
    const services = await createServices(tmpDir);
    const result = await services.workspace.isWorkspace(tmpDir);
    assert.strictEqual(result, false);
  });

  it('services are functional — entity.listPeople returns empty for empty workspace', async () => {
    const services = await createServices(tmpDir);
    const result = await services.entity.listPeople(null);
    assert.deepStrictEqual(result, []);
  });

  it('services are functional — skills.list returns empty for empty workspace', async () => {
    const services = await createServices(tmpDir);
    const result = await services.skills.list(tmpDir);
    assert.deepStrictEqual(result, []);
  });
});
