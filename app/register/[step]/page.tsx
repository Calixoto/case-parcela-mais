import type { Metadata } from 'next';
import { io } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { StepForm } from '@/src/components/register/step-form';
import { StepRail } from '@/src/components/register/step-rail';
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
        <h1 className="font-display text-4xl">{copy.steps[step].title}</h1>
        <p className="text-ink-muted">{copy.steps[step].lead}</p>
      </header>
      <StepForm step={step} draft={draft} scenario={scenario} hint={hint} todayIso={todayIso(getConfig().timeZone)} />
    </div>
  );
}

/** Same geometry as the real content, so the reveal does not shift the layout. */
function StepSkeleton() {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-8">
      <div className="h-12 border-b border-rule" />
      <div className="h-10 w-2/3 rounded-control bg-slate-soft" />
      <div className="flex flex-col gap-6">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-14 border-b border-rule" />
        ))}
      </div>
      <div className="h-12 w-48 rounded-control bg-slate-soft" />
    </div>
  );
}
