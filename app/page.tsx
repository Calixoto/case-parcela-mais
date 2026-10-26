import { Suspense } from 'react';
import { startNewSimulation } from '@/app/register/actions';
import { ResumeConsultation } from '@/src/components/home/resume-consultation';
import { Button } from '@/src/components/ui/button';
import { copy } from '@/src/copy/pt-BR';

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 md:py-16">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{copy.home.title}</h1>
          <p className="text-muted-foreground">{copy.home.lead}</p>
        </header>
        <div className="flex flex-wrap gap-3">
          {/* A Server Action, not a link: starting over clears the previous patient's draft from this browser. */}
          <form action={startNewSimulation}>
            <Button type="submit">{copy.home.start}</Button>
          </form>
          {/* Reads a cookie: streams in behind the static shell. */}
          <Suspense fallback={null}>
            <ResumeConsultation />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
