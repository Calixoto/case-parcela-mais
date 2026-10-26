'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ConsultationSnapshot } from '@/src/domain/types';

const MAX_FAILURES = 5;

/**
 * Follows a consultation until it is finished: one request at a time, scheduled with a chained
 * setTimeout (never setInterval), aborted on cleanup (Activity hides, Strict Mode double effects),
 * backing off 1 s → 2 s → 4 s on failures and giving up after five, with a manual retry.
 * The server reconciles a stuck consultation on every read, so a poll after the deadline always closes it.
 */
export function useConsultationSnapshot(initial: ConsultationSnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [failures, setFailures] = useState(0);
  const stalled = failures >= MAX_FAILURES;

  useEffect(() => {
    if (snapshot.status === 'finished' || stalled) return;
    const controller = new AbortController();
    const delay = failures === 0 ? snapshot.pollIntervalMs : Math.min(4_000, 1_000 * 2 ** (failures - 1));
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/consultations/${snapshot.id}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = (await response.json()) as ConsultationSnapshot;
        setSnapshot(next);
        setFailures(0);
      } catch {
        if (!controller.signal.aborted) setFailures((count) => count + 1);
      }
    }, delay);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [snapshot.id, snapshot.status, snapshot.pollIntervalMs, snapshot.serverNow, failures, stalled]);

  const retry = useCallback(() => setFailures(0), []);

  return { snapshot, stalled, retry };
}
