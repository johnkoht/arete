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
