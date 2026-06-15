import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { BackendConfig } from './config.js';
import { HttpError } from './http.js';

export interface AccessTokenPayload {
  typ: 'access';
  sub: string;
  sid: string;
  iat: number;
  exp: number;
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function base64UrlJson(value: unknown): string {
  return base64Url(Buffer.from(JSON.stringify(value), 'utf8'));
}

function decodeBase64UrlJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
}

function hmac(value: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(value).digest();
}

export function randomToken(byteLength = 32): string {
  return base64Url(randomBytes(byteLength));
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function pepperedHash(value: string, pepper: string): string {
  return sha256Hex(`${pepper}:${value}`);
}

export function hashAuthToken(token: string, config: Pick<BackendConfig, 'tokenPepper'>): string {
  return pepperedHash(`auth-token:${token}`, config.tokenPepper);
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'invalid_email', 'email must be a string.');
  }

  const normalized = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) || normalized.length > 254) {
    throw new HttpError(400, 'invalid_email', 'email must be a valid email address.');
  }
  return normalized;
}

export function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.byteLength !== rightBuffer.byteLength) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function signAccessToken(
  accountId: string,
  sessionId: string,
  config: Pick<BackendConfig, 'authTokenSecret' | 'accessTokenTtlSeconds'>,
  now = new Date(),
): { token: string; expiresAt: string; payload: AccessTokenPayload } {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: AccessTokenPayload = {
    typ: 'access',
    sub: accountId,
    sid: sessionId,
    iat: issuedAt,
    exp: issuedAt + config.accessTokenTtlSeconds,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = base64Url(hmac(body, config.authTokenSecret));
  return {
    token: `${body}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    payload,
  };
}

export function verifyAccessToken(
  token: string,
  config: Pick<BackendConfig, 'authTokenSecret'>,
  now = new Date(),
): AccessTokenPayload {
  const parts = token.split('.');
  const header = parts[0];
  const payload = parts[1];
  const signature = parts[2];
  if (!header || !payload || !signature || parts.length !== 3) {
    throw new HttpError(401, 'invalid_access_token', 'Bearer token is malformed.');
  }

  const expectedSignature = base64Url(hmac(`${header}.${payload}`, config.authTokenSecret));
  if (!timingSafeStringEqual(signature, expectedSignature)) {
    throw new HttpError(401, 'invalid_access_token', 'Bearer token signature is invalid.');
  }

  const decoded = decodeBase64UrlJson(payload);
  if (!isAccessTokenPayload(decoded)) {
    throw new HttpError(401, 'invalid_access_token', 'Bearer token payload is invalid.');
  }

  if (decoded.exp <= Math.floor(now.getTime() / 1000)) {
    throw new HttpError(401, 'expired_access_token', 'Bearer token has expired.');
  }

  return decoded;
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.typ === 'access'
    && typeof record.sub === 'string'
    && typeof record.sid === 'string'
    && typeof record.iat === 'number'
    && typeof record.exp === 'number';
}
