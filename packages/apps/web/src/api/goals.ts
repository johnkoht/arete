/**
 * API functions for the Goals Alignment page.
 */

import { apiFetch, BASE_URL } from './client.js';
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

// ── Goal list for action item linking ────────────────────────────────────────

export type GoalSummary = {
  id: string;
  title: string;
  status: string;
  quarter: string;
};

export type GoalsListResponse = {
  goals: GoalSummary[];
  found: boolean;
};

/** GET /api/goals/list — all goals with metadata (for action item linking) */
export async function fetchGoalsList(): Promise<GoalSummary[]> {
  const res = await fetch(`${BASE_URL}/api/goals/list`);
  if (!res.ok) {
    throw new Error(`Failed to fetch goals: ${res.status}`);
  }
  const data = (await res.json()) as GoalsListResponse;
  // Filter to active goals only
  return data.goals.filter(g => g.status === 'active');
}
