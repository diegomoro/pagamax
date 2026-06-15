import type { IdentityDocumentKind, IdentityDocumentValidationResult } from './types';

const CUIL_PREFIXES = new Set(['20', '23', '24', '27']);
const CUIL_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function isValidDniDigits(value: string): boolean {
  return /^\d{7,8}$/.test(value);
}

function calculateCuilCheckDigit(firstTenDigits: string): number | null {
  if (!/^\d{10}$/.test(firstTenDigits)) return null;
  const sum = CUIL_WEIGHTS.reduce((total, weight, index) => total + Number(firstTenDigits[index]) * weight, 0);
  const remainder = sum % 11;
  const digit = 11 - remainder;
  if (digit === 11) return 0;
  if (digit === 10) return 9;
  return digit;
}

export function extractDniFromCuil(value: string): string | null {
  const digits = onlyDigits(value);
  if (!isValidCuil(value)) return null;
  return digits.slice(2, 10).replace(/^0+/, '') || null;
}

export function isValidCuil(value: string): boolean {
  const digits = onlyDigits(value);
  if (!/^\d{11}$/.test(digits)) return false;
  if (!CUIL_PREFIXES.has(digits.slice(0, 2))) return false;
  const expected = calculateCuilCheckDigit(digits.slice(0, 10));
  return expected === Number(digits[10]);
}

export function normalizeIdentityDocument(value: string): IdentityDocumentValidationResult {
  const rawDigits = onlyDigits(value);
  const kind: IdentityDocumentKind = rawDigits.length === 11 ? 'cuil' : 'dni';

  if (kind === 'cuil') {
    if (!isValidCuil(rawDigits)) {
      return { ok: false, kind, normalizedDni: null, normalizedCuil: null, displayLast4: null, reason: 'invalid_cuil' };
    }

    const normalizedDni = rawDigits.slice(2, 10).replace(/^0+/, '');
    return {
      ok: true,
      kind,
      normalizedDni,
      normalizedCuil: rawDigits,
      displayLast4: normalizedDni.slice(-4),
    };
  }

  if (!isValidDniDigits(rawDigits)) {
    return { ok: false, kind, normalizedDni: null, normalizedCuil: null, displayLast4: null, reason: 'invalid_dni' };
  }

  const normalizedDni = rawDigits.replace(/^0+/, '');
  return {
    ok: true,
    kind,
    normalizedDni,
    normalizedCuil: null,
    displayLast4: normalizedDni.slice(-4),
  };
}
