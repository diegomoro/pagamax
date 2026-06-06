declare const process: {
  env?: Record<string, string | undefined>;
};

const env = typeof process !== 'undefined' ? process.env ?? {} : {};

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

export const KILL_SWITCH_ENABLED = readBoolean('EXPO_PUBLIC_KILL_SWITCH', false);

export const PUBLIC_BACKEND_API_URL = env.EXPO_PUBLIC_BACKEND_API_URL?.trim() || '';

export const LEGAL_LINKS = {
  privacyPolicy: env.EXPO_PUBLIC_PRIVACY_URL?.trim()
    || 'https://github.com/diegomoro/pagamax/blob/public/play-beta/docs/legal/privacy-policy.md',
  terms: env.EXPO_PUBLIC_TERMS_URL?.trim()
    || 'https://github.com/diegomoro/pagamax/blob/public/play-beta/docs/legal/terms.md',
  accountDeletion: env.EXPO_PUBLIC_ACCOUNT_DELETION_URL?.trim()
    || 'https://github.com/diegomoro/pagamax/blob/public/play-beta/docs/legal/account-deletion.md',
  support: env.EXPO_PUBLIC_SUPPORT_URL?.trim()
    || 'mailto:support@pagamenos.app',
};
