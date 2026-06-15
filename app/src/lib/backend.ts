import { PUBLIC_BACKEND_API_URL } from '@/config/public-build';
import type {
  AppSettings,
  BackendSession,
  BetaAccount,
  FundingLookupKind,
  ResolvedFundingDestination,
  StoredFundingDestination,
  StoredPaymentMethod,
} from '@/types/app';

export interface BackendAccountPayload {
  email: string;
  displayName: string;
  phoneLabel?: string;
  inviteCode?: string;
  identityDocument?: {
    kind: 'dni' | 'cuil';
    normalizedDni: string;
    normalizedCuil?: string | null;
  };
  localAccountId?: string;
  appVariant?: string;
}

export interface BackendAccountResponse {
  id: string;
  email?: string;
  displayName?: string;
  syncStatus: BetaAccount['syncStatus'];
  emailVerified?: boolean;
  identityDocumentKind?: BetaAccount['identityDocumentKind'];
  identityDocumentLast4?: string;
  identityVerificationStatus?: BetaAccount['identityVerificationStatus'];
  identityHash?: string;
  deviceBoundAt?: string;
  sessionExpiresAt?: string;
}

export interface AccountDeletionResult {
  requestId: string;
  retainedForSecurity: boolean;
}

export interface AuthRequestResult {
  status: 'sent' | 'disabled';
  expiresAt?: string;
  devExchangeToken?: string;
  devExchangeUrl?: string;
}

export interface AuthExchangeResult extends BackendSession {
  account: BackendAccountResponse;
}

export interface DeviceAuthMetadata {
  deviceBindingId?: string;
  appVersion?: string;
  platform?: string;
  deviceClass?: string;
}

export interface PublicRemoteConfig {
  version: number;
  variant: 'public-beta';
  killSwitch: boolean;
  disabledProviders: string[];
  staleDataThresholdHours: number;
  sponsoredOffersEnabled: boolean;
  recommendationOnly: true;
  ownerSplitFlowEnabled: false;
  paymentProofEnabled: false;
  checkoutRoutePlansEnabled: false;
  liquidityRoutePlansEnabled: false;
  legal?: {
    privacyUrl?: string;
    termsUrl?: string;
    accountDeletionUrl?: string;
    supportUrl?: string;
  };
}

export interface FundingDestinationResolvePayload {
  accountId: string;
  accountIdentityHash: string;
  lookupKind: FundingLookupKind;
  lookupValue: string;
}

export interface FundingDestinationConfirmPayload {
  accountId: string;
  lookupId: string;
  userConfirmedDetails: boolean;
}

export function hasManagedBackend(): boolean {
  return PUBLIC_BACKEND_API_URL.length > 0;
}

async function postJson<T>(path: string, payload: unknown, accessToken?: string | null): Promise<T> {
  if (!PUBLIC_BACKEND_API_URL) {
    throw new Error('Backend no configurado.');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${PUBLIC_BACKEND_API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Backend respondio HTTP ${response.status}.`);
  }

  return await response.json() as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeRemoteConfig(raw: unknown): PublicRemoteConfig {
  const envelope = isRecord(raw) && isRecord(raw.signedPayload) ? raw.signedPayload : raw;
  if (!isRecord(envelope)) throw new Error('Remote config invalida.');

  return {
    version: typeof envelope.version === 'number' ? envelope.version : 0,
    variant: 'public-beta',
    killSwitch: envelope.killSwitch === true,
    disabledProviders: optionalStringArray(envelope.disabledProviders),
    staleDataThresholdHours: typeof envelope.staleDataThresholdHours === 'number' ? envelope.staleDataThresholdHours : 48,
    sponsoredOffersEnabled: envelope.sponsoredOffersEnabled === true,
    recommendationOnly: true,
    ownerSplitFlowEnabled: false,
    paymentProofEnabled: false,
    checkoutRoutePlansEnabled: false,
    liquidityRoutePlansEnabled: false,
    legal: isRecord(envelope.legal) ? {
      privacyUrl: typeof envelope.legal.privacyUrl === 'string' ? envelope.legal.privacyUrl : undefined,
      termsUrl: typeof envelope.legal.termsUrl === 'string' ? envelope.legal.termsUrl : undefined,
      accountDeletionUrl: typeof envelope.legal.accountDeletionUrl === 'string' ? envelope.legal.accountDeletionUrl : undefined,
      supportUrl: typeof envelope.legal.supportUrl === 'string' ? envelope.legal.supportUrl : undefined,
    } : undefined,
  };
}

export async function fetchBackendRemoteConfig(): Promise<PublicRemoteConfig | null> {
  if (!hasManagedBackend()) return null;

  const response = await fetch(`${PUBLIC_BACKEND_API_URL}/v1/remote-config`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Backend respondio HTTP ${response.status}.`);
  }

  return normalizeRemoteConfig(await response.json());
}

