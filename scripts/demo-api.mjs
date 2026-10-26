#!/usr/bin/env node
/**
 * Exercises the HTTP contract end to end, the way the front-end does:
 *   node scripts/demo-api.mjs [scenario] [baseUrl]
 * scenario: all_approve | delta_error | delta_timeout | none_approve | natural (default)
 */
const scenario = process.argv[2] && process.argv[2] !== 'natural' ? process.argv[2] : undefined;
const base = process.argv[3] ?? 'http://localhost:3000';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const money = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const personaA = {
  patient: { fullName: 'Ana Souza', cpf: '529.982.247-25', birthDate: '1996-03-15', phone: '11912345678', monthlyIncomeCents: 500_000 },
  treatmentAmountCents: 1_500_000,
  ...(scenario ? { scenario } : {}),
};

const created = await fetch(`${base}/api/consultations`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(personaA),
});
const { consultationId, deadlineAt, ...error } = await created.json();
if (!created.ok) {
  console.error('POST failed', created.status, error);
  process.exit(1);
}
console.log(`POST /api/consultations → ${created.status} id=${consultationId} scenario=${scenario ?? 'natural'} deadline in ${deadlineAt - Date.now()} ms`);

let snapshot;
const startedAt = Date.now();
do {
  const response = await fetch(`${base}/api/consultations/${consultationId}`, { cache: 'no-store' });
  snapshot = await response.json();
  const line = snapshot.lenders.map((lender) => `${lender.lenderName}: ${lender.status}${lender.reasonCode ? ` (${lender.reasonCode})` : ''}`).join(' | ');
  console.log(`+${String(Date.now() - startedAt).padStart(5)} ms  ${snapshot.status.padEnd(8)}  ${line}`);
  if (snapshot.status === 'finished') break;
  await sleep(snapshot.pollIntervalMs);
} while (Date.now() - startedAt < 20_000);

console.log(`finished: ${snapshot.finishReason} · ${snapshot.offers.length} offers · outcome ${snapshot.summary.outcome} · next step ${snapshot.summary.nextStep}`);
for (const offer of snapshot.offers.slice(0, 3)) {
  console.log(`  ${offer.lenderName} ${offer.termMonths}x ${money(offer.installmentCents)} total ${money(offer.totalCents)} covers ${offer.coveragePercent}%`);
}

if (snapshot.offers.length > 0) {
  const [first] = snapshot.offers;
  const choose = (body) => fetch(`${base}/api/consultations/${consultationId}/choice`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const chosen = await choose({ lenderId: first.lenderId, termMonths: first.termMonths });
  console.log(`POST choice ${first.lenderId} ${first.termMonths}x → ${chosen.status}`, await chosen.json());
  const again = await choose({ lenderId: first.lenderId, termMonths: first.termMonths });
  console.log(`same choice again → ${again.status}`);
  const other = snapshot.offers.find((offer) => offer.lenderId !== first.lenderId || offer.termMonths !== first.termMonths);
  if (other) {
    const conflict = await choose({ lenderId: other.lenderId, termMonths: other.termMonths });
    console.log(`different choice → ${conflict.status}`, await conflict.json());
  }
}
