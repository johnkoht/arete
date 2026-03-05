/**
 * Base fetch wrapper for the Areté backend API.
 *
 * Reads VITE_API_URL env var; defaults to http://localhost:3847.
 * Throws an Error with the backend's `error` message on non-2xx responses.
 */

export const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3847';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
