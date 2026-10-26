import type { Metadata } from 'next';
import { io } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { startNewSimulation } from '@/app/register/actions';
import { formatRatePercent } from '@/src/components/format';
import { Alert, AlertTitle } from '@/src/components/ui/alert';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Skeleton } from '@/src/components/ui/skeleton';
import { copy } from '@/src/copy/pt-BR';
import { formatBRL, percentCovered } from '@/src/domain/money';
import { readConsultationSnapshot } from '@/src/server/snapshot';

export const metadata: Metadata = { title: copy.confirmation.title };

export default function ConfirmationPage({ params }: PageProps<'/consultations/[id]/confirmation'>) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 md:py-16">
      <Suspense
        fallback={
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        }
      >
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
        <h1 className="text-2xl font-semibold tracking-tight">{copy.confirmation.title}</h1>
        <p className="text-muted-foreground">{copy.confirmation.lead}</p>
      </header>
      <Card>
        <CardContent>
          <dl className="divide-y">
            {rows.map(([label, value]) => (
              <div key={label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      {partial ? (
        <Alert role="status">
          <AlertTitle>
            {copy.offers.coveragePartial(percentCovered(choice.financedAmountCents, treatmentAmountCents), formatBRL(treatmentAmountCents - choice.financedAmountCents))}
          </AlertTitle>
        </Alert>
      ) : null}
      <form action={startNewSimulation}>
        <Button type="submit" variant="outline">
          {copy.actions.newSimulation}
        </Button>
      </form>
    </div>
  );
}
