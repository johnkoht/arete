/**
 * Tests for src/core/meeting-agenda-templates.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import {
  listMeetingAgendaTemplates,
  getMeetingAgendaTemplate,
  type MeetingAgendaTemplate
} from '../../src/core/meeting-agenda-templates.js';

function createTmpDir(): string {
  const dir = join(
    tmpdir(),
    `arete-test-agenda-tpl-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('meeting-agenda-templates', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = createTmpDir();
  });

  afterEach(() => {
    if (workspaceRoot && existsSync(workspaceRoot)) {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  describe('listMeetingAgendaTemplates', () => {
    it('returns default and custom keys when no custom dir exists', async () => {
      const result = await listMeetingAgendaTemplates(workspaceRoot);
      assert.ok(Array.isArray(result.default));
      assert.ok(Array.isArray(result.custom));
      assert.equal(result.custom.length, 0);
    });

    it('returns five default templates when package default dir exists', async () => {
      const result = await listMeetingAgendaTemplates(workspaceRoot);
      assert.ok(result.default.length >= 5, 'expected at least 5 default templates');
      const types = result.default.map((t) => t.type);
      assert.ok(types.includes('leadership'));
      assert.ok(types.includes('customer'));
      assert.ok(types.includes('dev-team'));
      assert.ok(types.includes('one-on-one'));
      assert.ok(types.includes('other'));
    });

    it('returns custom templates when .arete/templates/meeting-agendas has markdown files', async () => {
      const customDir = join(workspaceRoot, '.arete', 'templates', 'meeting-agendas');
      mkdirSync(customDir, { recursive: true });
      writeFileSync(
        join(customDir, 'board-meeting.md'),
        `---
name: Board Meeting
type: board-meeting
description: Quarterly board meeting agenda
time_allocation:
  Updates: 25
  Decisions: 40
---
## Updates
- Brief updates from each lead

## Decisions
- Key decisions requiring board approval
`
      );
      const result = await listMeetingAgendaTemplates(workspaceRoot);
      assert.equal(result.custom.length, 1);
      assert.equal(result.custom[0].type, 'board-meeting');
      assert.equal(result.custom[0].name, 'Board Meeting');
      assert.ok(result.custom[0].sections?.includes('Updates'));
      assert.ok(result.custom[0].sections?.includes('Decisions'));
      assert.equal(result.custom[0].timeAllocation?.Updates, 25);
    });
  });

  describe('getMeetingAgendaTemplate', () => {
    it('returns null for unknown type', async () => {
      const t = await getMeetingAgendaTemplate(workspaceRoot, 'unknown-type');
      assert.equal(t, null);
    });

    it('returns custom template when present in workspace', async () => {
      const customDir = join(workspaceRoot, '.arete', 'templates', 'meeting-agendas');
      mkdirSync(customDir, { recursive: true });
      writeFileSync(
        join(customDir, 'qbr.md'),
        `---
name: QBR
type: qbr
description: Quarterly business review
---
## Goals
## Metrics
`
      );
      const t = await getMeetingAgendaTemplate(workspaceRoot, 'qbr');
      assert.ok(t);
      assert.equal(t!.type, 'qbr');
      assert.equal(t!.name, 'QBR');
      assert.ok(t!.path.includes('qbr.md'));
      assert.ok(t!.sections?.includes('Goals'));
    });

    it('custom template overrides default for same type', async () => {
      const customDir = join(workspaceRoot, '.arete', 'templates', 'meeting-agendas');
      mkdirSync(customDir, { recursive: true });
      writeFileSync(
        join(customDir, 'leadership.md'),
        `---
name: Custom Leadership
type: leadership
description: Override default leadership template
---
## Custom Section
`
      );
      const t = await getMeetingAgendaTemplate(workspaceRoot, 'leadership');
      assert.ok(t);
      assert.equal(t!.name, 'Custom Leadership');
      assert.ok(t!.path.includes('.arete'));
      assert.ok(t!.sections?.includes('Custom Section'));
    });
  });
});
