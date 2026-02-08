/**
 * Tests for src/commands/seed-test-data.ts
 *
 * Note: "test-data absent" case (dev-only message) is hard to test without
 * mocking getPackageRoot; it occurs when running from published npm package
 * which excludes test-data/. Manual verification: run from a non-linked install.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  existsSync,
  readFileSync,
  readdirSync
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { seedTestDataCommand } from '../../src/commands/seed-test-data.js';

describe('seedTestDataCommand', () => {
  let tmpWorkspace: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    tmpWorkspace = mkdtempSync(join(tmpdir(), 'seed-test-data-'));
    // Minimal arete workspace
    writeFileSync(join(tmpWorkspace, 'arete.yaml'), 'schema: 1\n');
    mkdirSync(join(tmpWorkspace, 'context'), { recursive: true });
    mkdirSync(join(tmpWorkspace, 'memory'), { recursive: true });
    mkdirSync(join(tmpWorkspace, '.cursor'), { recursive: true });
    mkdirSync(join(tmpWorkspace, 'resources', 'meetings'), { recursive: true });
    mkdirSync(join(tmpWorkspace, 'people', 'internal'), { recursive: true });
    mkdirSync(join(tmpWorkspace, 'people', 'customers'), { recursive: true });
    mkdirSync(join(tmpWorkspace, 'projects', 'active'), { recursive: true });
    process.chdir(tmpWorkspace);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmpWorkspace, { recursive: true, force: true });
  });

  it('exits with error when not in workspace', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'seed-empty-'));
    process.chdir(emptyDir);

    const origExit = process.exit;
    let exitCode: number | undefined;
    (process as unknown as { exit: typeof process.exit }).exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`exit ${exitCode}`);
    }) as typeof process.exit;

    try {
      await seedTestDataCommand({ json: true });
    } catch (e) {
      assert.ok((e as Error).message.includes('exit'));
    }
    process.exit = origExit;
    rmSync(emptyDir, { recursive: true, force: true });

    assert.equal(exitCode, 1);
  });

  it('seeds files when in workspace and test-data exists', async () => {
    await seedTestDataCommand({ json: false });

    const meetingsDir = join(tmpWorkspace, 'resources', 'meetings');
    const meetings = readdirSync(meetingsDir).filter((n) => n.endsWith('.md') && n !== 'index.md');
    assert.ok(meetings.length >= 5, `Expected at least 5 meeting files, got ${meetings.length}`);

    const peopleInternal = readdirSync(join(tmpWorkspace, 'people', 'internal')).filter((n) =>
      n.endsWith('.md')
    );
    const peopleCustomers = readdirSync(join(tmpWorkspace, 'people', 'customers')).filter((n) =>
      n.endsWith('.md')
    );
    assert.ok(peopleInternal.length >= 2, 'Expected at least 2 internal people');
    assert.ok(peopleCustomers.length >= 2, 'Expected at least 2 customer people');

    const goalsQuarter = join(tmpWorkspace, 'goals', 'quarter.md');
    const nowWeek = join(tmpWorkspace, 'now', 'week.md');
    assert.ok(existsSync(goalsQuarter), 'goals/quarter.md should exist');
    assert.ok(existsSync(nowWeek), 'now/week.md should exist');

    const testScenarios = join(tmpWorkspace, 'TEST-SCENARIOS.md');
    assert.ok(existsSync(testScenarios), 'TEST-SCENARIOS.md should be copied');
    const content = readFileSync(testScenarios, 'utf8');
    assert.ok(content.includes('Meeting Prep'), 'Should contain Meeting Prep section');

    const indexPath = join(meetingsDir, 'index.md');
    assert.ok(existsSync(indexPath), 'Meetings index should exist');
    const indexContent = readFileSync(indexPath, 'utf8');
    assert.ok(indexContent.includes('Product Review'), 'Index should list meetings');
  });

  it('outputs JSON when --json', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    await seedTestDataCommand({ json: true });

    console.log = origLog;
    const output = logs.join('\n');
    const parsed = JSON.parse(output);
    assert.equal(parsed.success, true);
    assert.ok(typeof parsed.meetings === 'number');
    assert.ok(typeof parsed.people === 'number');
    assert.ok(parsed.message?.includes('TEST-SCENARIOS'));
  });
});
