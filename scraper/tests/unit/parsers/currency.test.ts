import { describe, it, expect } from 'vitest';
import { parseCurrencyARS } from '@shared/parsers/currency.js';

describe('parseCurrencyARS', () => {
  describe('happy path', () => {
    it('parses "$5.000"', () => expect(parseCurrencyARS('$5.000')).toBe(5000));
    it('parses "$ 5.000" with space', () => expect(parseCurrencyARS('$ 5.000')).toBe(5000));
    it('parses "$5.000,50" with decimal', () => expect(parseCurrencyARS('$5.000,50')).toBe(5000.5));
    it('parses "5000 pesos"', () => expect(parseCurrencyARS('5000 pesos')).toBe(5000));
    it('parses "ARS 1.500"', () => expect(parseCurrencyARS('ARS 1.500')).toBe(1500));
    it('parses bare number without separator', () => expect(parseCurrencyARS('5000')).toBe(5000));
    it('parses millions', () => expect(parseCurrencyARS('$1.000.000')).toBe(1_000_000));
    it('parses in context sentence', () =>
      expect(parseCurrencyARS('Hasta $2.500 por mes')).toBe(2500));
  });

  describe('null cases', () => {
    it('returns null for empty string', () => expect(parseCurrencyARS('')).toBeNull());
    it('returns null for pure text', () => expect(parseCurrencyARS('sin monto')).toBeNull());
    it('returns null for just a $', () => expect(parseCurrencyARS('$')).toBeNull());
  });
});
