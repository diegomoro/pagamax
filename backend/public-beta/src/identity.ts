import type { BackendConfig } from './config.js';
import { HttpError, isRecord } from './http.js';
import { pepperedHash } from './security.js';

const CUIL_PREFIXES = new Set(['20', '23', '24', '27']);
const CUIL_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

export interface IdentityDocumentInput {
  kind: 'dni' | 'cuil';
  normalizedDni?: string | null;
  normalizedCuil?: string | null;
}

export interface IdentitySnapshot {
  kind: 'dni' | 'cuil';
  normalizedDni: string;
  normalizedCuil: string | null;
  last4: string;
  identityHash: string;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function calculateCuilCheckDigit(firstTenDigits: string): number | null {
  if (!/^\d{10}$/.test(firstTenDigits)) return null;
  const sum = CUIL_WEIGHTS.reduce((total, weight, index) => total + Number(firstTenDigits[index] ?? '0') * weight, 0);
  const digit = 11 - (sum % 11);
  if (digit === 11) return 0;
  if (digit === 10) return 9;
  return digit;
}

export function isValidCuil(value: string): boolean {
  const digits = onlyDigits(value);
  if (!/^\d{11}$/.test(digits)) return false;
  if (!CUIL_PREFIXES.has(digits.slice(0, 2))) return false;
  return calculateCuilCheckDigit(digits.slice(0, 10)) === Number(digits[10]);
}

export function normalizeIdentityDocument(input: unknown, config: Pick<BackendConfig, 'identityPepper'>): IdentitySnapshot | null {
  if (input === undefined || input === null) return null;
  if (!isRecord(input)) {
    throw new HttpError(400, 'invalid_identity_document', 'identityDocument must be an object when provided.');
  }

  const kind = input.kind;
  if (kind !== 'dni' && kind !== 'cuil') {
    throw new HttpError(400, 'invalid_identity_document', 'identityDocument.kind must be dni or cuil.');
  }

  if (kind === 'dni') {
    const normalizedDni = onlyDigits(typeof input.normalizedDni === 'string' ? input.normalizedDni : '');
    if (!/^\d{7,8}$/.test(normalizedDni)) {
      throw new HttpError(400, 'invalid_dni', 'DNI must contain 7 or 8 digits.');
    }
    return {
      kind,
      normalizedDni,
      normalizedCuil: null,
      last4: normalizedDni.slice(-4),
      identityHash: pepperedHash(`identity:v1:dni:${normalizedDni}`, config.identityPepper),
    };
  }

  const normalizedCuil = onlyDigits(typeof input.normalizedCuil === 'string' ? input.normalizedCuil : '');
  if (!isValidCuil(normalizedCuil)) {
    throw new HttpError(400, 'invalid_cuil', 'CUIL must contain 11 valid digits.');
  }

  const embeddedDni = normalizedCuil.slice(2, 10).replace(/^0+/, '');
  const providedDni = typeof input.normalizedDni === 'string' ? onlyDigits(input.normalizedDni).replace(/^0+/, '') : embeddedDni;
  if (providedDni !== embeddedDni) {
    throw new HttpError(400, 'invalid_cuil', 'CUIL embedded DNI does not match normalizedDni.');
  }

  return {
    kind,
    normalizedDni: embeddedDni,
    normalizedCuil,
    last4: embeddedDni.slice(-4),
    identityHash: pepperedHash(`identity:v1:dni:${embeddedDni}`, config.identityPepper),
  };
}
