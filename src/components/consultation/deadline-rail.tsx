'use client';

import { useEffect, useState } from 'react';
import { copy } from '@/src/copy/pt-BR';
import type { ConsultationSnapshot } from '@/src/domain/types';
import { formatSeconds } from '../format';

type Props = Pick<ConsultationSnapshot, 'status' | 'startedAt' | 'deadlineAt' | 'finishedAt' | 'finishReason' | 'serverNow' | 'timeoutMs'>;

/**
 * The one bold element of the screen: how much of the 10 s window has passed. Anchored on the server
 * clock (serverNow) plus the time elapsed locally, so a wrong client clock cannot distort it.
 */
export function DeadlineRail({ status, startedAt, deadlineAt, finishedAt, finishReason, serverNow, timeoutMs }: Props) {
  const [elapsedMs, setElapsedMs] = useState(() => Math.min(timeoutMs, Math.max(0, serverNow - startedAt)));

  useEffect(() => {
    if (status === 'finished') return;
    const anchor = performance.now();
    const base = Math.max(0, serverNow - startedAt);
    const tick = () => setElapsedMs(Math.min(timeoutMs, base + (performance.now() - anchor)));
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [status, serverNow, startedAt, timeoutMs]);

  const totalSeconds = formatSeconds(timeoutMs, 0);
  const finishedElapsed = finishedAt !== null ? finishedAt - startedAt : deadlineAt - startedAt;
  const shown = status === 'finished' ? Math.min(timeoutMs, finishedElapsed) : elapsedMs;
  const percent = Math.min(100, (shown / timeoutMs) * 100);
  const label =
    status === 'finished'
      ? finishReason === 'all_responded'
        ? copy.consultation.finishedAll(formatSeconds(finishedElapsed))
        : copy.consultation.finishedDeadline(totalSeconds)
      : copy.consultation.rail(formatSeconds(shown), totalSeconds);

  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label={copy.consultation.railLabel}
        aria-valuemin={0}
        aria-valuemax={Math.round(timeoutMs / 1000)}
        aria-valuenow={Math.round(shown / 1000)}
        aria-valuetext={status === 'finished' ? label : `${Math.round(shown / 1000)} de ${totalSeconds} s`}
        className="h-3 w-full overflow-hidden rounded-control bg-slate-soft"
      >
        <div
          className={`h-full transition-[width] duration-100 ease-linear ${status === 'finished' && finishReason !== 'all_responded' ? 'bg-slate' : 'bg-mint'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}
