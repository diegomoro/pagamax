import type {
  CheckoutRoutePlan,
  CheckoutRoutePlanSignatureVerifier,
  CheckoutRoutePlanValidationContext,
  CheckoutRoutePlanValidationResult,
  LiquidityRoutePlan,
  LiquidityRoutePlanValidationContext,
} from './types';

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const IDENTITY_HASH_PATTERN = /^[a-z0-9:_-]{16,160}$/i;
const VERIFIED_IDENTITY_STATUS = 'same_owner_verified';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

export function canonicalizeCheckoutRoutePlan(plan: CheckoutRoutePlan): string {
  const { signature: _signature, ...unsigned } = plan;
  return JSON.stringify(stable(unsigned));
}

export function canonicalizeLiquidityRoutePlan(plan: LiquidityRoutePlan): string {
  const { signature: _signature, ...unsigned } = plan;
  return JSON.stringify(stable(unsigned));
}

function parseTime(value: string): number | null {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function isAllowedHandoffUrl(value: string | null | undefined, allowed: string[] | undefined): boolean {
  if (!value) return true;
  return (allowed ?? []).some((allowedValue) => value === allowedValue || value.startsWith(`${allowedValue}?`));
}

export async function validateCheckoutRoutePlan(
  plan: CheckoutRoutePlan,
  context: CheckoutRoutePlanValidationContext,
  verifySignature: CheckoutRoutePlanSignatureVerifier,
): Promise<CheckoutRoutePlanValidationResult> {
  const errors: string[] = [];
  const canonicalPayload = canonicalizeCheckoutRoutePlan(plan);
  const now = context.now instanceof Date ? context.now.getTime() : Date.parse(context.now ?? new Date().toISOString());
  const issuedAt = parseTime(plan.issuedAt);
  const expiresAt = parseTime(plan.expiresAt);

  if (plan.version !== 1) errors.push('unsupported_version');
  if (!plan.routeId || plan.routeId.length < 12) errors.push('invalid_route_id');
  if (!plan.nonce || plan.nonce.length < 16) errors.push('invalid_nonce');
  if (plan.qrHash !== context.expectedQrHash || !HASH_PATTERN.test(plan.qrHash)) errors.push('qr_hash_mismatch');
  if (plan.amountArs !== context.expectedAmountArs || !Number.isFinite(plan.amountArs) || plan.amountArs <= 0) errors.push('amount_mismatch');
  if (context.expectedProvider && plan.provider !== context.expectedProvider) errors.push('provider_mismatch');
  if (context.expectedAndroidPackage && plan.androidPackage !== context.expectedAndroidPackage) errors.push('android_package_mismatch');
  if (context.expectedAccountIdentityHash && plan.accountIdentityHash !== context.expectedAccountIdentityHash) errors.push('account_identity_mismatch');
  if (plan.accountIdentityHash != null && !IDENTITY_HASH_PATTERN.test(plan.accountIdentityHash)) errors.push('invalid_account_identity_hash');
  if (plan.methodOwnerIdentityHash != null && !IDENTITY_HASH_PATTERN.test(plan.methodOwnerIdentityHash)) errors.push('invalid_method_owner_identity_hash');
  if (
    context.requireSameOwnerForFunding === true
    && (plan.fundingRail === 'debin_pull' || plan.fundingRail === 'verified_prefilled_transfer')
  ) {
    if (!plan.accountIdentityHash || plan.accountIdentityHash !== plan.methodOwnerIdentityHash) {
      errors.push('same_owner_identity_required');
    }
    if (
      plan.accountIdentityVerificationStatus !== VERIFIED_IDENTITY_STATUS
      || plan.methodOwnerIdentityVerificationStatus !== VERIFIED_IDENTITY_STATUS
    ) {
      errors.push('same_owner_identity_not_verified');
    }
  }
  if (!context.allowedAndroidPackages.includes(plan.androidPackage)) errors.push('android_package_not_allowed');
  if (plan.destinationAliasHash != null && !HASH_PATTERN.test(plan.destinationAliasHash)) errors.push('invalid_destination_alias_hash');
  if (!isAllowedHandoffUrl(plan.handoffUrl, context.allowedHandoffUrls)) errors.push('handoff_url_not_allowed');
  if (issuedAt === null || expiresAt === null) errors.push('invalid_route_time');
  if (expiresAt !== null && expiresAt <= now) errors.push('route_expired');
  if (issuedAt !== null && issuedAt > now + 120000) errors.push('route_issued_in_future');
  if (issuedAt !== null && expiresAt !== null && expiresAt - issuedAt > 120000) errors.push('route_ttl_too_long');

  const signatureOk = await verifySignature(canonicalPayload, plan.signature);
  if (!signatureOk) errors.push('invalid_signature');

  return {
    ok: errors.length === 0,
    canonicalPayload,
    errors,
  };
}

export async function validateLiquidityRoutePlan(
  plan: LiquidityRoutePlan,
  context: LiquidityRoutePlanValidationContext,
  verifySignature: CheckoutRoutePlanSignatureVerifier,
): Promise<CheckoutRoutePlanValidationResult> {
  const errors: string[] = [];
  const canonicalPayload = canonicalizeLiquidityRoutePlan(plan);
  const now = context.now instanceof Date ? context.now.getTime() : Date.parse(context.now ?? new Date().toISOString());
  const issuedAt = parseTime(plan.issuedAt);
  const expiresAt = parseTime(plan.expiresAt);

  if (plan.version !== 1) errors.push('unsupported_version');
  if (!plan.routeId || plan.routeId.length < 12) errors.push('invalid_route_id');
  if (!plan.nonce || plan.nonce.length < 16) errors.push('invalid_nonce');
  if (plan.qrHash !== context.expectedQrHash || !HASH_PATTERN.test(plan.qrHash)) errors.push('qr_hash_mismatch');
  if (plan.amountArs !== context.expectedAmountArs || !Number.isFinite(plan.amountArs) || plan.amountArs <= 0) errors.push('amount_mismatch');
  if (context.expectedMerchantName && plan.merchantName !== context.expectedMerchantName) errors.push('merchant_mismatch');
  if (context.expectedSourceProvider && plan.sourceProvider !== context.expectedSourceProvider) errors.push('source_provider_mismatch');
  if (context.expectedSourceAccountId && plan.sourceAccountId !== context.expectedSourceAccountId) errors.push('source_account_mismatch');
  if (context.expectedTargetProvider && plan.targetProvider !== context.expectedTargetProvider) errors.push('target_provider_mismatch');
  if (context.expectedTargetAccountId && plan.targetAccountId !== context.expectedTargetAccountId) errors.push('target_account_mismatch');
  if (context.expectedTargetAliasHash !== undefined && plan.targetAliasHash !== context.expectedTargetAliasHash) errors.push('target_alias_mismatch');
  if (context.expectedPaymentAndroidPackage && plan.paymentAndroidPackage !== context.expectedPaymentAndroidPackage) errors.push('payment_android_package_mismatch');
  if (context.expectedFundingAndroidPackage !== undefined && plan.fundingAndroidPackage !== context.expectedFundingAndroidPackage) errors.push('funding_android_package_mismatch');
  if (context.expectedAccountIdentityHash && plan.accountIdentityHash !== context.expectedAccountIdentityHash) errors.push('account_identity_mismatch');
  if (plan.accountIdentityHash != null && !IDENTITY_HASH_PATTERN.test(plan.accountIdentityHash)) errors.push('invalid_account_identity_hash');
  if (plan.targetAliasHash != null && !HASH_PATTERN.test(plan.targetAliasHash)) errors.push('invalid_target_alias_hash');
  if (!context.allowedAndroidPackages.includes(plan.paymentAndroidPackage)) errors.push('payment_android_package_not_allowed');
  if (plan.fundingAndroidPackage && !context.allowedAndroidPackages.includes(plan.fundingAndroidPackage)) {
    errors.push('funding_android_package_not_allowed');
  }
  if (issuedAt === null || expiresAt === null) errors.push('invalid_route_time');
  if (expiresAt !== null && expiresAt <= now) errors.push('route_expired');
  if (issuedAt !== null && issuedAt > now + 120000) errors.push('route_issued_in_future');
  if (issuedAt !== null && expiresAt !== null && expiresAt - issuedAt > 120000) errors.push('route_ttl_too_long');

  const signatureOk = await verifySignature(canonicalPayload, plan.signature);
  if (!signatureOk) errors.push('invalid_signature');

  return {
    ok: errors.length === 0,
    canonicalPayload,
    errors,
  };
}
