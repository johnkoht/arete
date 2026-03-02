/**
 * Person memory signal collection, aggregation, rendering, and upsert.
 *
 * Extracted from entity.ts to keep the EntityService focused on entity
 * resolution while person-memory concerns live in their own module.
 */

import type { PersonStance, PersonActionItem } from './person-signals.js';
import type { RelationshipHealth } from './person-health.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersonMemorySignal {
  kind: 'ask' | 'concern';
  topic: string;
  date: string;
  source: string;
}

export interface AggregatedPersonSignal {
  topic: string;
  count: number;
  lastMentioned: string;
  sources: string[];
}

export interface RefreshPersonMemoryInternalOptions {
  personSlug?: string;
  minMentions: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUTO_PERSON_MEMORY_START = '<!-- AUTO_PERSON_MEMORY:START -->';
export const AUTO_PERSON_MEMORY_END = '<!-- AUTO_PERSON_MEMORY:END -->';

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export function normalizeSignalTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/^[\s:;,.!?-]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .slice(0, 120);
}

export function collectSignalsForPerson(
  content: string,
  personName: string,
  date: string,
  source: string,
): PersonMemorySignal[] {
  const signals: PersonMemorySignal[] = [];
  const lines = content.split('\n');
  const personLower = personName.toLowerCase();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();

    const mentionsPerson = lower.includes(personLower);
    if (!mentionsPerson) continue;

    const askMatch = trimmed.match(/\basked\s+(?:about|for|if)\s+(.+?)(?:[.?!]|$)/i);
    if (askMatch) {
      const topic = normalizeSignalTopic(askMatch[1]);
      if (topic.length > 2) {
        signals.push({ kind: 'ask', topic, date, source });
      }
    }

    const concernMatch = trimmed.match(/\b(?:concerned about|worried about|skeptical about|pushed back on)\s+(.+?)(?:[.?!]|$)/i);
    if (concernMatch) {
      const topic = normalizeSignalTopic(concernMatch[1]);
      if (topic.length > 2) {
        signals.push({ kind: 'concern', topic, date, source });
      }
    }

    const speakerMatch = trimmed.match(/^([^:]{2,80}):\s+(.+)$/);
    if (speakerMatch) {
      const speaker = speakerMatch[1].trim().toLowerCase();
      const speech = speakerMatch[2].trim();
      const speechLower = speech.toLowerCase();
      if (!speaker.includes(personLower)) continue;

      const speakerAskMatch = speech.match(/\b(?:can we|could we|what about|how about)\s+(.+?)(?:[.?!]|$)/i);
      if (speakerAskMatch) {
        const topic = normalizeSignalTopic(speakerAskMatch[1]);
        if (topic.length > 2) {
          signals.push({ kind: 'ask', topic, date, source });
        }
      }

      if (speechLower.includes('concerned about') || speechLower.includes('worried about')) {
        const topic = normalizeSignalTopic(
          speech
            .replace(/.*\b(?:concerned about|worried about)\b/i, '')
            .replace(/[.?!].*$/, ''),
        );
        if (topic.length > 2) {
          signals.push({ kind: 'concern', topic, date, source });
        }
      }
    }
  }

  return signals;
}

export function aggregateSignals(signals: PersonMemorySignal[], minMentions: number): {
  asks: AggregatedPersonSignal[];
  concerns: AggregatedPersonSignal[];
} {
  const asksByTopic = new Map<string, AggregatedPersonSignal>();
  const concernsByTopic = new Map<string, AggregatedPersonSignal>();

  for (const signal of signals) {
    const targetMap = signal.kind === 'ask' ? asksByTopic : concernsByTopic;
    const existing = targetMap.get(signal.topic);
    if (!existing) {
      targetMap.set(signal.topic, {
        topic: signal.topic,
        count: 1,
        lastMentioned: signal.date,
        sources: [signal.source],
      });
      continue;
    }

    existing.count += 1;
    if (signal.date > existing.lastMentioned) {
      existing.lastMentioned = signal.date;
    }
    if (!existing.sources.includes(signal.source)) {
      existing.sources.push(signal.source);
    }
  }

  const toSorted = (m: Map<string, AggregatedPersonSignal>): AggregatedPersonSignal[] =>
    [...m.values()]
      .filter((item) => item.count >= minMentions)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.lastMentioned.localeCompare(a.lastMentioned);
      });

  return {
    asks: toSorted(asksByTopic),
    concerns: toSorted(concernsByTopic),
  };
}

