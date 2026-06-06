import { PUBLIC_BACKEND_API_URL } from '@/config/public-build';
import type { AppSettings, BetaAccount, StoredPaymentMethod } from '@/types/app';

export interface BackendAccountPayload {
  email: string;
  displayName: string;
  phoneLabel?: string;
  inviteCode?: string;
  localAccountId?: string;
  appVariant?: string;
}

export interface BackendAccountResponse {
  id: string;
  syncStatus: BetaAccount['syncStatus'];
  emailVerified?: boolean;
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
}

export function hasManagedBackend(): boolean {
  return PUBLIC_BACKEND_API_URL.length > 0;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  if (!PUBLIC_BACKEND_API_URL) {
    throw new Error('Backend no configurado.');
  }

  const response = await fetch(`${PUBLIC_BACKEND_API_URL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Backend respondio HTTP ${response.status}.`);
  }

  return await response.json() as T;
}

export async function syncAccountWithBackend(payload: BackendAccountPayload): Promise<BackendAccountResponse | null> {
  if (!hasManagedBackend()) return null;
  return postJson<BackendAccountResponse>('/v1/accounts/sync', payload);
}

export async function requestAccountMagicLink(email: string): Promise<AuthRequestResult | null> {
  if (!hasManagedBackend()) return null;
  return postJson<AuthRequestResult>('/v1/auth/magic-link', {
    email,
    requestedAt: new Date().toISOString(),
  });
}

export async function refreshBackendSession(account: BetaAccount | null): Promise<BackendAccountResponse | null> {
  if (!hasManagedBackend() || !account) return null;
  return postJson<BackendAccountResponse>('/v1/auth/refresh', {
    accountId: account.id,
    email: account.email,
    requestedAt: new Date().toISOString(),
  });
}

export async function logoutBackendSession(account: BetaAccount | null): Promise<void> {
  if (!hasManagedBackend() || !account) return;
  await postJson('/v1/auth/logout', {
    accountId: account.id,
    email: account.email,
    requestedAt: new Date().toISOString(),
  });
}

export async function syncConsentState(account: BetaAccount | null, settings: AppSettings): Promise<void> {
  if (!hasManagedBackend() || !account) return;
  await postJson('/v1/accounts/consent', {
    accountId: account.id,
    analyticsEnabled: settings.analyticsEnabled,
    merchantInsightsEnabled: settings.merchantInsightsEnabled,
    sponsoredOffersEnabled: settings.sponsoredOffersEnabled,
    regionInsightsEnabled: settings.locationInsightsEnabled,
    updatedAt: new Date().toISOString(),
  });
}

export async function syncPaymentMethods(account: BetaAccount | null, methods: StoredPaymentMethod[]): Promise<void> {
  if (!hasManagedBackend() || !account) return;
  await postJson('/v1/accounts/payment-methods', {
    accountId: account.id,
    methods: methods.map((method) => ({
      id: method.id,
      provider: method.provider,
      instrumentType: method.cardType ?? method.rail,
      enabled: method.enabled,
      canPayMerchantQr: method.canPayMerchantQr !== false,
      label: method.label,
    })),
    updatedAt: new Date().toISOString(),
  });
}

export async function requestBackendAccountDeletion(account: BetaAccount | null): Promise<AccountDeletionResult | null> {
  if (!hasManagedBackend()) return null;
  return postJson<AccountDeletionResult>('/v1/accounts/delete', {
    accountId: account?.id ?? null,
    email: account?.email ?? null,
    requestedAt: new Date().toISOString(),
  });
}

export async function sendTelemetryBatch(events: unknown[]): Promise<void> {
  if (!hasManagedBackend() || events.length === 0) return;
  await postJson('/v1/telemetry/batch', { events });
}
