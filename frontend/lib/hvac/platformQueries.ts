'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiJson, hvacFetch } from '@/lib/api/client';
import type { DashboardHome } from '@/lib/hvac/dashboardHome';
import { PLATFORM_POLL_MS } from '@/lib/hvac/poll';

/** Match backend HVAC_DASHBOARD_CACHE_SECONDS (default 60). */
export const DASHBOARD_STALE_MS = 60_000;
export const STATUS_STALE_MS = 8_000;

export const platformKeys = {
  status: ['platform', 'status'] as const,
  dashboardHome: ['dashboard-home'] as const,
  telemetry: ['platform', 'telemetry'] as const,
};

export async function fetchPlatformStatus(): Promise<Record<string, unknown>> {
  return apiJson('/platform/status');
}

export async function fetchDashboardHome(): Promise<DashboardHome> {
  const res = await hvacFetch('/api/platform/dashboard/home');
  if (!res.ok) throw new Error('DATA SOURCE ERROR');
  return res.json();
}

export async function fetchPlatformTelemetry(): Promise<{ points?: Record<string, unknown>[] }> {
  try {
    return await apiJson('/platform/telemetry');
  } catch {
    return { points: [] };
  }
}

export function prefetchPlatformShell(qc: QueryClient) {
  void qc.prefetchQuery({
    queryKey: platformKeys.status,
    queryFn: fetchPlatformStatus,
    staleTime: STATUS_STALE_MS,
  });
  void qc.prefetchQuery({
    queryKey: platformKeys.dashboardHome,
    queryFn: fetchDashboardHome,
    staleTime: DASHBOARD_STALE_MS,
  });
}

export function usePlatformStatusQuery(enabled = true) {
  return useQuery({
    queryKey: platformKeys.status,
    queryFn: fetchPlatformStatus,
    enabled,
    refetchInterval: STATUS_STALE_MS,
    staleTime: STATUS_STALE_MS,
    retry: 1,
  });
}

export function useDashboardHomeQuery() {
  return useQuery({
    queryKey: platformKeys.dashboardHome,
    queryFn: fetchDashboardHome,
    refetchInterval: PLATFORM_POLL_MS,
    staleTime: DASHBOARD_STALE_MS,
    gcTime: 5 * 60_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(2000 * (attempt + 1), 8000),
  });
}

export function usePrefetchOnHover() {
  const qc = useQueryClient();
  return (href: string) => {
    if (href === '/overview' || href === '/agents' || href.startsWith('/agents/')) {
      void qc.prefetchQuery({
        queryKey: platformKeys.dashboardHome,
        queryFn: fetchDashboardHome,
        staleTime: DASHBOARD_STALE_MS,
      });
    }
    if (href.startsWith('/platform/')) {
      prefetchPlatformShell(qc);
    }
  };
}
