import type { ComponentProps } from 'react';
import { Badge } from '@/src/components/ui/badge';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/src/components/ui/item';
import { Spinner } from '@/src/components/ui/spinner';
import { copy } from '@/src/copy/pt-BR';
import { formatBRL, percentCovered } from '@/src/domain/money';
import type { LenderResult, LenderStatus } from '@/src/domain/types';
import { formatRatePercent, formatSeconds } from '../format';

/** One Badge variant per status, shared by every screen that shows a lender. */
const badgeVariant: Record<LenderStatus, ComponentProps<typeof Badge>['variant']> = {
  querying: 'secondary',
  approved: 'default',
  refused: 'destructive',
  unavailable: 'outline',
};

export function StatusBadge({ status }: { readonly status: LenderStatus }) {
  return (
    <Badge variant={badgeVariant[status]}>
      {status === 'querying' ? <Spinner aria-hidden /> : null}
      {copy.status[status]}
    </Badge>
  );
}

function detail(lender: LenderResult, treatmentAmountCents: number, timeoutMs: number): string {
  if (lender.status === 'approved' && lender.approvedAmountCents !== null && lender.monthlyRate !== null) {
    const rate = formatRatePercent(lender.monthlyRate);
    if (lender.approvedAmountCents >= treatmentAmountCents) return copy.consultation.approvedFull(rate);
    const percent = percentCovered(lender.approvedAmountCents, treatmentAmountCents);
    return copy.consultation.approvedPartial(percent, formatBRL(lender.approvedAmountCents), rate);
  }
  if (lender.status === 'querying') return '';
  const code = lender.reasonCode ?? '';
  if (code === 'timeout') return copy.reasons.timeout(formatSeconds(timeoutMs, 0));
  if (code in copy.reasons && code !== 'timeout' && code !== 'fallback') return copy.reasons[code as Exclude<keyof typeof copy.reasons, 'timeout' | 'fallback'>];
  if (code.startsWith('http_')) return copy.reasons.http_500;
  return copy.reasons.fallback;
}

type BoardProps = { readonly lenders: readonly LenderResult[]; readonly treatmentAmountCents: number; readonly timeoutMs: number };

/** One row per lender, in registry order, updated by lender id (never by position). */
export function LenderBoard({ lenders, treatmentAmountCents, timeoutMs }: BoardProps) {
  return (
    <ItemGroup aria-label={copy.consultation.boardLabel}>
      {lenders.map((lender) => {
        const text = detail(lender, treatmentAmountCents, timeoutMs);
        return (
          // Each row is its own atomic live region: an update reads the whole row (name, detail, status), not loose fragments.
          <Item key={lender.lenderId} role="listitem" variant="outline" aria-live="polite" aria-atomic="true">
            <ItemContent>
              <ItemTitle>{lender.lenderName}</ItemTitle>
              {text ? <ItemDescription>{text}</ItemDescription> : null}
            </ItemContent>
            <ItemActions>
              <StatusBadge status={lender.status} />
            </ItemActions>
          </Item>
        );
      })}
    </ItemGroup>
  );
}

/** Four rows already "Consultando" in the static shell: the 4 statuses exist from the first frame. */
export function LenderBoardSkeleton({ names }: { readonly names: readonly string[] }) {
  return (
    <ItemGroup aria-hidden>
      {names.map((name) => (
        <Item key={name} role="listitem" variant="outline">
          <ItemContent>
            <ItemTitle>{name}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <StatusBadge status="querying" />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
