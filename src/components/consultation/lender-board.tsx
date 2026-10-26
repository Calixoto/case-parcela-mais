import { copy } from '@/src/copy/pt-BR';
import { formatBRL } from '@/src/domain/money';
import type { LenderResult, LenderStatus } from '@/src/domain/types';
import { formatRatePercent, formatSeconds } from '../format';

const badge: Record<LenderStatus, { readonly glyph: string; readonly className: string }> = {
  querying: { glyph: '●', className: 'bg-amber-soft text-amber' },
  approved: { glyph: '✓', className: 'bg-mint-soft text-mint' },
  refused: { glyph: '—', className: 'bg-brick-soft text-brick' },
  unavailable: { glyph: '◷', className: 'bg-slate-soft text-slate' },
};

export function StatusBadge({ status }: { readonly status: LenderStatus }) {
  const { glyph, className } = badge[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-control px-2 py-1 text-sm font-medium ${className}`}>
      <span aria-hidden className={status === 'querying' ? 'animate-pulse' : undefined}>
        {glyph}
      </span>
      {copy.status[status]}
    </span>
  );
}

function detail(lender: LenderResult, treatmentAmountCents: number, timeoutMs: number): string {
  if (lender.status === 'approved' && lender.approvedAmountCents !== null && lender.monthlyRate !== null) {
    const rate = formatRatePercent(lender.monthlyRate);
    if (lender.approvedAmountCents >= treatmentAmountCents) return copy.consultation.approvedFull(rate);
    const percent = Math.floor((lender.approvedAmountCents * 100) / treatmentAmountCents);
    return copy.consultation.approvedPartial(percent, formatBRL(lender.approvedAmountCents), rate);
  }
  if (lender.status === 'querying') return '';
  const code = lender.reasonCode ?? '';
  if (code === 'timeout') return copy.reasons.timeout(formatSeconds(timeoutMs, 0));
  if (code in copy.reasons && code !== 'timeout' && code !== 'fallback') return copy.reasons[code as Exclude<keyof typeof copy.reasons, 'timeout' | 'fallback'>];
  if (code.startsWith('http_')) return copy.reasons.http_500;
  return copy.reasons.fallback;
}

/** One row per lender, in registry order, updated by lender id (never by position). */
export function LenderBoard({ lenders, treatmentAmountCents, timeoutMs }: { readonly lenders: readonly LenderResult[]; readonly treatmentAmountCents: number; readonly timeoutMs: number }) {
  return (
    <ul aria-live="polite" aria-label="Financeiras consultadas" className="divide-y divide-rule border-y border-rule">
      {lenders.map((lender) => (
        <li key={lender.lenderId} className="grid grid-cols-[6rem_1fr_auto] items-center gap-x-4 gap-y-1 py-4 md:grid-cols-[8rem_9rem_1fr_4rem]">
          <span className="font-display text-2xl md:text-3xl">{lender.lenderName}</span>
          <StatusBadge status={lender.status} />
          <span className="col-span-3 text-sm text-ink-muted md:col-span-1 md:text-base">{detail(lender, treatmentAmountCents, timeoutMs)}</span>
          <span className="hidden text-right text-sm text-ink-muted md:block">{lender.latencyMs !== null ? copy.consultation.latency(formatSeconds(lender.latencyMs)) : ''}</span>
        </li>
      ))}
    </ul>
  );
}

/** Four rows already "Consultando" in the static shell: the 4 statuses exist from the first frame. */
export function LenderBoardSkeleton({ names }: { readonly names: readonly string[] }) {
  return (
    <ul aria-hidden className="divide-y divide-rule border-y border-rule">
      {names.map((name) => (
        <li key={name} className="grid grid-cols-[6rem_1fr_auto] items-center gap-x-4 py-4 md:grid-cols-[8rem_9rem_1fr_4rem]">
          <span className="font-display text-2xl md:text-3xl">{name}</span>
          <StatusBadge status="querying" />
          <span />
        </li>
      ))}
    </ul>
  );
}
