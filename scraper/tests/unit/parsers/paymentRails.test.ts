import { describe, it, expect } from 'vitest';
import { parsePaymentRails } from '@shared/parsers/paymentRails.js';

describe('parsePaymentRails', () => {
  describe('QR', () => {
    it('detects "con QR"', () => expect(parsePaymentRails(['con QR'])).toContain('qr'));
    it('detects "código QR"', () => expect(parsePaymentRails(['código QR'])).toContain('qr'));
  });

  describe('NFC', () => {
    it('detects "NFC"', () => expect(parsePaymentRails(['NFC'])).toContain('nfc'));
    it('detects "contactless"', () => expect(parsePaymentRails(['contactless'])).toContain('nfc'));
  });

  describe('credit card', () => {
    it('detects "tarjeta de crédito"', () =>
      expect(parsePaymentRails(['tarjeta de crédito'])).toContain('credit_card'));
    it('detects bare "tarjeta" as credit_card default', () =>
      expect(parsePaymentRails(['con tarjeta'])).toContain('credit_card'));
  });

  describe('debit card', () => {
    it('detects "tarjeta de débito"', () =>
      expect(parsePaymentRails(['tarjeta de débito'])).toContain('debit_card'));
    it('detects "débito"', () => expect(parsePaymentRails(['con débito'])).toContain('debit_card'));
  });

  describe('prepaid card', () => {
    it('detects "tarjeta prepaga"', () =>
      expect(parsePaymentRails(['tarjeta prepaga'])).toContain('prepaid_card'));
  });

  describe('wallet', () => {
    it('detects "billetera virtual"', () =>
      expect(parsePaymentRails(['billetera virtual'])).toContain('wallet'));
    it('detects "Naranja X" as wallet', () =>
      expect(parsePaymentRails(['Naranja X'])).toContain('wallet'));
    it('detects "Mercado Pago" as wallet', () =>
      expect(parsePaymentRails(['Mercado Pago'])).toContain('wallet'));
  });

  describe('transfer', () => {
    it('detects "transferencia"', () =>
      expect(parsePaymentRails(['transferencia'])).toContain('transfer'));
  });

  describe('deduplication', () => {
    it('returns unique rails even when input has duplicates', () => {
      const result = parsePaymentRails(['con QR', 'código QR', 'con QR Naranja X']);
      const qrCount = result.filter((r) => r === 'qr').length;
      expect(qrCount).toBe(1);
    });
  });

  describe('multiple inputs', () => {
    it('combines rails from multiple strings', () => {
      const result = parsePaymentRails(['con QR', 'tarjeta de crédito']);
      expect(result).toContain('qr');
      expect(result).toContain('credit_card');
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', () => expect(parsePaymentRails([])).toEqual([]));
    it('returns empty array for unrelated text', () =>
      expect(parsePaymentRails(['30% de descuento'])).toEqual([]));
    it('handles empty strings in array', () => {
      const result = parsePaymentRails(['', 'con QR', '']);
      expect(result).toContain('qr');
    });
  });
});
