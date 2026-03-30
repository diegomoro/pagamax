/**
 * parse-emv.ts — EMVCo Merchant Presented Mode QR parser
 *
 * Argentine Transferencias 3.0 QR codes follow EMVCo MPM v1.0/1.1.
 * Payload is a plain text string using TLV (Tag-Length-Value) encoding:
 *   [2-char tag][2-char length][value of that length]
 *
 * Key tags for merchant identification (BCRA Com. A 6425/2018):
 *   50 — Merchant CUIT/CUIL (mandatory in Argentina)
 *   51 — CBU/CVU/Alias (reserved, optional data)
 *   59 — Merchant Name (up to 25 chars)
 *   52 — Merchant Category Code (MCC)
 *   60 — Merchant City
 *   58 — Country Code ("AR")
 *   63 — CRC-16 checksum
 */

export interface EmvTlv {
  tag: string;
  length: number;
  value: string;
  children?: EmvTlv[];
}

export interface ParsedQr {
  raw: string;
  fields: Map<string, EmvTlv>;
  cuit: string | null;
  merchantName: string | null;
  mcc: string | null;
  city: string | null;
  country: string | null;
  cbu: string | null;
  pointOfInitiation: string | null;
  paymentNetworks: EmvTlv[];
}

// Tags that contain nested TLV (template tags)
const TEMPLATE_TAGS = new Set([
  // Merchant Account Information (02-51)
  ...Array.from({ length: 50 }, (_, i) => String(i + 2).padStart(2, '0')),
  '62', // Additional Data
  '64', // Merchant Info Language Template
]);

/**
 * Parse a TLV-encoded string into an array of EmvTlv objects.
 * If a tag is a known template, its value is recursively parsed.
 */
export function parseTlv(data: string, parseTemplates = true): EmvTlv[] {
  const results: EmvTlv[] = [];
  let pos = 0;

  while (pos + 4 <= data.length) {
    const tag = data.slice(pos, pos + 2);
    const lengthStr = data.slice(pos + 2, pos + 4);
    const length = parseInt(lengthStr, 10);

    if (isNaN(length) || pos + 4 + length > data.length) break;

    const value = data.slice(pos + 4, pos + 4 + length);
    const tlv: EmvTlv = { tag, length, value };

    if (parseTemplates && TEMPLATE_TAGS.has(tag) && value.length >= 4) {
      try {
        tlv.children = parseTlv(value, true);
      } catch {
        // Not a valid nested TLV — keep value as-is
      }
    }

    results.push(tlv);
    pos += 4 + length;
  }

  return results;
}

/**
 * Extract the CUIT from tag 50.
 * Tag 50 may itself be a template with sub-tag 00 containing the CUIT,
 * or the value may be the CUIT directly (11 digits).
 */
function extractCuit(tlv: EmvTlv): string | null {
  // If it has children, look for sub-tag 00
  if (tlv.children) {
    const sub00 = tlv.children.find(c => c.tag === '00');
    if (sub00) {
      const digits = sub00.value.replace(/\D/g, '');
      if (digits.length === 11) return digits;
    }
  }
  // Try the raw value
  const digits = tlv.value.replace(/\D/g, '');
  if (digits.length === 11) return digits;
  // Zero-padded?
  const stripped = digits.replace(/^0+/, '');
  if (stripped.length === 11) return stripped;
  return digits.length >= 11 ? digits.slice(-11) : null;
}

/**
 * Parse an EMVCo MPM QR payload string and extract key merchant fields.
 */
export function parseQr(payload: string): ParsedQr {
  const tlvList = parseTlv(payload);
  const fields = new Map<string, EmvTlv>();
  for (const tlv of tlvList) fields.set(tlv.tag, tlv);

  const tag50 = fields.get('50');
  const tag51 = fields.get('51');

  // Extract CBU/alias from tag 51
  let cbu: string | null = null;
  if (tag51) {
    if (tag51.children) {
      const sub = tag51.children.find(c => c.tag === '00' || c.tag === '01');
      cbu = sub?.value ?? tag51.value;
    } else {
      cbu = tag51.value;
    }
  }

  // Collect payment network templates (tags 02-49)
  const paymentNetworks: EmvTlv[] = [];
  for (let i = 2; i <= 49; i++) {
    const tag = String(i).padStart(2, '0');
    const tlv = fields.get(tag);
    if (tlv) paymentNetworks.push(tlv);
  }

  return {
    raw: payload,
    fields,
    cuit: tag50 ? extractCuit(tag50) : null,
    merchantName: fields.get('59')?.value ?? null,
    mcc: fields.get('52')?.value ?? null,
    city: fields.get('60')?.value ?? null,
    country: fields.get('58')?.value ?? null,
    cbu,
    pointOfInitiation: fields.get('01')?.value ?? null,
    paymentNetworks,
  };
}
