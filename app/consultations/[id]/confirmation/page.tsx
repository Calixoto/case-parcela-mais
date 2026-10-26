import type { Metadata } from 'next';
import { io } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { startNewSimulation } from '@/app/register/actions';
import { copy } from '@/src/copy/pt-BR';
import { formatRatePercent } from '@/src/components/format';
import { formatBRL } from '@/src/domain/money';
import { readConsultationSnapshot } from '@/src/server/snapshot';

export const metadata: Metadata = { title: copy.confirmation.title };

export default function ConfirmationPage({ params }: PageProps<'/consultations/[id]/confirmation'>) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 md:py-16">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-control bg-slate-soft" />}>
        <ConfirmationContent params={params} />
      </Suspense>
    </main>
  );
}

async function ConfirmationContent({ params }: Pick<PageProps<'/consultations/[id]/confirmation'>, 'params'>) {
  const { id } = await params;
  await io();
  const snapshot = readConsultationSnapshot(id);
  if (!snapshot) notFound();
  if (!snapshot.choice) redirect(`/consultations/${id}`);
  const { choice, patient, treatmentAmountCents } = snapshot;
  const partial = choice.financedAmountCents < treatmentAmountCents;

  const rows: Array<[string, string]> = [
    [copy.confirmation.lender, choice.lenderName],
    [copy.confirmation.term, `${choice.termMonths}× de ${formatBRL(choice.installmentCents)}`],
    [copy.confirmation.installment, formatBRL(choice.installmentCents)],
    [copy.confirmation.total, `${formatBRL(choice.totalCents)} (${formatRatePercent(choice.monthlyRate)} ao mês)`],
    [copy.confirmation.financed, formatBRL(choice.financedAmountCents)],
    [copy.confirmation.patient, patient.fullName],
    [copy.confirmation.cpf, patient.cpfMasked],
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl">{copy.confirmation.title}</h1>
        <p className="text-ink-muted">{copy.confirmation.lead}</p>
      </header>
      <dl className="divide-y divide-rule border-y border-rule">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[10rem_1fr] gap-4 py-3">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="font-display text-xl">{value}</dd>
          </div>
        ))}
      </dl>
      {partial ? (
        <p role="status" className="rounded-control bg-amber-soft px-4 py-3 text-amber">
          {copy.offers.coveragePartial(Math.floor((choice.financedAmountCents * 100) / treatmentAmountCents), formatBRL(treatmentAmountCents - choice.financedAmountCents))}
        </p>
      ) : null}
      <form action={startNewSimulation}>
        <button type="submit" className="inline-flex h-12 items-center rounded-control border border-rule px-5 font-medium text-ink hover:border-ink">
          {copy.actions.newSimulation}
        </button>
      </form>
    </div>
  );
}
