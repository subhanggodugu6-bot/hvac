'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchPlatformShell } from '@/lib/hvac/platformQueries';

/** Warm shared platform cache once on app load so every page reuses the same payload. */
export function PlatformBootstrap() {
  const qc = useQueryClient();

  useEffect(() => {
    prefetchPlatformShell(qc);
  }, [qc]);

  return null;
}
