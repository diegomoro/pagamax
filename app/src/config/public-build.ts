declare const process: {
  env?: Record<string, string | undefined>;
};

import Constants from 'expo-constants';

const env = typeof process !== 'undefined' ? process.env ?? {} : {};
const extra = Constants.expoConfig?.extra ?? {};

function readString(name: string, extraName: string): string {
  return env[name]?.trim() || (typeof extra[extraName] === 'string' ? extra[extraName].trim() : '');
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = env[name];
  if (value == null || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export const APP_VARIANT = env.EXPO_PUBLIC_APP_VARIANT?.trim() || 'public';
export const IS_PUBLIC_BUILD = APP_VARIANT === 'public';

export const PUBLIC_RECOMMENDATION_ONLY = readBoolean(
  'EXPO_PUBLIC_RECOMMENDATION_ONLY',
  IS_PUBLIC_BUILD,
);

export const OWNER_SPLIT_FLOW_ENABLED = readBoolean(
  'EXPO_PUBLIC_OWNER_SPLIT_FLOW',
  !IS_PUBLIC_BUILD,
) && !PUBLIC_RECOMMENDATION_ONLY;

export const PAYMENT_PROOF_ENABLED = readBoolean(
  'EXPO_PUBLIC_PAYMENT_PROOF',
  !IS_PUBLIC_BUILD,
) && OWNER_SPLIT_FLOW_ENABLED;

export const FUNDING_DESTINATIONS_ENABLED = readBoolean(
  'EXPO_PUBLIC_FUNDING_DESTINATIONS',
  false,
) && !PUBLIC_RECOMMENDATION_ONLY;

export const KILL_SWITCH_ENABLED = readBoolean('EXPO_PUBLIC_KILL_SWITCH', false);

export const PUBLIC_BACKEND_API_URL = readString('EXPO_PUBLIC_BACKEND_API_URL', 'backendApiUrl');

export const LEGAL_LINKS = {
  privacyPolicy: readString('EXPO_PUBLIC_PRIVACY_URL', 'privacyUrl')
    || 'https://pagamax-public-beta-backend.vercel.app/privacy',
  terms: readString('EXPO_PUBLIC_TERMS_URL', 'termsUrl')
    || 'https://pagamax-public-beta-backend.vercel.app/terms',
  accountDeletion: readString('EXPO_PUBLIC_ACCOUNT_DELETION_URL', 'accountDeletionUrl')
    || 'https://pagamax-public-beta-backend.vercel.app/delete-account',
  support: readString('EXPO_PUBLIC_SUPPORT_URL', 'supportUrl')
    || 'https://pagamax-public-beta-backend.vercel.app/support',
};
