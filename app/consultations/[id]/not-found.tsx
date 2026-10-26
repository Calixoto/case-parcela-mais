import { startNewSimulation } from '@/app/register/actions';
import { copy } from '@/src/copy/pt-BR';

export default function ConsultationNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16">
      <h1 className="font-display text-3xl">{copy.consultation.notFound}</h1>
      <form action={startNewSimulation}>
        <button type="submit" className="inline-flex h-12 w-fit items-center rounded-control bg-mint px-5 font-medium text-enamel">
          {copy.actions.newSimulation}
        </button>
      </form>
    </main>
  );
}
