/**
 * Settings API — Anthropic API key management.
 */

import { apiFetch } from './client.js';

export type ApiKeyStatus = { configured: boolean; maskedKey: string | null };

export async function fetchApiKeyStatus(): Promise<ApiKeyStatus> {
  return apiFetch<ApiKeyStatus>('/api/settings/apikey');
}

export async function saveApiKey(key: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/api/settings/apikey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

export async function deleteApiKey(): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/api/settings/apikey', {
    method: 'DELETE',
  });
}
