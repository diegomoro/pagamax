import type { JsonObject, JsonValue } from './http.js';
import { isRecord } from './http.js';

const SENSITIVE_KEY_PATTERN = /(?:raw|qr|payload|dni|cuil|document|card|pan|cvv|cbu|cvu|alias|token|secret|password|email|phone|contact|location|lat|lng|biometric)/i;
const EVENT_NAME_PATTERN = /^[a-z0-9_.:-]{1,80}$/i;
const AMOUNT_BANDS = new Set(['unknown', '0-4999', '5000-14999', '15000-49999', '50000-149999', '150000+']);
const SAFE_PAYLOAD_KEYS = new Set([
  'source',
  'screen',
  'category',
  'matchMethod',
  'qrType',
  'providerHint',
  'recommendationCount',
  'liquidityRouteCount',
  'topProvider',
  'topValueType',
  'topRouteTier',
  'topFundingRail',
  'topFundingStatus',
  'amountEstimated',
  'reason',
  'result',
  'saved',
  'syncStatus',
  'identityVerificationStatus',
  'analyticsEnabled',
  'merchantInsightsEnabled',
  'sponsoredOffersEnabled',
  'regionInsightsEnabled',
]);

export interface SanitizedTelemetryEvent {
  eventName: string;
  merchantName: string | null;
  merchantCategory: string | null;
  amountBand: string | null;
  recommendationPosition: number | null;
  selectedProvider: string | null;
  handoffTarget: string | null;
  isSponsored: boolean;
  staleData: boolean;
  appVersion: string | null;
  deviceClass: string | null;
  payload: JsonObject;
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

function bool(value: unknown): boolean {
  return value === true;
}

function integer(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value;
}

function amountBand(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return AMOUNT_BANDS.has(value) ? value : 'unknown';
}

function eventName(value: unknown): string {
  const candidate = text(value, 80);
  return candidate && EVENT_NAME_PATTERN.test(candidate) ? candidate : 'unknown_event';
}

function safePayloadValue(value: unknown): JsonValue | null {
  if (typeof value === 'string') return value.slice(0, 120);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  if (value === null) return null;
  return null;
}

function scrubPayload(payload: unknown): JsonObject {
  if (!isRecord(payload)) return {};

  const safe: JsonObject = {};
  for (const [key, value] of Object.entries(payload).slice(0, 40)) {
    if (!SAFE_PAYLOAD_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key)) continue;
    const safeValue = safePayloadValue(value);
    if (safeValue !== null) safe[key] = safeValue;
  }
  return safe;
}

export function sanitizeTelemetryEvent(input: unknown): SanitizedTelemetryEvent {
  const record = isRecord(input) ? input : {};
  const payload = isRecord(record.payload) ? record.payload : record;
  const merchantName = text(payload.merchantName, 80);
  const category = text(payload.category ?? payload.merchantCategory, 60);

  return {
    eventName: eventName(record.name ?? record.eventName),
    merchantName,
    merchantCategory: category,
    amountBand: amountBand(payload.amountBand),
    recommendationPosition: integer(payload.recommendationPosition),
    selectedProvider: text(payload.selectedProvider ?? payload.topProvider, 80),
    handoffTarget: text(payload.handoffTarget, 80),
    isSponsored: bool(payload.isSponsored),
    staleData: bool(payload.staleData),
    appVersion: text(record.appVersion ?? payload.appVersion, 40),
    deviceClass: text(record.deviceClass ?? payload.deviceClass, 40),
    payload: scrubPayload(payload),
  };
}
