'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchO15Dashboard,
  fetchO15History,
  postO15Apply,
  postO15Optimize,
  postO15Rollback,
  postO15SafeMode,
  postO15Verify,
} from '@/lib/hvac/o15Api';
import { historyPoints } from '@/lib/hvac/o15Format';
import { LIVE_POLL_MS } from '@/lib/hvac/poll';

const DASH = ['o15', 'dashboard'] as const;

export function useO15Dashboard() {
  return useQuery({
    queryKey: DASH,
    queryFn: fetchO15Dashboard,
    refetchInterval: (q) => (q.state.status === 'success' ? LIVE_POLL_MS : false),
  });
}

export function useO15History(hours: number, enabled = true) {
  return useQuery({
    queryKey: ['o15', 'history', hours],
    queryFn: () => fetchO15History(hours),
    refetchInterval: false,
    staleTime: 30_000,
    enabled,
    select: (d) => historyPoints(d),
  });
}

export function useO15Mutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['o15'] });
  return {
    optimize: useMutation({ mutationFn: postO15Optimize, onSettled: invalidate }),
    apply: useMutation({
      mutationFn: ({ id, confirm }: { id: string; confirm: boolean }) => postO15Apply(id, confirm),
      onSettled: invalidate,
    }),
    verify: useMutation({ mutationFn: postO15Verify, onSettled: invalidate }),
    rollback: useMutation({ mutationFn: postO15Rollback, onSettled: invalidate }),
    safeMode: useMutation({ mutationFn: postO15SafeMode, onSettled: invalidate }),
  };
}
