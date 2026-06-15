import { describe, expect, it } from 'vitest';
import { extractDniFromCuil, isValidCuil, normalizeIdentityDocument } from '../src/index.js';

describe('identity document validation', () => {
  it('accepts DNI values and exposes only normalized/display-safe pieces', () => {
    const result = normalizeIdentityDocument('12.345.678');

    expect(result).toMatchObject({
      ok: true,
      kind: 'dni',
      normalizedDni: '12345678',
      normalizedCuil: null,
      displayLast4: '5678',
    });
  });

  it('accepts valid CUIL values and extracts the embedded DNI', () => {
    const cuil = '20-12345678-6';

    expect(isValidCuil(cuil)).toBe(true);
    expect(extractDniFromCuil(cuil)).toBe('12345678');
    expect(normalizeIdentityDocument(cuil)).toMatchObject({
      ok: true,
      kind: 'cuil',
      normalizedDni: '12345678',
      normalizedCuil: '20123456786',
      displayLast4: '5678',
    });
  });

  it('rejects invalid DNI and CUIL values', () => {
    expect(normalizeIdentityDocument('123').reason).toBe('invalid_dni');
    expect(normalizeIdentityDocument('20-12345678-1').reason).toBe('invalid_cuil');
    expect(isValidCuil('30-12345678-6')).toBe(false);
  });
});
