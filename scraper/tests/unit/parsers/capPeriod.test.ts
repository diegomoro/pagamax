import { describe, it, expect } from 'vitest';
import { parseCapPeriod } from '@shared/parsers/capPeriod.js';

describe('parseCapPeriod', () => {
  describe('per_month', () => {
    it('matches "por mes"', () => expect(parseCapPeriod('por mes')).toBe('per_month'));
    it('matches "mensual"', () => expect(parseCapPeriod('mensual')).toBe('per_month'));
    it('matches "por calendario mensual"', () =>
      expect(parseCapPeriod('por calendario mensual')).toBe('per_month'));
    it('matches with accents: "por período mensual"', () =>
      expect(parseCapPeriod('por período mensual')).toBe('per_month'));
  });

  describe('per_transaction', () => {
    it('matches "por transacción"', () =>
      expect(parseCapPeriod('por transacción')).toBe('per_transaction'));
    it('matches "por compra"', () => expect(parseCapPeriod('por compra')).toBe('per_transaction'));
    it('matches accent-stripped "por transaccion"', () =>
      expect(parseCapPeriod('por transaccion')).toBe('per_transaction'));
  });

  describe('per_day', () => {
    it('matches "por día"', () => expect(parseCapPeriod('por día')).toBe('per_day'));
    it('matches "diario"', () => expect(parseCapPeriod('diario')).toBe('per_day'));
    it('matches "diaria"', () => expect(parseCapPeriod('diaria')).toBe('per_day'));
  });

  describe('per_week', () => {
    it('matches "por semana"', () => expect(parseCapPeriod('por semana')).toBe('per_week'));
    it('matches "semanal"', () => expect(parseCapPeriod('semanal')).toBe('per_week'));
  });

  describe('per_period', () => {
    it('matches "por período"', () => expect(parseCapPeriod('por período')).toBe('per_period'));
    it('matches "durante la promoción"', () =>
      expect(parseCapPeriod('durante la promoción')).toBe('per_period'));
  });

  describe('null cases', () => {
    it('returns null for empty string', () => expect(parseCapPeriod('')).toBeNull());
    it('returns null for unrecognized text', () => expect(parseCapPeriod('cualquier texto')).toBeNull());
  });
});
