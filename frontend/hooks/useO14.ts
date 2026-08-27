'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchO14Dashboard,
  fetchO14History,
  postO14Apply,
  postO14Optimize,
  postO14Rollback,
  postO14SafeMode,
  postO14Verify,
} from '@/lib/hvac/o14Api';

import { LIVE_POLL_MS } from '@/lib/hvac/poll';

const DASH = ['o14', 'dashboard'] as const;

export function useO14Dashboard() {
  return useQuery({ queryKey: DASH, queryFn: fetchO14Dashboard, refetchInterval: LIVE_POLL_MS });
}

export function useO14History(hours: number) {
  return useQuery({
    queryKey: ['o14', 'history', hours],
    queryFn: () => fetchO14History(hours),
    refetchInterval: false,
    staleTime: 30_000,
  });
}

export function useO14Mutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['o14'] });
  return {
    optimize: useMutation({ mutationFn: postO14Optimize, onSettled: invalidate }),
    apply: useMutation({ mutationFn: ({ id, confirm }: { id: string; confirm: boolean }) => postO14Apply(id, confirm), onSettled: invalidate }),
    verify: useMutation({ mutationFn: postO14Verify, onSettled: invalidate }),
    rollback: useMutation({ mutationFn: postO14Rollback, onSettled: invalidate }),
    safeMode: useMutation({ mutationFn: postO14SafeMode, onSettled: invalidate }),
  };
}
