import { describe, expect, it } from 'vitest';
import {
  canonicalizeCheckoutRoutePlan,
  canonicalizeLiquidityRoutePlan,
  validateCheckoutRoutePlan,
  validateLiquidityRoutePlan,
  type CheckoutRoutePlan,
  type CheckoutRoutePlanValidationContext,
  type LiquidityRoutePlan,
  type LiquidityRoutePlanValidationContext,
} from '../src/index.js';

const qrHash = 'a'.repeat(64);
const aliasHash = 'b'.repeat(64);
const identityHash = 'identity:sha256:user-1234567890abcdef';

function basePlan(overrides: Partial<CheckoutRoutePlan> = {}): CheckoutRoutePlan {
  return {
    version: 1,
    routeId: 'route_1234567890',
    nonce: 'nonce_1234567890abcdef',
    qrHash,
    merchantName: 'Carrefour',
    amountArs: 30000,
    provider: 'naranjax',
    androidPackage: 'com.tarjetanaranja.ncuenta',
    fundingRail: 'verified_prefilled_transfer',
    destinationAliasHash: aliasHash,
    accountIdentityHash: identityHash,
    accountIdentityVerificationStatus: 'same_owner_verified',
    methodOwnerIdentityHash: identityHash,
    methodOwnerIdentityVerificationStatus: 'same_owner_verified',
    handoffUrl: 'naranjax://checkout',
    issuedAt: '2026-06-07T12:00:00.000Z',
    expiresAt: '2026-06-07T12:01:00.000Z',
    signature: 'valid-signature',
    ...overrides,
  };
}

const context: CheckoutRoutePlanValidationContext = {
  expectedQrHash: qrHash,
  expectedAmountArs: 30000,
  expectedProvider: 'naranjax',
  expectedAndroidPackage: 'com.tarjetanaranja.ncuenta',
  allowedAndroidPackages: ['com.tarjetanaranja.ncuenta'],
  allowedHandoffUrls: ['naranjax://checkout'],
  expectedAccountIdentityHash: identityHash,
  requireSameOwnerForFunding: true,
  now: '2026-06-07T12:00:30.000Z',
};

