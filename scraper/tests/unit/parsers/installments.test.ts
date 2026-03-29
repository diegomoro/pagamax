import { describe, it, expect } from 'vitest';
import { parseInstallments } from '@shared/parsers/installments.js';

describe('parseInstallments', () => {
  describe('interest-free', () => {
    it('parses "12 cuotas sin interés"', () => {
      const r = parseInstallments('12 cuotas sin interés');
      expect(r).toEqual({ count: 12, interestFree: true });
    });
    it('parses "6 cuotas sin cargo"', () => {
      const r = parseInstallments('6 cuotas sin cargo');
      expect(r).toEqual({ count: 6, interestFree: true });
    });
    it('parses "hasta 18 CSI"', () => {
      const r = parseInstallments('hasta 18 CSI');
      expect(r).toEqual({ count: 18, interestFree: true });
    });
    it('parses "3 cuotas al 0%"', () => {
      const r = parseInstallments('3 cuotas al 0%');
      expect(r).toEqual({ count: 3, interestFree: true });
    });
  });

  describe('with interest', () => {
    it('parses "6 cuotas" (no interest indicator)', () => {
      const r = parseInstallments('6 cuotas');
      expect(r).toEqual({ count: 6, interestFree: false });
    });
    it('parses "en 24 cuotas"', () => {
      const r = parseInstallments('en 24 cuotas');
      expect(r).toEqual({ count: 24, interestFree: false });
    });
    it('parses "pagá en 3 cuotas"', () => {
      const r = parseInstallments('pagá en 3 cuotas');
      expect(r).toEqual({ count: 3, interestFree: false });
    });
  });

  describe('null cases', () => {
    it('returns null for empty string', () => expect(parseInstallments('')).toBeNull());
    it('returns null for no installment text', () =>
      expect(parseInstallments('30% de descuento')).toBeNull());
    it('returns null for "cuotas" without a number', () =>
      expect(parseInstallments('cuotas disponibles')).toBeNull());
  });
});
