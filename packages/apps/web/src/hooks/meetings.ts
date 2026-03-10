/**
 * TanStack Query v5 hooks for all meeting-related data and mutations.
 *
 * v5 notes:
 *  - Use isPending (not isLoading) for mutations
 *  - refetchInterval receives query object: (query) => query.state.data?.status === 'running' ? 2000 : false
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchMeetings,
  fetchMeeting,
  syncKrisp,
  fetchJobStatus,
  patchItem,
  approveMeeting,
  processPeople,
  processMeeting,
  deleteMeeting,
} from '@/api/meetings.js';
import type { PatchItemParams } from '@/api/types.js';

// ── Read hooks ──────────────────────────────────────────────────────────────

/** Fetch all meeting summaries. Re-use cached data if available. */
export function useMeetings() {
  return useQuery({
    queryKey: ['meetings'],
    queryFn: fetchMeetings,
  });
}

/** Fetch a single full meeting by slug. */
export function useMeeting(slug: string) {
  return useQuery({
    queryKey: ['meeting', slug],
    queryFn: () => fetchMeeting(slug),
    enabled: !!slug,
  });
}

/**
 * Poll a background job every 2 s while it is running.
 * Stops polling (refetchInterval → false) once status is 'done' or 'error'.
 */
export function useJobStatus(jobId: string | null) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => fetchJobStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 2000 : false,
  });
}

// ── Mutation hooks ──────────────────────────────────────────────────────────

/**
 * Start a Krisp sync job.
 * Returns { jobId }. Caller should poll with useJobStatus then invalidate
 * the meetings list when the job completes.
 */
export function useSyncKrisp() {
  return useMutation({
    mutationFn: syncKrisp,
  });
}

/**
 * Approve or skip a single review item immediately (PATCH).
 * Invalidates the meeting query on success.
 */
export function useApproveItem(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: PatchItemParams) => patchItem(slug, params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meeting', slug] });
    },
  });
}

/**
 * Save & Approve a meeting — commits all approved items to memory (POST /approve).
 * Invalidates both the individual meeting AND the meetings list on success.
 */
export function useSaveApprove(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => approveMeeting(slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meeting', slug] });
      void queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
}

/**
 * Run arete meeting process --json for a meeting.
 * Returns synchronously with extracted people/metadata (no job polling needed).
 */
export function useProcessPeople(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => processPeople(slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meeting', slug] });
    },
  });
}

/**
 * Start the Pi SDK agent processing session for a meeting.
 * Returns { jobId }. Caller should open an SSE stream via EventSource.
 */
export function useProcessMeeting(slug: string) {
  return useMutation({
    mutationFn: (options?: { clearApproved?: boolean }) => processMeeting(slug, options),
  });
}

/**
 * Delete a meeting file.
 * Invalidates the meetings list on success.
 */
export function useDeleteMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => deleteMeeting(slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
}
