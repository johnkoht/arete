/**
 * Tests for src/commands/meeting.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { meetingAddCommand } from '../../src/commands/meeting.js';

describe('meetingAddCommand', () => {
  let tmpWorkspace: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    tmpWorkspace = mkdtempSync(join(tmpdir(), 'meeting-cmd-test-'));
    writeFileSync(join(tmpWorkspace, 'arete.yaml'), 'version: 1\n');
    mkdirSync(join(tmpWorkspace, 'resources', 'meetings'), { recursive: true });
    mkdirSync(join(tmpWorkspace, 'context'), { recursive: true });
    mkdirSync(join(tmpWorkspace, 'memory'), { recursive: true });
    mkdirSync(join(tmpWorkspace, '.cursor'), { recursive: true });
    process.chdir(tmpWorkspace);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmpWorkspace, { recursive: true, force: true });
  });

  it('fails when neither --file nor --stdin provided', async () => {
    const origExit = process.exit;
    let exitCode: number | undefined;
    (process as unknown as { exit: typeof process.exit }).exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`exit ${exitCode}`);
    }) as typeof process.exit;

    try {
      await meetingAddCommand({});
    } catch (e) {
      assert.ok((e as Error).message.includes('exit'));
    }
    process.exit = origExit;
    assert.equal(exitCode, 1);
  });

  it('saves meeting from --file and updates index', async () => {
    const meetingJson = join(tmpWorkspace, 'meeting.json');
    writeFileSync(
      meetingJson,
      JSON.stringify({
        title: 'Test Standup',
        date: '2026-02-06',
        summary: 'Daily standup notes.',
        transcript: 'Alice: Done. Bob: In progress.',
        url: 'https://example.com/recording',
      }),
      'utf8'
    );

    await meetingAddCommand({ file: meetingJson, json: false });

    const meetingsDir = join(tmpWorkspace, 'resources', 'meetings');
    const expectedPath = join(meetingsDir, '2026-02-06-test-standup.md');
    assert.ok(existsSync(expectedPath), 'Meeting file should exist');
    const content = readFileSync(expectedPath, 'utf8');
    assert.ok(content.includes('Test Standup'));
    assert.ok(content.includes('Daily standup notes.'));
    assert.ok(content.includes('Manual'));

    const indexPath = join(meetingsDir, 'index.md');
    assert.ok(existsSync(indexPath), 'Index should exist');
    const indexContent = readFileSync(indexPath, 'utf8');
    assert.ok(indexContent.includes('Test Standup'));
  });
});
