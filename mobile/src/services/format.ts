/** Formatos colombianos deterministas (mismos criterios que la web). */
function miles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function pesos(value: number | null | undefined): string {
  const n = Math.round(Number(value ?? 0));
  return `${n < 0 ? '-' : ''}$${miles(String(Math.abs(n)))}`;
}

export function pesosCortos(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (Math.abs(n) >= 1e9) return `$${decimal(n / 1e9, 2)} mil M`;
  if (Math.abs(n) >= 1e6) return `$${decimal(n / 1e6, 1)} M`;
  return pesos(n);
}

export function decimal(value: number, digits: number): string {
  const [e, d] = value.toFixed(digits).split('.');
  const sign = e.startsWith('-') ? '-' : '';
  return `${sign}${miles(e.replace('-', ''))}${d ? `,${d}` : ''}`;
}

export function pct(fraction: number | null | undefined, digits = 1): string {
  return `${decimal(Number(fraction ?? 0) * 100, digits)} %`;
}

export function milesInput(text: string): string {
  const digits = text.replace(/\D/g, '');
  return digits ? miles(String(Number(digits))) : '';
}

export function soloDigitos(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  const bogota = new Date(d.getTime() - 5 * 3_600_000);
  return `${bogota.getUTCDate()} ${MESES[bogota.getUTCMonth()]} ${bogota.getUTCFullYear()}`;
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(new Date(iso).getTime() - 5 * 3_600_000);
  const h = d.getUTCHours();
  return `${fecha(iso)}, ${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

export function hoyIso(): string {
  return new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
}
