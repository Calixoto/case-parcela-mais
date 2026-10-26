/** Presentation-only formatting (pt-BR). Money formatting lives in the domain (`formatBRL`). */

export function formatRatePercent(rate: number): string {
  return `${(rate * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function formatSeconds(ms: number, digits = 1): string {
  return (ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatDate(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(epochMs));
}

export function formatTime(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(epochMs));
}
