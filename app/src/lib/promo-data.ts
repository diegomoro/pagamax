import type { PromoDataStatus } from '@/types/app';

export function formatPromoDataDate(raw: string | null, fallback = 'sin fecha'): string {
  if (!raw) return fallback;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('es-AR');
}

export function getPromoDataAgeDays(raw: string | null): number | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

export function isPromoDataStale(raw: string | null, maxAgeDays = 7): boolean {
  const ageDays = getPromoDataAgeDays(raw);
  if (ageDays === null) return false;
  return ageDays > maxAgeDays;
}

export function describePromoDataSource(status: PromoDataStatus): string {
  if (status.source === 'remote_downloaded') return 'Descarga remota';
  if (status.source === 'cached_remote') return 'Copia remota';
  return 'Base incluida';
}

export function describePromoSyncStatus(status: PromoDataStatus): string {
  switch (status.lastSyncStatus) {
    case 'checking':
      return 'Revisando actualizaciones';
    case 'updated':
      return 'Actualizado';
    case 'up_to_date':
      return 'Al dia';
    case 'error':
      return 'Con error';
    case 'unconfigured':
      return 'Sin remoto';
    case 'idle':
    default:
      return 'Lista';
  }
}
