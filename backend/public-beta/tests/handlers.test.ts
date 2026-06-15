import { describe, expect, it } from 'vitest';
import type { BackendConfig } from '../src/config';
import type { SqlClient } from '../src/db';
import { routeRequest } from '../src/handlers';

const config: BackendConfig = {
  databaseUrl: 'postgres://unit-test',
  publicBaseUrl: 'https://api.pagamenos.test',
  appDeepLinkBase: 'pagamenos://auth',
  authTokenSecret: 'test-auth-secret-12345678901234567890',
  tokenPepper: 'test-token-pepper-123456789012345678',
  identityPepper: 'test-identity-pepper-123456789012345',
  resendApiKey: null,
  magicLinkFrom: 'Paga Menos <login@example.test>',
  merchantApiKey: 'merchant-key-12345678901234567890',
  allowDevAuthResponse: true,
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 30,
  magicLinkTtlMinutes: 15,
  privacyUrl: 'https://pagamenos.test/privacy',
  termsUrl: 'https://pagamenos.test/terms',
  accountDeletionUrl: 'https://pagamenos.test/delete',
  supportUrl: 'mailto:support@pagamenos.test',
};

describe('backend route surface', () => {
  it('exposes a public health check without auth', async () => {
    const response = await routeRequest({
      method: 'GET',
      url: '/v1/health',
      headers: {},
    }, { config });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      recommendationOnly: true,
    });
  });

  it('keeps public funding and route-plan endpoints disabled', async () => {
    const response = await routeRequest({
      method: 'POST',
      url: '/v1/checkout/route-plans',
      headers: {},
      body: { amountCents: 1000 },
    }, { config });
    const liquidityResponse = await routeRequest({
      method: 'POST',
      url: '/v1/liquidity/route-plans',
      headers: {},
      body: { amountCents: 1000 },
    }, { config });
    const matrixResponse = await routeRequest({
      method: 'GET',
      url: '/v1/liquidity/pair-capabilities',
      headers: {},
    }, { config });

    expect(response.status).toBe(403);
    expect(liquidityResponse.status).toBe(403);
    expect(matrixResponse.status).toBe(403);
    expect(JSON.stringify(response.body)).toContain('funding_disabled_public_beta');
  });

  it('returns a safe default remote config when no remote config row is published', async () => {
    const sql: SqlClient = async () => [];
    const response = await routeRequest({
      method: 'GET',
      url: '/v1/remote-config',
      headers: {},
    }, { config, sql });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      recommendationOnly: true,
      ownerSplitFlowEnabled: false,
      paymentProofEnabled: false,
      checkoutRoutePlansEnabled: false,
      liquidityRoutePlansEnabled: false,
    });
  });

  it('serves default remote config without auth secrets configured', async () => {
    const previousEnv = {
      databaseUrl: process.env.DATABASE_URL,
      authTokenSecret: process.env.PAGAMAX_AUTH_TOKEN_SECRET,
      tokenPepper: process.env.PAGAMAX_TOKEN_PEPPER,
      identityPepper: process.env.PAGAMAX_IDENTITY_PEPPER,
    };
    delete process.env.DATABASE_URL;
    delete process.env.PAGAMAX_AUTH_TOKEN_SECRET;
    delete process.env.PAGAMAX_TOKEN_PEPPER;
    delete process.env.PAGAMAX_IDENTITY_PEPPER;

    try {
      const response = await routeRequest({
        method: 'GET',
        url: '/v1/remote-config',
        headers: {},
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        recommendationOnly: true,
        ownerSplitFlowEnabled: false,
        paymentProofEnabled: false,
        checkoutRoutePlansEnabled: false,
        liquidityRoutePlansEnabled: false,
      });
    } finally {
      if (previousEnv.databaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousEnv.databaseUrl;
      if (previousEnv.authTokenSecret === undefined) delete process.env.PAGAMAX_AUTH_TOKEN_SECRET;
      else process.env.PAGAMAX_AUTH_TOKEN_SECRET = previousEnv.authTokenSecret;
      if (previousEnv.tokenPepper === undefined) delete process.env.PAGAMAX_TOKEN_PEPPER;
      else process.env.PAGAMAX_TOKEN_PEPPER = previousEnv.tokenPepper;
      if (previousEnv.identityPepper === undefined) delete process.env.PAGAMAX_IDENTITY_PEPPER;
      else process.env.PAGAMAX_IDENTITY_PEPPER = previousEnv.identityPepper;
    }
  });

  it('rejects malformed JSON request bodies as client errors', async () => {
    await expect(routeRequest({
      method: 'POST',
      url: '/v1/auth/magic-link',
      headers: {},
      body: '{not-json',
    }, { config })).rejects.toMatchObject({
      status: 400,
      code: 'invalid_json',
    });
  });

  it('creates a magic link without exposing the token unless dev auth is enabled', async () => {
    const calls: string[] = [];
    const sql: SqlClient = async <T extends Record<string, unknown> = Record<string, unknown>>(strings: TemplateStringsArray) => {
      const statement = strings.join('?');
      calls.push(statement);
      if (statement.includes('insert into public.accounts')) {
        return [{
          id: 'account-1',
          email: 'user@example.test',
          display_name: 'user',
          identity_document_kind: null,
          identity_document_last4: null,
          identity_hash: null,
          identity_verification_status: 'unverified',
          email_verified_at: null,
          status: 'active',
        }] as unknown as T[];
      }
      return [] as T[];
    };

    const response = await routeRequest({
      method: 'POST',
      url: '/v1/auth/magic-link',
      headers: {},
      body: { email: 'USER@example.test' },
    }, { config, sql });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'sent' });
    expect(JSON.stringify(response.body)).toContain('devExchangeToken');
    expect(calls.some((statement) => statement.includes('public.auth_magic_links'))).toBe(true);
  });
});
