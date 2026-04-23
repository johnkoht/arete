import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatEvent,
  parseEvent,
  parseLog,
  appendEvent,
  appendEvents,
  encodeValue,
  decodeValue,
  nowIsoSeconds,
} from '../../src/utils/memory-log.js';

// ---------------------------------------------------------------------------
// formatEvent
// ---------------------------------------------------------------------------

describe('formatEvent', () => {
  it('formats a simple event with no fields', () => {
    const line = formatEvent({
      timestamp: '2026-04-23T00:30:15Z',
      event: 'refresh',
      fields: {},
    });
    assert.strictEqual(line, '## [2026-04-23T00:30:15Z] refresh');
  });

  it('formats fields in alphabetical key order (idempotency)', () => {
    const line = formatEvent({
      timestamp: '2026-04-23T00:30:15Z',
      event: 'ingest',
      fields: { topic: 'cover-whale', source: 'meetings/m.md' },
    });
    // Keys sorted: source, topic
    assert.ok(line.includes('source=meetings%2Fm.md topic=cover-whale'));
  });

  it('URL-encodes values to preserve grammar under pipes/newlines', () => {
    const line = formatEvent({
      timestamp: '2026-04-23T00:30:15Z',
      event: 'failure',
      fields: { error: 'rate limit | status=429\ntraceback', target: 'x' },
    });
    assert.ok(!line.includes('| status'), 'raw pipe must not appear in value');
    assert.ok(!line.includes('\n'), 'newline must not appear in encoded value');
    assert.ok(line.includes('error='));
  });

  it('rejects invalid event kinds', () => {
    assert.throws(() =>
      formatEvent({
        timestamp: '2026-04-23T00:30:15Z',
        event: 'Invalid_Event',
        fields: {},
      }),
    );
    assert.throws(() =>
      formatEvent({
        timestamp: '2026-04-23T00:30:15Z',
        event: '',
        fields: {},
      }),
    );
  });

  it('rejects invalid timestamps', () => {
    assert.throws(() =>
      formatEvent({
        timestamp: '2026-04-23 00:30:15',
        event: 'refresh',
        fields: {},
      }),
    );
    assert.throws(() =>
      formatEvent({
        timestamp: '2026-04-23T00:30:15.123Z', // millisecond precision not allowed
        event: 'refresh',
        fields: {},
      }),
    );
  });

  it('rejects invalid field keys', () => {
    assert.throws(() =>
      formatEvent({
        timestamp: '2026-04-23T00:30:15Z',
        event: 'x',
        fields: { 'BadKey': 'v' },
      }),
    );
    assert.throws(() =>
      formatEvent({
        timestamp: '2026-04-23T00:30:15Z',
        event: 'x',
        fields: { '123': 'v' },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// parseEvent
// ---------------------------------------------------------------------------

describe('parseEvent', () => {
  it('parses a simple event', () => {
    const parsed = parseEvent('## [2026-04-23T00:30:15Z] refresh');
    assert.deepStrictEqual(parsed, {
      timestamp: '2026-04-23T00:30:15Z',
      event: 'refresh',
      fields: {},
    });
  });

  it('parses an event with fields', () => {
    const parsed = parseEvent('## [2026-04-23T00:30:15Z] ingest | source=meetings%2Fm.md topic=cover-whale');
    assert.deepStrictEqual(parsed, {
      timestamp: '2026-04-23T00:30:15Z',
      event: 'ingest',
      fields: { source: 'meetings/m.md', topic: 'cover-whale' },
    });
  });

  it('returns null for non-event lines', () => {
    assert.strictEqual(parseEvent(''), null);
    assert.strictEqual(parseEvent('# Memory Log'), null);
    assert.strictEqual(parseEvent('  some detail'), null);
    assert.strictEqual(parseEvent('## Without bracket'), null);
    assert.strictEqual(parseEvent('## [not-a-timestamp] refresh'), null);
    assert.strictEqual(parseEvent('## [2026-04-23T00:30:15Z] Bad_Event'), null);
  });

  it('round-trips all formatEvent outputs', () => {
    const events = [
      { timestamp: '2026-04-23T00:30:15Z', event: 'ingest', fields: { topic: 'x', source: 'y' } },
      { timestamp: '2026-04-23T00:30:16Z', event: 'refresh', fields: {} },
      { timestamp: '2026-04-23T00:30:17Z', event: 'failure', fields: { error: 'oh no | stuff\nhappened', target: 'z' } },
      { timestamp: '2026-04-23T00:30:18Z', event: 'lint', fields: { findings: '3', by_kind: 'orphan:1,stale:2' } },
    ];
    for (const e of events) {
      const line = formatEvent(e);
      const parsed = parseEvent(line);
      assert.deepStrictEqual(parsed, e, `round-trip failed for: ${JSON.stringify(e)}`);
    }
  });

  it('tolerates malformed tokens by skipping them (lenient parser)', () => {
    // `noequals` has no =; `=novalue` has no key
    const parsed = parseEvent('## [2026-04-23T00:30:15Z] ingest | noequals valid=ok =novalue');
    assert.deepStrictEqual(parsed, {
      timestamp: '2026-04-23T00:30:15Z',
      event: 'ingest',
      fields: { valid: 'ok' },
    });
  });
});

// ---------------------------------------------------------------------------
// parseLog (full file)
// ---------------------------------------------------------------------------

describe('parseLog', () => {
  it('parses multiple events ignoring header and detail blocks', () => {
    const content = `# Memory Log

> intro prose

## [2026-04-23T00:30:00Z] refresh | scope=all

some detail block line

## [2026-04-23T00:31:00Z] ingest | source=a topic=b
`;
    const events = parseLog(content);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].event, 'refresh');
    assert.strictEqual(events[1].event, 'ingest');
  });

  it('returns empty for empty or preamble-only content', () => {
    assert.deepStrictEqual(parseLog(''), []);
    assert.deepStrictEqual(parseLog('# Memory Log\n\nJust intro.\n'), []);
  });
});

// ---------------------------------------------------------------------------
// appendEvent / appendEvents
// ---------------------------------------------------------------------------

describe('appendEvent', () => {
  it('initializes with header when no existing content', () => {
    const out = appendEvent(null, {
      timestamp: '2026-04-23T00:30:15Z',
      event: 'refresh',
      fields: {},
    });
    assert.match(out, /^# Memory Log\n/);
    assert.ok(out.endsWith('## [2026-04-23T00:30:15Z] refresh\n'));
  });

  it('appends to existing content preserving prior events', () => {
    const first = appendEvent(null, {
      timestamp: '2026-04-23T00:30:15Z',
      event: 'refresh',
      fields: {},
    });
    const second = appendEvent(first, {
      timestamp: '2026-04-23T00:30:16Z',
      event: 'ingest',
      fields: { topic: 'x' },
    });
    const events = parseLog(second);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].event, 'refresh');
    assert.strictEqual(events[1].event, 'ingest');
  });

  it('does not duplicate the header on subsequent appends', () => {
    let content = appendEvent(null, { timestamp: '2026-04-23T00:30:15Z', event: 'a', fields: {} });
    content = appendEvent(content, { timestamp: '2026-04-23T00:30:16Z', event: 'b', fields: {} });
    content = appendEvent(content, { timestamp: '2026-04-23T00:30:17Z', event: 'c', fields: {} });
    const headerCount = (content.match(/^# Memory Log$/gm) ?? []).length;
    assert.strictEqual(headerCount, 1);
  });

  it('normalizes trailing newlines to single \\n between appends', () => {
    const bad = '# Memory Log\n\n## [2026-04-23T00:30:15Z] a\n\n\n';
    const out = appendEvent(bad, { timestamp: '2026-04-23T00:30:16Z', event: 'b', fields: {} });
    assert.ok(!out.includes('\n\n\n'));
  });
});

describe('appendEvents', () => {
  it('is equivalent to successive appendEvent calls', () => {
    const events = [
      { timestamp: '2026-04-23T00:30:15Z', event: 'a', fields: {} },
      { timestamp: '2026-04-23T00:30:16Z', event: 'b', fields: { k: 'v' } },
    ];
    const batch = appendEvents(null, events);
    let oneByOne: string | null = null;
    for (const e of events) {
      oneByOne = appendEvent(oneByOne, e);
    }
    assert.strictEqual(batch, oneByOne);
  });

  it('is a no-op for empty event list', () => {
    assert.strictEqual(appendEvents('existing', []), 'existing');
    assert.strictEqual(appendEvents(null, []), '');
  });
});

// ---------------------------------------------------------------------------
// encodeValue / decodeValue
// ---------------------------------------------------------------------------

describe('encodeValue / decodeValue', () => {
  it('round-trips adversarial payloads', () => {
    const payloads = [
      'simple',
      'has space',
      'has | pipe',
      'has = equals',
      'has\nnewline',
      'has\ttab',
      'has unicode 🚀 and "quotes"',
      '../../etc/passwd',
      '',
    ];
    for (const raw of payloads) {
      const encoded = encodeValue(raw);
      assert.ok(!encoded.includes('|'), `encoded value must not contain raw pipe: "${encoded}"`);
      assert.ok(!encoded.includes('\n'), `encoded value must not contain raw newline`);
      assert.ok(!encoded.includes(' '), `encoded value must not contain raw space`);
      assert.strictEqual(decodeValue(encoded), raw);
    }
  });
});

// ---------------------------------------------------------------------------
// nowIsoSeconds
// ---------------------------------------------------------------------------

describe('nowIsoSeconds', () => {
  it('formats injected Date at seconds precision', () => {
    const d = new Date('2026-04-23T00:30:15.987Z');
    assert.strictEqual(nowIsoSeconds(d), '2026-04-23T00:30:15Z');
  });

  it('default argument works without blowing up', () => {
    const out = nowIsoSeconds();
    assert.match(out, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});
