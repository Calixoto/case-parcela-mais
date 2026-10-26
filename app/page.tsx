import { Suspense } from 'react';
import { applyPersona, startNewSimulation } from '@/app/register/actions';
import { ResumeConsultation } from '@/src/components/home/resume-consultation';
import { copy } from '@/src/copy/pt-BR';
import { SCENARIO_IDS } from '@/src/domain/types';

const PERSONA_IDS = ['A', 'B', 'C'] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-12 px-4 py-16">
      <section className="flex flex-col gap-5">
        <h1 className="font-display text-5xl">{copy.home.title}</h1>
        <p className="max-w-prose text-lg text-ink-muted">{copy.home.lead}</p>
        <div className="flex flex-wrap gap-3">
          {/* A Server Action, not a link: starting over clears the previous patient's draft from this browser. */}
          <form action={startNewSimulation}>
            <button type="submit" className="inline-flex h-12 w-fit items-center rounded-control bg-mint px-5 font-medium text-enamel hover:bg-[#19775f]">
              {copy.home.start}
            </button>
          </form>
          {/* Reads a cookie: streams in behind the static shell. */}
          <Suspense fallback={null}>
            <ResumeConsultation />
          </Suspense>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-rule pt-8">
        <h2 className="font-display text-2xl">{copy.home.demoTitle}</h2>
        <p className="text-ink-muted">{copy.home.demoLead}</p>
        <form action={applyPersona} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{copy.home.personaLegend}</legend>
            {PERSONA_IDS.map((persona, index) => (
              <label key={persona} className="flex items-center gap-3">
                <input type="radio" name="persona" value={persona} defaultChecked={index === 0} className="accent-mint" />
                <span>{copy.home.personas[persona]}</span>
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm text-ink-muted">
            {copy.fields.scenario.label}
            <select name="scenario" className="rounded-control border border-rule bg-enamel px-3 py-2 text-base text-ink">
              <option value="">{copy.scenarios.natural}</option>
              {SCENARIO_IDS.map((id) => (
                <option key={id} value={id}>
                  {copy.scenarios[id]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="inline-flex h-12 w-fit items-center rounded-control border border-rule px-5 font-medium text-ink hover:border-ink">
            {copy.home.openDemo}
          </button>
        </form>
      </section>
    </main>
  );
}
