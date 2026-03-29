import { describe, it, expect } from 'vitest';
import { parsePercentage } from '@shared/parsers/percentage.js';

describe('parsePercentage', () => {
  describe('happy path', () => {
    it('parses integer percentage', () => expect(parsePercentage('30% de descuento')).toBe(30));
    it('parses "Hasta X%"', () => expect(parsePercentage('Hasta 50%')).toBe(50));
    it('parses "X % OFF" with space', () => expect(parsePercentage('20 % OFF')).toBe(20));
    it('parses decimal with comma', () => expect(parsePercentage('12,5% de reintegro')).toBe(12.5));
    it('parses decimal with period', () => expect(parsePercentage('7.5%')).toBe(7.5));
    it('parses full sentence', () =>
      expect(parsePercentage('Obtené un 10% de cashback en tus compras')).toBe(10));
    it('parses 100%', () => expect(parsePercentage('100%')).toBe(100));
  });

  describe('first match when multiple percentages', () => {
    it('returns first of two', () => expect(parsePercentage('10% o 20%')).toBe(10));
    it('returns first in range text', () =>
      expect(parsePercentage('Entre 15% y 30% según el monto')).toBe(15));
  });

  describe('null cases', () => {
    it('returns null for empty string', () => expect(parsePercentage('')).toBeNull());
    it('returns null for no percentage', () => expect(parsePercentage('sin descuento')).toBeNull());
    it('returns null for text-only', () => expect(parsePercentage('cuotas sin interés')).toBeNull());
    it('returns null for just a number', () => expect(parsePercentage('100 pesos')).toBeNull());
  });
});
