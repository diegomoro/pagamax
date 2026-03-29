import { describe, it, expect } from 'vitest';
import { parseDateRangeSpanish } from '@shared/parsers/dateRange.js';

const Y = 2025; // reference year for tests

describe('parseDateRangeSpanish', () => {
  describe('same-month range', () => {
    it('parses "del 1 al 31 de marzo"', () => {
      const r = parseDateRangeSpanish('del 1 al 31 de marzo', Y);
      expect(r).not.toBeNull();
      expect(r!.start).toEqual(new Date(Date.UTC(Y, 2, 1)));
      expect(r!.end).toEqual(new Date(Date.UTC(Y, 2, 31)));
    });
    it('parses with explicit year "del 1 al 30 de junio de 2025"', () => {
      const r = parseDateRangeSpanish('del 1 al 30 de junio de 2025', Y);
      expect(r!.start).toEqual(new Date(Date.UTC(2025, 5, 1)));
      expect(r!.end).toEqual(new Date(Date.UTC(2025, 5, 30)));
    });
  });

  describe('cross-month range', () => {
    it('parses "del 1 de marzo al 30 de junio"', () => {
      const r = parseDateRangeSpanish('del 1 de marzo al 30 de junio', Y);
      expect(r!.start).toEqual(new Date(Date.UTC(Y, 2, 1)));
      expect(r!.end).toEqual(new Date(Date.UTC(Y, 5, 30)));
    });
  });

  describe('numeric range', () => {
    it('parses "del 15/03 al 30/04"', () => {
      const r = parseDateRangeSpanish('del 15/03 al 30/04', Y);
      expect(r!.start).toEqual(new Date(Date.UTC(Y, 2, 15)));
      expect(r!.end).toEqual(new Date(Date.UTC(Y, 3, 30)));
    });
    it('parses "del 15/03/2025 al 30/04/2025"', () => {
      const r = parseDateRangeSpanish('del 15/03/2025 al 30/04/2025', Y);
      expect(r!.start).toEqual(new Date(Date.UTC(2025, 2, 15)));
      expect(r!.end).toEqual(new Date(Date.UTC(2025, 3, 30)));
    });
  });

  describe('until-only range', () => {
    it('parses "hasta el 31 de diciembre"', () => {
      const r = parseDateRangeSpanish('hasta el 31 de diciembre', Y);
      expect(r).not.toBeNull();
      expect(r!.end).toEqual(new Date(Date.UTC(Y, 11, 31)));
    });
    it('parses "vigente hasta 31/12/2024"', () => {
      const r = parseDateRangeSpanish('vigente hasta 31/12/2024', Y);
      expect(r!.end).toEqual(new Date(Date.UTC(2024, 11, 31)));
    });
  });

  describe('null cases', () => {
    it('returns null for empty string', () => expect(parseDateRangeSpanish('')).toBeNull());
    it('returns null for unrelated text', () =>
      expect(parseDateRangeSpanish('30% de descuento con QR')).toBeNull());
  });

  describe('accent handling', () => {
    it('handles accented month "diciembre"', () => {
      const r = parseDateRangeSpanish('hasta el 15 de diciembre', Y);
      expect(r!.end.getUTCMonth()).toBe(11); // December = month index 11
    });
    it('handles "febrero" in range', () => {
      const r = parseDateRangeSpanish('del 1 al 28 de febrero', Y);
      expect(r!.start.getUTCMonth()).toBe(1);
    });
  });
});
