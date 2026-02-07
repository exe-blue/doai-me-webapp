'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseSupabaseRealtimeOptions<T extends Record<string, unknown>> {
  /** Whether the subscription is active */
  enabled: boolean;
  /** Postgres change event to listen for (default: '*') */
  event?: PostgresChangeEvent;
  /** Filter expression (e.g. 'status=eq.PENDING') */
  filter?: string;
  /** Callback when data arrives */
  onData: (payload: RealtimePostgresChangesPayload<T>) => void;
}

/**
 * Reusable hook for Supabase Realtime subscriptions on a table.
 *
 * Creates/removes a Supabase channel when `enabled` toggles.
 * Cleans up subscription on unmount.
 */
export function useSupabaseRealtime<T extends Record<string, unknown>>(
  table: string,
  options: UseSupabaseRealtimeOptions<T>,
) {
  const { enabled, event = '*', filter, onData } = options;
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onDataRef = useRef(onData);

  // Keep callback ref up to date without re-subscribing
  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    if (!enabled) {
      // Cleanup if disabled
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      return;
    }

    const supabase = createClient();
    const channelName = `realtime-${table}-${event}-${filter || 'all'}`;

    const channelConfig: {
      event: PostgresChangeEvent;
      schema: string;
      table: string;
      filter?: string;
    } = {
      event,
      schema: 'public',
      table,
    };

    if (filter) {
      channelConfig.filter = filter;
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as const,
        channelConfig,
        (payload: RealtimePostgresChangesPayload<T>) => {
          onDataRef.current(payload);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [enabled, table, event, filter]);
}
