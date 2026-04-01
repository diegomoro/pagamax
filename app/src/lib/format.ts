export function formatArs(value: number): string {
  return `$${Math.round(value).toLocaleString('es-AR')}`;
}

export function parseAmountInput(raw: string): number | null {
  const normalized = raw.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
