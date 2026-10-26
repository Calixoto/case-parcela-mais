import { copy } from '@/src/copy/pt-BR';
import { REGISTRATION_STEPS, stepIndex, type StepSlug } from '@/src/domain/registration-steps';

/** Where the clinic is in the form. Pure props: no hooks, so it can live in the static shell. */
export function StepRail({ current }: { readonly current: StepSlug }) {
  const index = stepIndex(current);
  return (
    <nav aria-label={copy.steps.navLabel} className="flex flex-col gap-2">
      <p className="text-sm text-ink-muted">{copy.steps.progress(index + 1, REGISTRATION_STEPS.length)}</p>
      <ol className="flex gap-6 border-b border-rule pb-3">
        {REGISTRATION_STEPS.map((step, position) => {
          const state = position < index ? 'done' : position === index ? 'current' : 'next';
          return (
            <li
              key={step.slug}
              aria-current={state === 'current' ? 'step' : undefined}
              className={state === 'current' ? 'text-ink' : state === 'done' ? 'text-mint' : 'text-ink-muted'}
            >
              <span className="font-display text-base">{position + 1}. </span>
              {copy.steps[step.slug].title}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
