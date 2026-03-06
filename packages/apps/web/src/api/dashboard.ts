/**
 * API functions for the Dashboard page.
 */

import { apiFetch } from './client.js';
import type {
  CalendarTodayResponse,
  CommitmentsSummary,
  ProjectsResponse,
  MemoryRecentResponse,
} from './types.js';

/** GET /api/calendar/today — today's calendar events */
export async function fetchCalendarToday(): Promise<CalendarTodayResponse> {
  return apiFetch<CalendarTodayResponse>('/api/calendar/today');
}

/** GET /api/intelligence/commitments/summary — open/due/overdue counts */
export async function fetchCommitmentsSummary(): Promise<CommitmentsSummary> {
  return apiFetch<CommitmentsSummary>('/api/intelligence/commitments/summary');
}

/** GET /api/projects — active project list */
export async function fetchProjects(): Promise<ProjectsResponse> {
  return apiFetch<ProjectsResponse>('/api/projects');
}

/** GET /api/memory/recent?limit=5 — recent memory items */
export async function fetchRecentMemory(limit = 5): Promise<MemoryRecentResponse> {
  return apiFetch<MemoryRecentResponse>(`/api/memory/recent?limit=${limit}`);
}
