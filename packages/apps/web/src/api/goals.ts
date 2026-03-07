/**
 * API functions for the Goals Alignment page.
 */

import { apiFetch } from './client.js';
import type { StrategyResponse, QuarterResponse, WeekResponse } from './types.js';

/** GET /api/goals/strategy — strategy content */
export async function fetchStrategy(): Promise<StrategyResponse> {
  return apiFetch<StrategyResponse>('/api/goals/strategy');
}

/** GET /api/goals/quarter — quarter outcomes */
export async function fetchQuarterGoals(): Promise<QuarterResponse> {
  return apiFetch<QuarterResponse>('/api/goals/quarter');
}

/** GET /api/goals/week — weekly priorities */
export async function fetchWeekGoals(): Promise<WeekResponse> {
  return apiFetch<WeekResponse>('/api/goals/week');
}

/** PATCH /api/goals/week/priority — toggle a priority's done state */
export async function patchWeekPriority(index: number, done: boolean): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/api/goals/week/priority', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index, done }),
  });
}
