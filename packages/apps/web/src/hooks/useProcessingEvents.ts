/**
 * SSE hook — subscribes to GET /api/events and invalidates TanStack Query
 * caches when a meeting:processed event fires.
 *
 * Features:
 * - Auto-reconnects with exponential backoff: 2s → 4s → 8s → 16s → 30s (cap)
 * - Shows a toast notification when a meeting is processed
 * - Cleans up the EventSource on unmount
 * - Mounts once at the App level; all pages benefit automatically
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BASE_URL } from '@/api/client.js';

const BACKOFF_STEPS = [2000, 4000, 8000, 16000, 30000];

type ProcessedEventData = {
  slug?: string;
};

type SyncedEventData = {
  slug?: string;
  detectedAt?: string;
};

type TaskChangedEventData = {
  file?: string;
};

export function useProcessingEvents(): void {
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;

      const es = new EventSource(`${BASE_URL}/api/events`);
      esRef.current = es;

      es.addEventListener('meeting:processed', (event: MessageEvent<string>) => {
        let slug = '';
        try {
          const data = JSON.parse(event.data) as ProcessedEventData;
          slug = data.slug ?? '';
        } catch {
          // ignore parse errors
        }

        // Invalidate affected query caches
        void queryClient.invalidateQueries({ queryKey: ['meetings'] });
        void queryClient.invalidateQueries({ queryKey: ['memory', 'recent'] });

        toast.success(slug ? `Meeting processed: ${slug}` : 'Meeting processed');

        // Reset backoff on successful event
        retryRef.current = 0;
      });

      es.addEventListener('meeting:synced', (event: MessageEvent<string>) => {
        let slug = '';
        try {
          const data = JSON.parse(event.data) as SyncedEventData;
          slug = data.slug ?? '';
        } catch {
          // ignore parse errors
        }

        // Invalidate meetings cache so newly synced meetings appear in the list
        void queryClient.invalidateQueries({ queryKey: ['meetings'] });

        toast.info(slug ? `New meeting synced: ${slug}` : 'New meeting synced');

        // Reset backoff on successful event
        retryRef.current = 0;
      });

      es.addEventListener('task:changed', (event: MessageEvent<string>) => {
        let file = '';
        try {
          const data = JSON.parse(event.data) as TaskChangedEventData;
          file = data.file ?? '';
        } catch {
          // ignore parse errors
        }

        // Invalidate task-related query caches
        void queryClient.invalidateQueries({ queryKey: ['review', 'pending'] });
        void queryClient.invalidateQueries({ queryKey: ['goals', 'week'] });
        void queryClient.invalidateQueries({ queryKey: ['commitments'] });

        toast.info(file ? `Tasks updated: ${file}` : 'Tasks updated');

        // Reset backoff on successful event
        retryRef.current = 0;
      });

      es.addEventListener('connected', () => {
        // Reset backoff on successful connection
        retryRef.current = 0;
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;

        if (unmountedRef.current) return;

        // Schedule reconnect with backoff
        const delay = BACKOFF_STEPS[Math.min(retryRef.current, BACKOFF_STEPS.length - 1)] ?? 30000;
        retryRef.current++;

        timerRef.current = setTimeout(() => {
          if (!unmountedRef.current) connect();
        }, delay);
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      esRef.current?.close();
      esRef.current = null;
    };
  }, [queryClient]);
}
