/**
 * Gmail provider — thin wrapper over the `gws` CLI for email operations.
 *
 * Implements `EmailProvider` interface using `gwsExec()` for CLI calls
 * and `detectGws()` for availability checks.
 */

import { gwsExec } from './client.js';
import { detectGws } from './detection.js';
import type { EmailThread, EmailProvider, GwsDeps } from './types.js';

// ---------------------------------------------------------------------------
// Response mapping helpers
// ---------------------------------------------------------------------------

type GmailHeader = { name: string; value: string };
type GmailPayload = { headers?: GmailHeader[] };
type GmailMessage = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPayload;
};
type GmailListResponse = {
  messages?: GmailMessage[];
};

function getHeader(payload: GmailPayload | undefined, name: string): string {
  if (!payload?.headers) return '';
  const header = payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value ?? '';
}

function mapMessage(msg: GmailMessage): EmailThread {
  const labels = msg.labelIds ?? [];
  return {
    id: msg.id ?? msg.threadId ?? '',
    subject: getHeader(msg.payload, 'Subject'),
    snippet: msg.snippet ?? '',
    from: getHeader(msg.payload, 'From'),
    date: getHeader(msg.payload, 'Date'),
    labels,
    unread: labels.includes('UNREAD'),
  };
}

// ---------------------------------------------------------------------------
// GmailProvider class
// ---------------------------------------------------------------------------

export class GmailProvider implements EmailProvider {
  readonly name = 'gmail';
  private deps?: GwsDeps;

  constructor(deps?: GwsDeps) {
    this.deps = deps;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await detectGws(this.deps);
      return result.installed && result.authenticated !== false;
    } catch {
      return false;
    }
  }

  async searchThreads(
    query: string,
    options?: { maxResults?: number },
  ): Promise<EmailThread[]> {
    const maxResults = options?.maxResults ?? 20;

    const raw = await gwsExec(
      'gmail',
      'messages',
      { q: query, maxResults, format: 'json' },
      undefined,
      this.deps,
    );

    // Defensive: handle various response shapes
    const response = raw as GmailListResponse | GmailMessage[] | GmailMessage;

    if (Array.isArray(response)) {
      return response.map(mapMessage);
    }

    if (response && typeof response === 'object' && 'messages' in response) {
      return (response.messages ?? []).map(mapMessage);
    }

    // Single message or unrecognized shape
    if (response && typeof response === 'object' && ('id' in response || 'threadId' in response)) {
      return [mapMessage(response as GmailMessage)];
    }

    return [];
  }

  async getThread(threadId: string): Promise<EmailThread> {
    const raw = await gwsExec(
      'gmail',
      'messages',
      { id: threadId, format: 'json' },
      undefined,
      this.deps,
    );

    return mapMessage(raw as GmailMessage);
  }

  async getImportantUnread(
    options?: { maxResults?: number },
  ): Promise<EmailThread[]> {
    return this.searchThreads(
      'is:important is:unread -category:promotions -category:social',
      options,
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getGmailProvider(deps?: GwsDeps): GmailProvider {
  return new GmailProvider(deps);
}
