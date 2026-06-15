import { describe, expect, it } from 'vitest';
import type { BackendConfig } from '../src/config';
import { isValidCuil, normalizeIdentityDocument } from '../src/identity';
import { hashAuthToken, signAccessToken, verifyAccessToken } from '../src/security';

const config: Pick<BackendConfig, 'authTokenSecret' | 'accessTokenTtlSeconds' | 'identityPepper' | 'tokenPepper'> = {
  authTokenSecret: 'test-auth-secret-12345678901234567890',
  accessTokenTtlSeconds: 900,
  identityPepper: 'test-identity-pepper-123456789012345',
  tokenPepper: 'test-token-pepper-123456789012345678',
};

describe('backend security helpers', () => {
  it('signs and verifies short-lived access tokens', () => {
    const issued = signAccessToken('account-1', 'session-1', config, new Date('2026-06-07T12:00:00.000Z'));

    expect(verifyAccessToken(issued.token, config, new Date('2026-06-07T12:01:00.000Z'))).toMatchObject({
      typ: 'access',
      sub: 'account-1',
      sid: 'session-1',
    });
    expect(() => verifyAccessToken(issued.token, config, new Date('2026-06-07T12:20:00.000Z'))).toThrow(/expired/i);
  });

  it('hashes auth tokens with a server pepper', () => {
    expect(hashAuthToken('same-token', config)).toBe(hashAuthToken('same-token', config));
    expect(hashAuthToken('same-token', config)).not.toBe(hashAuthToken('other-token', config));
  });

  it('validates CUIL check digits and hashes identity by embedded DNI', () => {
    const cuil = '20-12345678-6';

    expect(isValidCuil(cuil)).toBe(true);
    expect(normalizeIdentityDocument({ kind: 'cuil', normalizedCuil: cuil, normalizedDni: '12345678' }, config)).toMatchObject({
      kind: 'cuil',
      normalizedDni: '12345678',
      normalizedCuil: '20123456786',
      last4: '5678',
    });
    expect(() => normalizeIdentityDocument({ kind: 'cuil', normalizedCuil: '20-12345678-1' }, config)).toThrow(/CUIL/i);
  });
});
