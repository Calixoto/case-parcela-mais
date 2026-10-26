import { cn } from 'cn';
import { Badge } from '@/src/components/ui/badge';
import { Progress, ProgressLabel } from '@/src/components/ui/progress';
import { copy } from '@/src/copy/pt-BR';
import { REGISTRATION_STEPS, stepIndex, type StepSlug } from '@/src/domain/registration-steps';

const badgeVariant = { done: 'secondary', current: 'default', next: 'outline' } as const;

/** Where the clinic is in the form. Pure props: no hooks, so it can live in the static shell. */
export function StepRail({ current }: { readonly current: StepSlug }) {
  const index = stepIndex(current);
  const total = REGISTRATION_STEPS.length;
  return (
    <nav aria-label={copy.steps.navLabel} className="flex flex-col gap-4">
      {/* aria-label names the bar in the static HTML: Base UI wires the label through aria-labelledby only after hydration. */}
      <Progress value={((index + 1) / total) * 100} aria-label={copy.steps.navLabel} locale="pt-BR">
        <ProgressLabel>{copy.steps.progress(index + 1, total)}</ProgressLabel>
      </Progress>
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {REGISTRATION_STEPS.map((step, position) => {
          const state = position < index ? 'done' : position === index ? 'current' : 'next';
          return (
            <li
              key={step.slug}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn('flex items-center gap-2', state === 'current' ? 'font-medium text-foreground' : 'text-muted-foreground')}
            >
              <Badge variant={badgeVariant[state]}>{position + 1}</Badge>
              {copy.steps[step.slug].title}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
