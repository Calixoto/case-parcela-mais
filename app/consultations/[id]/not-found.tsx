import { startNewSimulation } from '@/app/register/actions';
import { Button } from '@/src/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/src/components/ui/empty';
import { copy } from '@/src/copy/pt-BR';

export default function ConsultationNotFound() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 md:py-16">
      <Empty>
        <EmptyHeader>
          {/* EmptyTitle renders a div; the h1 keeps the page heading. */}
          <EmptyTitle className="text-2xl font-semibold tracking-tight">
            <h1>{copy.consultation.notFound}</h1>
          </EmptyTitle>
          <EmptyDescription>{copy.errors.pageNotFoundLead}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <form action={startNewSimulation}>
            <Button type="submit">{copy.actions.newSimulation}</Button>
          </form>
        </EmptyContent>
      </Empty>
    </main>
  );
}
