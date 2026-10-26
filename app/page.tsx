import Link from 'next/link';
import { copy } from '@/src/copy/pt-BR';

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16">
      <h1 className="font-display text-4xl">{copy.home.title}</h1>
      <p className="mt-4 text-ink-muted">{copy.home.lead}</p>
      <Link
        href="/register/patient"
        className="mt-8 inline-flex h-12 items-center rounded-control bg-mint px-5 text-enamel"
      >
        {copy.home.start}
      </Link>
    </main>
  );
}