export async function syncAccountWithBackend(
  payload: BackendAccountPayload,
  session: BackendSession | null,
): Promise<BackendAccountResponse | null> {
  if (!hasManagedBackend() || !session) return null;
  return postJson<BackendAccountResponse>('/v1/accounts/sync', payload, session.accessToken);
}

export async function requestAccountMagicLink(email: string, displayName?: string): Promise<AuthRequestResult | null> {
  if (!hasManagedBackend()) return null;
  return postJson<AuthRequestResult>('/v1/auth/magic-link', {
    email,
    displayName,
    requestedAt: new Date().toISOString(),
  });
}

export async function exchangeBackendAuthToken(exchangeToken: string, metadata: DeviceAuthMetadata = {}): Promise<AuthExchangeResult | null> {
  if (!hasManagedBackend()) return null;
  return postJson<AuthExchangeResult>('/v1/auth/exchange', {
    exchangeToken,
    ...metadata,
    requestedAt: new Date().toISOString(),
  });
}

export async function refreshBackendSession(session: BackendSession | null): Promise<BackendSession | null> {
  if (!hasManagedBackend() || !session) return null;
  return postJson<BackendSession>('/v1/auth/refresh', {
    refreshToken: session.refreshToken,
    requestedAt: new Date().toISOString(),
  });
}

export async function logoutBackendSession(session: BackendSession | null): Promise<void> {
  if (!hasManagedBackend() || !session) return;
  await postJson('/v1/auth/logout', {
    requestedAt: new Date().toISOString(),
  }, session.accessToken);
}

export async function syncConsentState(account: BetaAccount | null, settings: AppSettings, session: BackendSession | null): Promise<void> {
  if (!hasManagedBackend() || !account || !session) return;
  await postJson('/v1/accounts/consent', {
    accountId: account.id,
    analyticsEnabled: settings.analyticsEnabled,
    merchantInsightsEnabled: settings.merchantInsightsEnabled,
    sponsoredOffersEnabled: settings.sponsoredOffersEnabled,
    regionInsightsEnabled: settings.locationInsightsEnabled,
    updatedAt: new Date().toISOString(),
  }, session.accessToken);
}

export async function syncPaymentMethods(
  account: BetaAccount | null,
  methods: StoredPaymentMethod[],
  session: BackendSession | null,
): Promise<void> {
  if (!hasManagedBackend() || !account || !session) return;
  await postJson('/v1/accounts/payment-methods', {
    accountId: account.id,
    methods: methods.map((method) => ({
      id: method.id,
      provider: method.provider,
      instrumentType: method.cardType ?? method.rail,
      enabled: method.enabled,
      canPayMerchantQr: method.canPayMerchantQr !== false,
      label: method.label,
      ownerIdentityLast4: method.ownerIdentityLast4 ?? null,
      ownerIdentityHash: method.ownerIdentityHash ?? null,
      identityVerificationStatus: method.identityVerificationStatus ?? 'unverified',
    })),
    updatedAt: new Date().toISOString(),
  }, session.accessToken);
}

export async function resolveFundingDestination(payload: FundingDestinationResolvePayload): Promise<ResolvedFundingDestination | null> {
  if (!hasManagedBackend()) return null;
  return postJson<ResolvedFundingDestination>('/v1/accounts/funding-destinations/verify', {
    ...payload,
    requestedAt: new Date().toISOString(),
  });
}

export async function confirmFundingDestination(payload: FundingDestinationConfirmPayload): Promise<StoredFundingDestination | null> {
  if (!hasManagedBackend()) return null;
  return postJson<StoredFundingDestination>('/v1/accounts/funding-destinations', {
    ...payload,
    requestedAt: new Date().toISOString(),
  });
}

export async function requestBackendAccountDeletion(
  account: BetaAccount | null,
  session: BackendSession | null,
): Promise<AccountDeletionResult | null> {
  if (!hasManagedBackend()) return null;
  return postJson<AccountDeletionResult>('/v1/accounts/delete', {
    accountId: account?.id ?? null,
    email: account?.email ?? null,
    requestedAt: new Date().toISOString(),
  }, session?.accessToken);
}

export async function sendTelemetryBatch(events: unknown[], accessToken?: string | null): Promise<void> {
  if (!hasManagedBackend() || events.length === 0) return;
  await postJson('/v1/telemetry/batch', { events }, accessToken);
}
