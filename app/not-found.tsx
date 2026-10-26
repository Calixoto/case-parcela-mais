import Link from 'next/link';
import { copy } from '@/src/copy/pt-BR';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16">
      <h1 className="font-display text-3xl">Página não encontrada</h1>
      <p className="text-ink-muted">O endereço não existe ou a consulta não está mais disponível.</p>
      <Link href="/" className="inline-flex h-12 w-fit items-center rounded-control bg-mint px-5 font-medium text-enamel">
        {copy.actions.newSimulation}
      </Link>
    </main>
  );
}