describe('validateCheckoutRoutePlan', () => {
  it('accepts a signed route bound to QR, amount, destination, and package', async () => {
    const plan = basePlan();
    const expectedPayload = canonicalizeCheckoutRoutePlan(plan);
    const result = await validateCheckoutRoutePlan(plan, context, (payload, signature) => (
      payload === expectedPayload && signature === 'valid-signature'
    ));

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects alias, package, amount, and QR tampering', async () => {
    const plan = basePlan({
      qrHash: 'c'.repeat(64),
      amountArs: 31000,
      androidPackage: 'evil.package.name',
      destinationAliasHash: 'not-an-alias-hash',
    });

    const result = await validateCheckoutRoutePlan(plan, context, () => true);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('qr_hash_mismatch');
    expect(result.errors).toContain('amount_mismatch');
    expect(result.errors).toContain('android_package_mismatch');
    expect(result.errors).toContain('android_package_not_allowed');
    expect(result.errors).toContain('invalid_destination_alias_hash');
  });

  it('rejects same-owner funding when the method identity does not match the account identity', async () => {
    const result = await validateCheckoutRoutePlan(
      basePlan({
        methodOwnerIdentityHash: 'identity:sha256:attacker-1234567890',
      }),
      context,
      () => true,
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('same_owner_identity_required');
  });

  it('rejects same-owner funding when either identity is not verified', async () => {
    const result = await validateCheckoutRoutePlan(
      basePlan({
        accountIdentityVerificationStatus: 'pending',
        methodOwnerIdentityVerificationStatus: 'same_owner_verified',
      }),
      context,
      () => true,
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('same_owner_identity_not_verified');
  });

  it('rejects expired or overlong route plans', async () => {
    const result = await validateCheckoutRoutePlan(
      basePlan({
        issuedAt: '2026-06-07T11:55:00.000Z',
        expiresAt: '2026-06-07T12:10:00.000Z',
      }),
      context,
      () => true,
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('route_ttl_too_long');
  });

  it('rejects invalid signatures over the canonical payload', async () => {
    const result = await validateCheckoutRoutePlan(basePlan(), context, () => false);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('invalid_signature');
  });
});

const liquidityContext: LiquidityRoutePlanValidationContext = {
  expectedQrHash: qrHash,
  expectedAmountArs: 30000,
  expectedMerchantName: 'Carrefour',
  expectedSourceProvider: 'naranjax',
  expectedSourceAccountId: 'acct-nx',
  expectedTargetProvider: 'mercadopago',
  expectedTargetAccountId: 'acct-mp',
  expectedTargetAliasHash: aliasHash,
  expectedPaymentAndroidPackage: 'com.mercadopago.wallet',
  expectedFundingAndroidPackage: 'com.tarjetanaranja.ncuenta',
  expectedAccountIdentityHash: identityHash,
  allowedAndroidPackages: ['com.tarjetanaranja.ncuenta', 'com.mercadopago.wallet'],
  now: '2026-06-07T12:00:30.000Z',
};

function liquidityPlan(overrides: Partial<LiquidityRoutePlan> = {}): LiquidityRoutePlan {
  return {
    version: 1,
    routeId: 'route_liq_1234567890',
    nonce: 'nonce_1234567890abcdef',
    qrHash,
    merchantName: 'Carrefour',
    amountArs: 30000,
    sourceProvider: 'naranjax',
    sourceAccountId: 'acct-nx',
    targetProvider: 'mercadopago',
    targetAccountId: 'acct-mp',
    targetAliasHash: aliasHash,
    fundingRail: 'verified_prefilled_transfer',
    fundingStatus: 'instant',
    paymentAndroidPackage: 'com.mercadopago.wallet',
    fundingAndroidPackage: 'com.tarjetanaranja.ncuenta',
    accountIdentityHash: identityHash,
    issuedAt: '2026-06-07T12:00:00.000Z',
    expiresAt: '2026-06-07T12:01:00.000Z',
    signature: 'valid-signature',
    ...overrides,
  };
}

describe('validateLiquidityRoutePlan', () => {
  it('accepts a signed liquidity route bound to QR, amount, wallets, alias, packages, nonce, and expiry', async () => {
    const plan = liquidityPlan();
    const expectedPayload = canonicalizeLiquidityRoutePlan(plan);
    const result = await validateLiquidityRoutePlan(plan, liquidityContext, (payload, signature) => (
      payload === expectedPayload && signature === 'valid-signature'
    ));

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects tampered QR, amount, source, target, alias, package, nonce, expiry, and signature', async () => {
    const result = await validateLiquidityRoutePlan(
      liquidityPlan({
        nonce: 'short',
        qrHash: 'c'.repeat(64),
        amountArs: 31000,
        sourceAccountId: 'acct-other',
        targetProvider: 'personalpay',
        targetAliasHash: 'not-an-alias',
        paymentAndroidPackage: 'evil.package',
        fundingAndroidPackage: 'evil.source',
        expiresAt: '2026-06-07T12:00:10.000Z',
      }),
      liquidityContext,
      () => false,
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('invalid_nonce');
    expect(result.errors).toContain('qr_hash_mismatch');
    expect(result.errors).toContain('amount_mismatch');
    expect(result.errors).toContain('source_account_mismatch');
    expect(result.errors).toContain('target_provider_mismatch');
    expect(result.errors).toContain('target_alias_mismatch');
    expect(result.errors).toContain('invalid_target_alias_hash');
    expect(result.errors).toContain('payment_android_package_mismatch');
    expect(result.errors).toContain('payment_android_package_not_allowed');
    expect(result.errors).toContain('funding_android_package_mismatch');
    expect(result.errors).toContain('funding_android_package_not_allowed');
    expect(result.errors).toContain('route_expired');
    expect(result.errors).toContain('invalid_signature');
  });
});
