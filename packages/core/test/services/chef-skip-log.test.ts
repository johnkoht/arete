/**
 * Tests for appendChefSkipLog (phase-10-followup-2 Step 3).
 *
 * Validates the Phase-9-shape audit log writer:
 *   ${ISO} chef-skip ${JSON.stringify(payload)}\n
 *
 * Real tmp dir; line-by-line read-back; awk-strip + JSON.parse round-trip
 * (matches the documented M1 grep recipes from the plan).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendChefSkipLog } from '../../src/services/chef-skip-log.js';

describe('appendChefSkipLog — phase-10-followup-2 Step 3', () => {
  let workspaceRoot: string;
  let logPath: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'arete-chef-skip-log-'));
    logPath = join(workspaceRoot, 'dev', 'diary', 'chef-skip-log.md');
  });

  afterEach(() => {
    if (workspaceRoot && existsSync(workspaceRoot)) {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('creates dev/diary/ directory + writes one line for a SKIP event', async () => {
    await appendChefSkipLog(workspaceRoot, {
      action: 'SKIP',
      id: 'ai_0042',
      meeting: 'john-jamie-2026-06-04',
      setBy: 'chef',
      reason: 'already fulfilled via slack-dm',
      evidence: 'Slack DM → Jamie Burk, 2026-06-04',
    });

    const raw = readFileSync(logPath, 'utf8');
    const lines = raw.trimEnd().split('\n');
    assert.equal(lines.length, 1);

    // Format: ${ISO} chef-skip ${JSON}
    const m = lines[0].match(/^(\S+) chef-skip (\{.*\})$/);
    assert.ok(m, `line did not match expected shape: ${lines[0]}`);
    const [, iso, jsonStr] = m;
    assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    const payload = JSON.parse(jsonStr) as Record<string, unknown>;
    assert.equal(payload['action'], 'SKIP');
    assert.equal(payload['id'], 'ai_0042');
    assert.equal(payload['setBy'], 'chef');
  });

  it('appends multiple lines without clobbering', async () => {
    await appendChefSkipLog(workspaceRoot, { action: 'SKIP', id: 'ai_0042' });
    await appendChefSkipLog(workspaceRoot, { action: 'PROPOSE', id: 'ai_0099' });
    await appendChefSkipLog(workspaceRoot, { action: 'CONFIRM', id: 'ai_0099' });

    const raw = readFileSync(logPath, 'utf8');
    const lines = raw.trimEnd().split('\n');
    assert.equal(lines.length, 3);

    // All 3 actions present in order.
    const actions = lines.map((line) => {
      const m = line.match(/chef-skip (\{.*\})/);
      if (!m) return null;
      return (JSON.parse(m[1]) as Record<string, unknown>)['action'];
    });
    assert.deepEqual(actions, ['SKIP', 'PROPOSE', 'CONFIRM']);
  });

  it('preserves arbitrary payload fields verbatim', async () => {
    await appendChefSkipLog(workspaceRoot, {
      action: 'ABSTAIN',
      id: 'ai_0055',
      meeting: 'john-greg-2026-06-04',
      mtimeAgeSec: 27,
      customField: 'preserved-as-is',
      nested: { also: 'preserved' },
    });

    const raw = readFileSync(logPath, 'utf8');
    const m = raw.trimEnd().match(/chef-skip (\{.*\})/);
    assert.ok(m);
    const payload = JSON.parse(m[1]) as Record<string, unknown>;
    assert.equal(payload['mtimeAgeSec'], 27);
    assert.equal(payload['customField'], 'preserved-as-is');
    assert.deepEqual(payload['nested'], { also: 'preserved' });
  });

  it('all 6 action types serialize cleanly', async () => {
    const actions = ['SKIP', 'PROPOSE', 'UNSKIP', 'CONFIRM', 'ABSTAIN', 'APPLY-SKIP'] as const;
    for (const action of actions) {
      await appendChefSkipLog(workspaceRoot, { action });
    }

    const raw = readFileSync(logPath, 'utf8');
    const lines = raw.trimEnd().split('\n');
    assert.equal(lines.length, 6);
    const parsedActions = lines.map((line) => {
      const m = line.match(/chef-skip (\{.*\})/);
      return m ? (JSON.parse(m[1]) as Record<string, unknown>)['action'] : null;
    });
    assert.deepEqual(parsedActions, [...actions]);
  });

  it('best-effort: invalid workspace path does NOT throw', async () => {
    // Cannot mkdir /etc/<nonsense>/dev/diary on a real fs — this would
    // throw inside appendChefSkipLog, but the function swallows errors
    // so the chef SKILL.md / apply flow never blocks on audit failures.
    await assert.doesNotReject(
      appendChefSkipLog('/etc/this-cannot-be-created-by-tests', {
        action: 'SKIP',
        id: 'ai_doesnt-matter',
      }),
    );
  });

  it('M1 awk-strip recipe round-trips through JSON.parse', async () => {
    // Documented in plan §"Audit log" M1 recipe:
    //   awk '{$1=$2=""; sub(/^  /, ""); print}' chef-skip-log.md | jq -c '.'
    // Simulate it here using JS string ops.
    await appendChefSkipLog(workspaceRoot, {
      action: 'SKIP',
      id: 'ai_0042',
      reason: 'with "quotes" and spaces',
    });

    const raw = readFileSync(logPath, 'utf8');
    const line = raw.trimEnd();
    // Drop ISO + "chef-skip" prefix (positions 1 and 2 in awk's sense).
    const tokens = line.split(' ');
    const jsonPart = tokens.slice(2).join(' ');
    const parsed = JSON.parse(jsonPart) as Record<string, unknown>;
    assert.equal(parsed['action'], 'SKIP');
    assert.equal(parsed['reason'], 'with "quotes" and spaces');
  });
});
