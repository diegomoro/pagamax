import { describe, it, expect } from 'vitest';
import { parseWeekdaysSpanish } from '@shared/parsers/weekdays.js';

describe('parseWeekdaysSpanish', () => {
  describe('single days', () => {
    it('parses "los lunes"', () => expect(parseWeekdaysSpanish('los lunes')).toEqual(['monday']));
    it('parses "martes"', () => expect(parseWeekdaysSpanish('martes')).toEqual(['tuesday']));
    it('parses "el domingo"', () => expect(parseWeekdaysSpanish('el domingo')).toEqual(['sunday']));
  });

  describe('multiple days', () => {
    it('parses "lunes y martes"', () =>
      expect(parseWeekdaysSpanish('lunes y martes')).toEqual(['monday', 'tuesday']));
    it('parses "martes, miércoles y jueves"', () =>
      expect(parseWeekdaysSpanish('martes, miércoles y jueves')).toEqual([
        'tuesday', 'wednesday', 'thursday',
      ]));
    it('parses "sábados y domingos"', () =>
      expect(parseWeekdaysSpanish('sábados y domingos')).toEqual(['saturday', 'sunday']));
  });

  describe('special groups', () => {
    it('"todos los días" returns all 7 days', () => {
      const result = parseWeekdaysSpanish('todos los días');
      expect(result).toHaveLength(7);
      expect(result).toContain('monday');
      expect(result).toContain('sunday');
    });
    it('"fines de semana" returns saturday and sunday', () =>
      expect(parseWeekdaysSpanish('fines de semana')).toEqual(['saturday', 'sunday']));
    it('"días hábiles" returns monday through friday', () =>
      expect(parseWeekdaysSpanish('días hábiles')).toEqual([
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
      ]));
  });

  describe('range syntax', () => {
    it('"de lunes a viernes"', () =>
      expect(parseWeekdaysSpanish('de lunes a viernes')).toEqual([
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
      ]));
    it('"de lunes a miércoles"', () =>
      expect(parseWeekdaysSpanish('de lunes a miércoles')).toEqual([
        'monday', 'tuesday', 'wednesday',
      ]));
  });

  describe('result is sorted by week order', () => {
    it('returns days in ISO week order regardless of input order', () => {
      const result = parseWeekdaysSpanish('jueves y lunes');
      expect(result).toEqual(['monday', 'thursday']);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty string', () =>
      expect(parseWeekdaysSpanish('')).toEqual([]));
    it('returns empty array for unrelated text', () =>
      expect(parseWeekdaysSpanish('30% de descuento')).toEqual([]));
    it('handles accent-stripped input "sabado"', () =>
      expect(parseWeekdaysSpanish('sabado')).toEqual(['saturday']));
  });
});
