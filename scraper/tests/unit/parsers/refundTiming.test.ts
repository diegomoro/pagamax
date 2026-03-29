import { describe, it, expect } from 'vitest';
import { parseRefundTiming } from '@shared/parsers/refundTiming.js';

describe('parseRefundTiming', () => {
  describe('hours-based', () => {
    it('parses "en 72 horas"', () => {
      const r = parseRefundTiming('en 72 horas');
      expect(r?.hours).toBe(72);
    });
    it('parses "en 48 horas hábiles"', () => {
      const r = parseRefundTiming('en 48 horas hábiles');
      expect(r?.hours).toBe(48);
    });
    it('parses "dentro de las 24 horas"', () => {
      const r = parseRefundTiming('dentro de las 24 horas');
      expect(r?.hours).toBe(24);
    });
  });

  describe('statement-based', () => {
    it('parses "en el próximo resumen"', () => {
      const r = parseRefundTiming('en el próximo resumen');
      expect(r?.statementCycles).toBe(1);
    });
    it('parses "próximo resumen" without "en el"', () => {
      const r = parseRefundTiming('próximo resumen');
      expect(r?.statementCycles).toBe(1);
    });
    it('parses "en 2 resúmenes"', () => {
      const r = parseRefundTiming('en 2 resúmenes');
      expect(r?.statementCycles).toBe(2);
    });
  });

  describe('range-based', () => {
    it('parses "entre 3 y 5 días hábiles" (uses upper bound * 24)', () => {
      const r = parseRefundTiming('entre 3 y 5 días hábiles');
      expect(r?.hours).toBe(5 * 24);
    });
  });

  describe('description preserved', () => {
    it('stores original text in description', () => {
      const r = parseRefundTiming('en 72 horas');
      expect(r?.description).toBe('en 72 horas');
    });
  });

  describe('null cases', () => {
    it('returns null for empty string', () => expect(parseRefundTiming('')).toBeNull());
    it('returns null for unrelated text', () =>
      expect(parseRefundTiming('30% de descuento')).toBeNull());
  });
});
