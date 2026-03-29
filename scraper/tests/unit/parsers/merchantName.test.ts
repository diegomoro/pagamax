import { describe, it, expect } from 'vitest';
import { parseMerchantName } from '@shared/parsers/merchantName.js';

describe('parseMerchantName', () => {
  describe('trimming and whitespace', () => {
    it('trims leading/trailing whitespace', () =>
      expect(parseMerchantName('  Zara  ')).toBe('Zara'));
    it('collapses internal double spaces', () =>
      expect(parseMerchantName('La  Anonima')).toBe('La Anonima'));
  });

  describe('all-caps brand preservation', () => {
    it('preserves YPF', () => expect(parseMerchantName('YPF')).toBe('YPF'));
    it('preserves BBVA', () => expect(parseMerchantName('BBVA')).toBe('BBVA'));
    it('preserves HSBC', () => expect(parseMerchantName('HSBC')).toBe('HSBC'));
  });

  describe('legal suffix stripping', () => {
    it('strips " S.A."', () => expect(parseMerchantName('Farmacity S.A.')).toBe('Farmacity'));
    it('strips " S.R.L."', () =>
      expect(parseMerchantName('Distribuidora Norte S.R.L.')).toBe('Distribuidora Norte'));
    it('strips " SA" (no dots)', () => expect(parseMerchantName('Rapipago SA')).toBe('Rapipago'));
  });

  describe('title-casing', () => {
    it('title-cases all-lowercase name', () =>
      expect(parseMerchantName('mcdonalds')).toBe('Mcdonalds'));
    it('lowercases connectors', () =>
      expect(parseMerchantName('La Casa de las Pizzas')).toBe('La Casa de las Pizzas'));
  });

  describe('edge cases', () => {
    it('handles empty string', () => expect(parseMerchantName('')).toBe(''));
    it('handles single word', () => expect(parseMerchantName('DIA')).toBe('DIA'));
  });
});
