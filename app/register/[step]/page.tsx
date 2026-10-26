import type { Metadata } from 'next';
import { io } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { StepForm } from '@/src/components/register/step-form';
import { StepRail } from '@/src/components/register/step-rail';
import { Skeleton } from '@/src/components/ui/skeleton';
import { copy } from '@/src/copy/pt-BR';
import { todayIso } from '@/src/domain/age';
import { isStepSlug, REGISTRATION_STEPS, type StepSlug } from '@/src/domain/registration-steps';
import { getConfig } from '@/src/server/config';
import { readDraft } from '@/src/server/draft-cookie';
import { loadRegisterSearchParams, scenarioQuery } from '@/src/url-state/parsers';

/** The two step shells are prerendered; the form body (cookie, query) streams in per request. */
export function generateStaticParams() {
  return REGISTRATION_STEPS.map((step) => ({ step: step.slug }));
}

export async function generateMetadata({ params }: PageProps<'/register/[step]'>): Promise<Metadata> {
  const { step } = await params;
  return { title: isStepSlug(step) ? copy.steps[step].title : copy.app.name };
}

function assertStep(value: string): asserts value is StepSlug {
  if (!isStepSlug(value)) notFound();
}

export default function RegisterStepPage({ params, searchParams }: PageProps<'/register/[step]'>) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 md:py-16">
      <Suspense fallback={<StepSkeleton />}>
        <StepContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function StepContent({ params, searchParams }: Pick<PageProps<'/register/[step]'>, 'params' | 'searchParams'>) {
  const { step } = await params;
  assertStep(step);
  const [draft, { scenario, hint }] = await Promise.all([readDraft(), loadRegisterSearchParams(searchParams)]);
  await io(); // the civil date below comes from the clock: keep it out of the static shell

  // Guard: the amount step needs the patient step first (deep link or expired cookie).
  if (step === 'financing' && !REGISTRATION_STEPS[0].fields.every((field) => draft[field])) {
    redirect(`/register/patient${scenarioQuery(scenario)}`);
  }

  return (
    <div className="flex flex-col gap-8">
      <StepRail current={step} />
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{copy.steps[step].title}</h1>
        <p className="text-muted-foreground">{copy.steps[step].lead}</p>
      </header>
      <StepForm step={step} draft={draft} scenario={scenario} hint={hint} todayIso={todayIso(getConfig().timeZone)} />
    </div>
  );
}

/** Same geometry as the real content (rail, header, four fields, two buttons), so the reveal does not shift the layout. */
function StepSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-1 w-full rounded-full" />
        </div>
        <div className="flex gap-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-36" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
      <div className="flex flex-col gap-5">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-32" />
      </div>
    </div>
  );
}
