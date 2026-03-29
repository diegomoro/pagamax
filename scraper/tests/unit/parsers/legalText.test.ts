import { describe, it, expect } from 'vitest';
import { normalizeLegalText } from '@shared/parsers/legalText.js';

describe('normalizeLegalText', () => {
  it('decodes &nbsp;', () =>
    expect(normalizeLegalText('texto&nbsp;aquí')).toBe('texto aquí'));
  it('decodes &amp;', () =>
    expect(normalizeLegalText('Naranja&amp;Co')).toBe('Naranja&Co'));
  it('decodes &lt; and &gt;', () =>
    expect(normalizeLegalText('a &lt; b &gt; c')).toBe('a < b > c'));
  it('decodes &quot;', () =>
    expect(normalizeLegalText('&quot;oferta&quot;')).toBe('"oferta"'));

  it('collapses multiple spaces', () =>
    expect(normalizeLegalText('texto   con   espacios')).toBe('texto con espacios'));
  it('normalizes CRLF to LF', () =>
    expect(normalizeLegalText('línea1\r\nlínea2')).toBe('línea1\nlínea2'));
  it('collapses triple newlines to double', () =>
    expect(normalizeLegalText('a\n\n\n\nb')).toBe('a\n\nb'));

  it('trims leading and trailing whitespace', () =>
    expect(normalizeLegalText('  texto  ')).toBe('texto'));
  it('removes trailing spaces on lines', () =>
    expect(normalizeLegalText('línea1   \nlínea2')).toBe('línea1\nlínea2'));

  it('preserves legal content verbatim (does not strip words)', () => {
    const input = 'Promoción válida hasta el 31/12/2025. Sujeto a disponibilidad.';
    expect(normalizeLegalText(input)).toBe(input);
  });

  it('handles empty string', () => expect(normalizeLegalText('')).toBe(''));
});
