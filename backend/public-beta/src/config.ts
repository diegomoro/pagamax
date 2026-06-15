import { HttpError } from './http.js';

const DEFAULT_PUBLIC_BASE_URL = 'https://pagamax-public-beta-backend.vercel.app';

export interface BackendConfig {
  databaseUrl: string | null;
  publicBaseUrl: string;
  appDeepLinkBase: string;
  authTokenSecret: string;
  tokenPepper: string;
  identityPepper: string;
  resendApiKey: string | null;
  magicLinkFrom: string;
  merchantApiKey: string | null;
  allowDevAuthResponse: boolean;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  magicLinkTtlMinutes: number;
  privacyUrl: string;
  termsUrl: string;
  accountDeletionUrl: string;
  supportUrl: string;
}

export type PublicBackendConfig = Pick<
  BackendConfig,
  'databaseUrl'
  | 'privacyUrl'
  | 'termsUrl'
  | 'accountDeletionUrl'
  | 'supportUrl'
>;

function envValue(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function requiredSecret(env: NodeJS.ProcessEnv, name: string): string {
  const value = envValue(env, name);
  if (!value || value.length < 32) {
    throw new HttpError(503, 'backend_misconfigured', `${name} must be configured with at least 32 characters.`);
  }
  return value;
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPublicConfig(env: NodeJS.ProcessEnv = process.env): PublicBackendConfig {
  const publicBaseUrl = envValue(env, 'PAGAMAX_PUBLIC_BASE_URL') ?? DEFAULT_PUBLIC_BASE_URL;
  return {
    databaseUrl: envValue(env, 'DATABASE_URL'),
    privacyUrl: envValue(env, 'PAGAMAX_PRIVACY_URL') ?? `${publicBaseUrl}/privacy`,
    termsUrl: envValue(env, 'PAGAMAX_TERMS_URL') ?? `${publicBaseUrl}/terms`,
    accountDeletionUrl: envValue(env, 'PAGAMAX_ACCOUNT_DELETION_URL') ?? `${publicBaseUrl}/delete-account`,
    supportUrl: envValue(env, 'PAGAMAX_SUPPORT_URL') ?? `${publicBaseUrl}/support`,
  };
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const publicBaseUrl = envValue(env, 'PAGAMAX_PUBLIC_BASE_URL') ?? DEFAULT_PUBLIC_BASE_URL;
  return {
    databaseUrl: envValue(env, 'DATABASE_URL'),
    publicBaseUrl,
    appDeepLinkBase: envValue(env, 'PAGAMAX_APP_DEEP_LINK_BASE') ?? 'pagamenos://auth',
    authTokenSecret: requiredSecret(env, 'PAGAMAX_AUTH_TOKEN_SECRET'),
    tokenPepper: requiredSecret(env, 'PAGAMAX_TOKEN_PEPPER'),
    identityPepper: requiredSecret(env, 'PAGAMAX_IDENTITY_PEPPER'),
    resendApiKey: envValue(env, 'RESEND_API_KEY'),
    magicLinkFrom: envValue(env, 'PAGAMAX_MAGIC_LINK_FROM') ?? 'Paga Menos <login@pagamenos.app>',
    merchantApiKey: envValue(env, 'PAGAMAX_MERCHANT_API_KEY'),
    allowDevAuthResponse: envValue(env, 'PAGAMAX_ALLOW_DEV_AUTH_RESPONSE') === 'true',
    accessTokenTtlSeconds: parsePositiveInt(envValue(env, 'PAGAMAX_ACCESS_TOKEN_TTL_SECONDS'), 15 * 60),
    refreshTokenTtlDays: parsePositiveInt(envValue(env, 'PAGAMAX_REFRESH_TOKEN_TTL_DAYS'), 30),
    magicLinkTtlMinutes: parsePositiveInt(envValue(env, 'PAGAMAX_MAGIC_LINK_TTL_MINUTES'), 15),
    privacyUrl: envValue(env, 'PAGAMAX_PRIVACY_URL') ?? `${publicBaseUrl}/privacy`,
    termsUrl: envValue(env, 'PAGAMAX_TERMS_URL') ?? `${publicBaseUrl}/terms`,
    accountDeletionUrl: envValue(env, 'PAGAMAX_ACCOUNT_DELETION_URL') ?? `${publicBaseUrl}/delete-account`,
    supportUrl: envValue(env, 'PAGAMAX_SUPPORT_URL') ?? `${publicBaseUrl}/support`,
  };
}

export interface PublicRemoteConfigPayload {
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
  legal: {
    privacyUrl: string;
    termsUrl: string;
    accountDeletionUrl: string;
    supportUrl: string;
  };
}

export function buildDefaultRemoteConfig(config: PublicBackendConfig): PublicRemoteConfigPayload {
  return {
    version: 1,
    variant: 'public-beta',
    killSwitch: false,
    disabledProviders: [],
    staleDataThresholdHours: 48,
    sponsoredOffersEnabled: false,
    recommendationOnly: true,
    ownerSplitFlowEnabled: false,
    paymentProofEnabled: false,
    checkoutRoutePlansEnabled: false,
    liquidityRoutePlansEnabled: false,
    legal: {
      privacyUrl: config.privacyUrl,
      termsUrl: config.termsUrl,
      accountDeletionUrl: config.accountDeletionUrl,
      supportUrl: config.supportUrl,
    },
  };
}
