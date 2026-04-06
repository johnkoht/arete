/**
 * Gmail provider — thin wrapper over the `gws` CLI for email operations.
 *
 * Gmail API command paths:
 *   gws gmail users messages list --params '{"userId":"me","q":"...","maxResults":N}'
 *   gws gmail users messages get  --params '{"userId":"me","id":"...","format":"metadata","metadataHeaders":["From","Subject","Date"]}'
 *
 * Note: messages.list returns only {id, threadId}. Full metadata requires a
 * separate messages.get call per message (capped at 10 to limit API calls).
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
  messages?: Array<{ id: string; threadId: string }>;
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

    // Step 1: List message IDs
    const listRaw = await gwsExec(
      'gmail',
      'users messages list',
      { userId: 'me', q: query, maxResults },
      undefined,
      this.deps,
    );

    const listResponse = listRaw as GmailListResponse;
    const messageIds = (listResponse.messages ?? [])
      .map((m) => m.id)
      .filter(Boolean)
      .slice(0, 10); // cap detail fetches to limit API calls

    if (messageIds.length === 0) return [];

    // Step 2: Fetch metadata for each message in parallel
    const messageResults = await Promise.all(
      messageIds.map((id) =>
        gwsExec(
          'gmail',
          'users messages get',
          { userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] },
          undefined,
          this.deps,
        ).catch(() => null),
      ),
    );

    return messageResults
      .filter((m): m is GmailMessage => m !== null && typeof m === 'object')
      .map(mapMessage);
  }

  async getThread(threadId: string): Promise<EmailThread> {
    const raw = await gwsExec(
      'gmail',
      'users messages get',
      { userId: 'me', id: threadId, format: 'full' },
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