export function renderPersonMemorySection(
  asks: AggregatedPersonSignal[],
  concerns: AggregatedPersonSignal[],
  options?: {
    stances?: PersonStance[];
    actionItems?: PersonActionItem[];
    health?: RelationshipHealth;
  },
): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    AUTO_PERSON_MEMORY_START,
    '## Memory Highlights (Auto)',
    '',
    '> Auto-generated from meeting notes/transcripts. Do not edit manually.',
    '',
    `Last refreshed: ${today}`,
    '',
    '### Repeated asks',
  ];

  if (asks.length === 0) {
    lines.push('- None detected yet.');
  } else {
    for (const item of asks.slice(0, 8)) {
      lines.push(
        `- **${item.topic}** — mentioned ${item.count} times (last: ${item.lastMentioned}; sources: ${item.sources.slice(0, 3).join(', ')})`,
      );
    }
  }

  lines.push('', '### Repeated concerns');
  if (concerns.length === 0) {
    lines.push('- None detected yet.');
  } else {
    for (const item of concerns.slice(0, 8)) {
      lines.push(
        `- **${item.topic}** — mentioned ${item.count} times (last: ${item.lastMentioned}; sources: ${item.sources.slice(0, 3).join(', ')})`,
      );
    }
  }

  // Stances
  const stances = options?.stances ?? [];
  lines.push('', '### Stances');
  if (stances.length === 0) {
    lines.push('- None detected yet.');
  } else {
    for (const stance of stances) {
      lines.push(
        `- **${stance.topic}** — ${stance.direction}: ${stance.summary} (from: ${stance.source}, ${stance.date})`,
      );
    }
  }

  // Open Items (I owe them)
  const actionItems = options?.actionItems ?? [];
  const iOweThem = actionItems.filter((i) => i.direction === 'i_owe_them');
  const theyOweMe = actionItems.filter((i) => i.direction === 'they_owe_me');

  lines.push('', '### Open Items (I owe them)');
  if (iOweThem.length === 0) {
    lines.push('- None detected yet.');
  } else {
    for (const item of iOweThem) {
      lines.push(`- ${item.text} (from: ${item.source}, ${item.date})`);
    }
  }

  lines.push('', '### Open Items (They owe me)');
  if (theyOweMe.length === 0) {
    lines.push('- None detected yet.');
  } else {
    for (const item of theyOweMe) {
      lines.push(`- ${item.text} (from: ${item.source}, ${item.date})`);
    }
  }

  // Relationship Health
  const health = options?.health;
  lines.push('', '### Relationship Health');
  if (!health) {
    lines.push('- None detected yet.');
  } else {
    const lastMetStr = health.lastMet
      ? `${health.lastMet} (${health.daysSinceLastMet} days ago)`
      : 'Never';
    const statusMap: Record<string, string> = {
      active: 'Active',
      regular: 'Regular',
      cooling: 'Cooling',
      dormant: 'Dormant',
    };
    lines.push(`- Last met: ${lastMetStr}`);
    lines.push(`- Meetings: ${health.meetingsLast30Days} in last 30d, ${health.meetingsLast90Days} in last 90d`);
    lines.push(`- Open loops: ${health.openLoopCount}`);
    lines.push(`- Status: ${statusMap[health.indicator] ?? health.indicator}`);
  }

  lines.push('', AUTO_PERSON_MEMORY_END, '');
  return lines.join('\n');
}

export function extractPersonMemorySection(content: string): string | null {
  const startIndex = content.indexOf(AUTO_PERSON_MEMORY_START);
  const endIndex = content.indexOf(AUTO_PERSON_MEMORY_END);
  if (startIndex < 0 || endIndex <= startIndex) return null;

  const start = startIndex + AUTO_PERSON_MEMORY_START.length;
  const section = content.slice(start, endIndex).trim();
  return section.length > 0 ? section : null;
}

export function getPersonMemoryLastRefreshed(content: string): string | null {
  const section = extractPersonMemorySection(content);
  if (!section) return null;

  const match = section.match(/Last refreshed:\s*(\d{4}-\d{2}-\d{2})/i);
  return match ? match[1] : null;
}

export function isMemoryStale(lastRefreshed: string | null, ifStaleDays: number | undefined): boolean {
  if (!ifStaleDays || ifStaleDays <= 0) return true;
  if (!lastRefreshed) return true;

  const refreshedAt = new Date(lastRefreshed);
  if (Number.isNaN(refreshedAt.getTime())) return true;

  const now = new Date();
  const diffMs = now.getTime() - refreshedAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= ifStaleDays;
}

export function upsertPersonMemorySection(content: string, section: string): string {
  const startIndex = content.indexOf(AUTO_PERSON_MEMORY_START);
  const endIndex = content.indexOf(AUTO_PERSON_MEMORY_END);

  if (startIndex >= 0 && endIndex > startIndex) {
    const before = content.slice(0, startIndex).trimEnd();
    const after = content.slice(endIndex + AUTO_PERSON_MEMORY_END.length).trimStart();
    const joined = `${before}\n\n${section.trim()}\n\n${after}`.trimEnd();
    return joined + '\n';
  }

  const trimmed = content.trimEnd();
  return `${trimmed}\n\n${section.trim()}\n`;
}
