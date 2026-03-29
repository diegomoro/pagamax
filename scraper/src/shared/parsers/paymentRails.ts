import type { PaymentRail } from '../types/normalized.js';

/**
 * parsePaymentRails
 *
 * Maps an array of raw payment-related strings to PaymentRail enum values.
 * Processes both paymentMethodText[] and railText[] arrays from candidates.
 * Reusable across all issuers.
 *
 * Handles:
 *   "con QR"               → "qr"
 *   "código QR"            → "qr"
 *   "NFC"                  → "nfc"
 *   "con tarjeta"          → "credit_card" (generic, no debit indicator)
 *   "tarjeta de crédito"   → "credit_card"
 *   "tarjeta de débito"    → "debit_card"
 *   "tarjeta prepaga"      → "prepaid_card"
 *   "billetera virtual"    → "wallet"
 *   "transferencia"        → "transfer"
 *   "Naranja X"            → "wallet" (wallet-first issuer)
 *
 * Returns a deduplicated array. Never throws.
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function detectRails(text: string): PaymentRail[] {
  const t = normalize(text);
  const rails: PaymentRail[] = [];

  if (/\bqr\b|codigo\s+qr/.test(t)) rails.push('qr');
  if (/\bnfc\b|contactless/.test(t)) rails.push('nfc');
  if (/tarjeta\s+de\s+cr[eé]dito|cr[eé]dito/.test(t)) rails.push('credit_card');
  if (/tarjeta\s+de\s+d[eé]bito|d[eé]bito/.test(t)) rails.push('debit_card');
  if (/tarjeta\s+prepaga|prepago/.test(t)) rails.push('prepaid_card');
  if (/billetera|wallet/.test(t)) rails.push('wallet');
  if (/transferencia/.test(t)) rails.push('transfer');

  // Generic "tarjeta" without debit/credit qualifier
  if (/\btarjeta\b/.test(t) && !rails.includes('credit_card') && !rails.includes('debit_card') && !rails.includes('prepaid_card')) {
    rails.push('credit_card'); // default to credit when unspecified
  }

  // Known wallet-first issuers
  if (/naranja\s*x|mercado\s*pago|ual[aá]|personal\s+pay|prex|modo\b|cuenta\s+dni/.test(t)) {
    if (!rails.includes('wallet')) rails.push('wallet');
  }

  return rails;
}

export function parsePaymentRails(texts: string[]): PaymentRail[] {
  const seen = new Set<PaymentRail>();
  for (const text of texts) {
    if (!text) continue;
    for (const rail of detectRails(text)) {
      seen.add(rail);
    }
  }
  return [...seen];
}
