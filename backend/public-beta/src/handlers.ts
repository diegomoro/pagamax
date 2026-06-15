import type { BackendConfig } from './config.js';
import { buildDefaultRemoteConfig, getConfig, getPublicConfig } from './config.js';
import { firstRow, getSql, type DbRow, type SqlClient } from './db.js';
import { normalizeIdentityDocument } from './identity.js';
import {
  getHeader,
  getRequestPath,
  HttpError,
  isRecord,
  jsonResponse,
  readJsonBody,
  type ApiRequest,
  type ApiResponse,
  type JsonObject,
  type JsonValue,
  type RouteResponse,
  writeError,
  writeRouteResponse,
} from './http.js';
import { sanitizeTelemetryEvent } from './redaction.js';
import {
  hashAuthToken,
  normalizeEmail,
  pepperedHash,
  randomToken,
  signAccessToken,
  timingSafeStringEqual,
  verifyAccessToken,
} from './security.js';

const JSON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Pagamax-Merchant-Key',
} as const;

interface BackendDeps {
  config?: BackendConfig;
  sql?: SqlClient;
  now?: () => Date;
  sendMagicLinkEmail?: (input: { to: string; exchangeUrl: string; expiresAt: string }, config: BackendConfig) => Promise<void>;
}

interface AuthContext {
  accountId: string;
  sessionId: string;
}

interface AccountRow extends DbRow {
  id: string;
  email: string;
  display_name: string;
  identity_document_kind: string | null;
  identity_document_last4: string | null;
  identity_hash: string | null;
  identity_verification_status: string;
  email_verified_at: string | Date | null;
  status: string;
}

interface SessionRow extends DbRow {
  id: string;
  account_id: string;
  expires_at: string | Date;
}

function withCors(response: RouteResponse): RouteResponse {
  return {
    ...response,
    headers: {
      ...JSON_HEADERS,
      ...(response.headers ?? {}),
    },
  };
}

function depsConfig(deps: BackendDeps): BackendConfig {
  return deps.config ?? getConfig();
}

function depsSql(deps: BackendDeps): SqlClient {
  return deps.sql ?? getSql(depsConfig(deps));
}

function now(deps: BackendDeps): Date {
  return deps.now?.() ?? new Date();
}

function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 24 * 60 * 60_000).toISOString();
}

function asIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function getBodyRecord(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object.');
  }
  return body;
}

function optionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function requiredString(value: unknown, fieldName: string, maxLength: number): string {
  const parsed = optionalString(value, maxLength);
  if (!parsed) throw new HttpError(400, 'invalid_field', `${fieldName} must be a non-empty string.`);
  return parsed;
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function optionalNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bearerToken(req: ApiRequest): string | null {
  const authorization = getHeader(req, 'authorization');
  if (!authorization) return null;
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

async function requireAccountAuth(req: ApiRequest, deps: BackendDeps): Promise<AuthContext> {
  const config = depsConfig(deps);
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'missing_access_token', 'Bearer access token is required.');

  const payload = verifyAccessToken(token, config, now(deps));
  const sql = depsSql(deps);
  const rows = await sql<SessionRow>`
    select s.id, s.account_id, s.expires_at
    from public.auth_sessions s
    join public.accounts a on a.id = s.account_id
    where s.id = ${payload.sid}
      and s.account_id = ${payload.sub}
      and s.status = 'active'
      and s.expires_at > now()
      and a.status in ('active', 'deletion_requested')
    limit 1
  `;

  const row = firstRow(rows);
  if (!row) throw new HttpError(401, 'invalid_session', 'Session is not active.');
  return { accountId: row.account_id, sessionId: row.id };
}

async function optionalAccountAuth(req: ApiRequest, deps: BackendDeps): Promise<AuthContext | null> {
  if (!bearerToken(req)) return null;
  return requireAccountAuth(req, deps);
}

function requireAccountTarget(body: Record<string, unknown>, auth: AuthContext): void {
  const accountId = optionalString(body.accountId, 80);
  if (accountId && accountId !== auth.accountId) {
    throw new HttpError(403, 'wrong_account', 'Request accountId does not match the authenticated account.');
  }
}

function requireMerchantAuth(req: ApiRequest, deps: BackendDeps): void {
  const config = depsConfig(deps);
  if (!config.merchantApiKey) {
    throw new HttpError(503, 'merchant_api_disabled', 'Merchant API key is not configured.');
  }

  const headerKey = getHeader(req, 'x-pagamax-merchant-key');
  const token = bearerToken(req);
  const provided = headerKey ?? token;
  if (!provided || !timingSafeStringEqual(provided, config.merchantApiKey)) {
    throw new HttpError(401, 'invalid_merchant_key', 'Merchant API key is required.');
  }
}

function accountResponse(row: AccountRow, sessionExpiresAt?: string): JsonObject {
  const response: JsonObject = {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    syncStatus: 'synced',
    emailVerified: row.email_verified_at !== null,
    identityVerificationStatus: row.identity_verification_status,
  };
  if (row.identity_document_kind) response.identityDocumentKind = row.identity_document_kind;
  if (row.identity_document_last4) response.identityDocumentLast4 = row.identity_document_last4;
  if (row.identity_hash) response.identityHash = row.identity_hash;
  if (sessionExpiresAt) response.sessionExpiresAt = sessionExpiresAt;
  return response;
}

function buildExchangeUrl(token: string, config: BackendConfig): string {
  const separator = config.appDeepLinkBase.includes('?') ? '&' : '?';
  return `${config.appDeepLinkBase}${separator}exchangeToken=${encodeURIComponent(token)}`;
}

async function defaultSendMagicLinkEmail(
  input: { to: string; exchangeUrl: string; expiresAt: string },
  config: BackendConfig,
): Promise<void> {
  if (!config.resendApiKey) {
    if (config.allowDevAuthResponse) return;
    throw new HttpError(503, 'email_provider_disabled', 'RESEND_API_KEY must be configured for magic links.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.magicLinkFrom,
      to: [input.to],
      subject: 'Entrar a Paga Menos',
      text: `Usa este enlace para entrar a Paga Menos. Vence en ${input.expiresAt}.\n\n${input.exchangeUrl}`,
    }),
  });

  if (!response.ok) {
    throw new HttpError(502, 'email_delivery_failed', 'Magic link email provider failed.');
  }
}

async function handleMagicLink(body: Record<string, unknown>, deps: BackendDeps): Promise<RouteResponse> {
  const config = depsConfig(deps);
  const sql = depsSql(deps);
  const email = normalizeEmail(body.email);
  const displayName = optionalString(body.displayName, 80) ?? email.split('@')[0] ?? 'Paga Menos user';
  const issuedToken = randomToken();
  const tokenHash = hashAuthToken(issuedToken, config);
  const expiresAt = addMinutes(now(deps), config.magicLinkTtlMinutes);

  const accountRows = await sql<AccountRow>`
    insert into public.accounts (email, display_name)
    values (${email}, ${displayName})
    on conflict (email) do update
      set updated_at = now()
    returning id, email, display_name, identity_document_kind, identity_document_last4, identity_hash,
      identity_verification_status, email_verified_at, status
  `;
  const account = firstRow(accountRows);
  if (!account || account.status === 'disabled' || account.status === 'deleted') {
    throw new HttpError(403, 'account_unavailable', 'Account is unavailable.');
  }

  await sql`
    insert into public.auth_magic_links (account_id, email, token_hash, expires_at)
    values (${account.id}, ${email}, ${tokenHash}, ${expiresAt})
  `;

  const exchangeUrl = buildExchangeUrl(issuedToken, config);
  await (deps.sendMagicLinkEmail ?? defaultSendMagicLinkEmail)({ to: email, exchangeUrl, expiresAt }, config);

  const response: JsonObject = { status: 'sent', expiresAt };
  if (config.allowDevAuthResponse) {
    response.devExchangeToken = issuedToken;
    response.devExchangeUrl = exchangeUrl;
  }
  return jsonResponse(200, response);
}

async function upsertDevice(
  sql: SqlClient,
  accountId: string,
  body: Record<string, unknown>,
  config: BackendConfig,
): Promise<string | null> {
  const deviceBinding = optionalString(body.deviceBindingId ?? body.deviceBindingHash, 200);
  if (!deviceBinding) return null;

  const deviceBindingHash = pepperedHash(`device:v1:${deviceBinding}`, config.tokenPepper);
  const appVersion = optionalString(body.appVersion, 40);
  const platform = optionalString(body.platform, 40);
  const deviceClass = optionalString(body.deviceClass, 40);
  const rows = await sql<{ id: string }>`
    insert into public.devices (account_id, device_binding_hash, app_version, platform, device_class)
    values (${accountId}, ${deviceBindingHash}, ${appVersion}, ${platform}, ${deviceClass})
    on conflict (account_id, device_binding_hash) do update
      set app_version = excluded.app_version,
          platform = excluded.platform,
          device_class = excluded.device_class,
          last_seen_at = now()
    returning id
  `;
  return firstRow(rows)?.id ?? null;
}

async function issueSession(
  sql: SqlClient,
  accountId: string,
  deviceId: string | null,
  deps: BackendDeps,
): Promise<JsonObject> {
  const config = depsConfig(deps);
  const refreshToken = randomToken();
  const refreshTokenHash = hashAuthToken(refreshToken, config);
  const refreshExpiresAt = addDays(now(deps), config.refreshTokenTtlDays);
  const sessionRows = await sql<SessionRow>`
    insert into public.auth_sessions (account_id, device_id, refresh_token_hash, expires_at)
    values (${accountId}, ${deviceId}, ${refreshTokenHash}, ${refreshExpiresAt})
    returning id, account_id, expires_at
  `;
  const session = firstRow(sessionRows);
  if (!session) throw new HttpError(500, 'session_create_failed', 'Could not create session.');

  const access = signAccessToken(accountId, session.id, config, now(deps));
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken,
    refreshTokenExpiresAt: asIso(session.expires_at),
    sessionExpiresAt: asIso(session.expires_at),
  };
}

async function handleExchange(body: Record<string, unknown>, deps: BackendDeps): Promise<RouteResponse> {
  const config = depsConfig(deps);
  const sql = depsSql(deps);
  const token = requiredString(body.exchangeToken ?? body.token, 'exchangeToken', 400);
  const tokenHash = hashAuthToken(token, config);

  const linkRows = await sql<{ account_id: string; email: string }>`
    update public.auth_magic_links
      set status = 'used', used_at = now()
    where token_hash = ${tokenHash}
      and status = 'pending'
      and expires_at > now()
    returning account_id, email
  `;
  const link = firstRow(linkRows);
  if (!link) throw new HttpError(401, 'invalid_exchange_token', 'Magic link token is invalid or expired.');

  const deviceId = await upsertDevice(sql, link.account_id, body, config);
  const accountRows = await sql<AccountRow>`
    update public.accounts
      set email_verified_at = coalesce(email_verified_at, now()),
          status = case when status = 'deletion_requested' then 'active' else status end,
          updated_at = now()
    where id = ${link.account_id}
      and status in ('active', 'deletion_requested')
    returning id, email, display_name, identity_document_kind, identity_document_last4, identity_hash,
      identity_verification_status, email_verified_at, status
  `;
  const account = firstRow(accountRows);
  if (!account) throw new HttpError(403, 'account_unavailable', 'Account is unavailable.');

  const session = await issueSession(sql, account.id, deviceId, deps);
  return jsonResponse(200, {
    account: accountResponse(account, String(session.sessionExpiresAt)),
    ...session,
  });
}

async function handleRefresh(body: Record<string, unknown>, deps: BackendDeps): Promise<RouteResponse> {
  const config = depsConfig(deps);
  const sql = depsSql(deps);
  const refreshToken = requiredString(body.refreshToken, 'refreshToken', 400);
  const nextRefreshToken = randomToken();
  const nextRefreshTokenHash = hashAuthToken(nextRefreshToken, config);
  const nextExpiresAt = addDays(now(deps), config.refreshTokenTtlDays);
  const rows = await sql<SessionRow>`
    update public.auth_sessions
      set refresh_token_hash = ${nextRefreshTokenHash},
          refreshed_at = now(),
          expires_at = ${nextExpiresAt}
    where refresh_token_hash = ${hashAuthToken(refreshToken, config)}
      and status = 'active'
      and expires_at > now()
    returning id, account_id, expires_at
  `;
  const session = firstRow(rows);
  if (!session) throw new HttpError(401, 'invalid_refresh_token', 'Refresh token is invalid or expired.');

  const access = signAccessToken(session.account_id, session.id, config, now(deps));
  return jsonResponse(200, {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: nextRefreshToken,
    refreshTokenExpiresAt: asIso(session.expires_at),
    sessionExpiresAt: asIso(session.expires_at),
  });
}

async function handleLogout(req: ApiRequest, deps: BackendDeps): Promise<RouteResponse> {
  const sql = depsSql(deps);
  const auth = await requireAccountAuth(req, deps);
  await sql`
    update public.auth_sessions
      set status = 'revoked',
          revoked_at = now()
    where id = ${auth.sessionId}
      and account_id = ${auth.accountId}
  `;
  return jsonResponse(200, { status: 'revoked' });
}

async function handleAccountSync(req: ApiRequest, body: Record<string, unknown>, deps: BackendDeps): Promise<RouteResponse> {
  const auth = await requireAccountAuth(req, deps);
  requireAccountTarget(body, auth);
  const sql = depsSql(deps);
  const config = depsConfig(deps);
  const displayName = optionalString(body.displayName, 80);
  const identity = normalizeIdentityDocument(body.identityDocument, config);

  const rows = identity
    ? await sql<AccountRow>`
      update public.accounts
        set display_name = coalesce(${displayName}, display_name),
            identity_document_kind = ${identity.kind},
            identity_document_last4 = ${identity.last4},
            identity_hash = ${identity.identityHash},
            identity_verification_status = 'pending',
            updated_at = now()
      where id = ${auth.accountId}
      returning id, email, display_name, identity_document_kind, identity_document_last4, identity_hash,
        identity_verification_status, email_verified_at, status
    `
    : await sql<AccountRow>`
      update public.accounts
        set display_name = coalesce(${displayName}, display_name),
            updated_at = now()
      where id = ${auth.accountId}
      returning id, email, display_name, identity_document_kind, identity_document_last4, identity_hash,
        identity_verification_status, email_verified_at, status
    `;

  const account = firstRow(rows);
  if (!account) throw new HttpError(404, 'account_not_found', 'Account was not found.');
  return jsonResponse(200, accountResponse(account));
}

async function handleConsent(req: ApiRequest, body: Record<string, unknown>, deps: BackendDeps): Promise<RouteResponse> {
  const auth = await requireAccountAuth(req, deps);
  requireAccountTarget(body, auth);
  const sql = depsSql(deps);
  await sql`
    insert into public.consents (
      account_id,
      analytics_enabled,
      merchant_insights_enabled,
      sponsored_offers_enabled,
      region_insights_enabled,
      privacy_version,
      terms_version,
      updated_at
    )
    values (
      ${auth.accountId},
      ${optionalBoolean(body.analyticsEnabled, true)},
      ${optionalBoolean(body.merchantInsightsEnabled, true)},
      ${optionalBoolean(body.sponsoredOffersEnabled, true)},
      ${optionalBoolean(body.regionInsightsEnabled, false)},
      ${optionalString(body.privacyVersion, 40) ?? 'public-beta-2026-06-07'},
      ${optionalString(body.termsVersion, 40) ?? 'public-beta-2026-06-07'},
      now()
    )
    on conflict (account_id) do update
      set analytics_enabled = excluded.analytics_enabled,
          merchant_insights_enabled = excluded.merchant_insights_enabled,
          sponsored_offers_enabled = excluded.sponsored_offers_enabled,
          region_insights_enabled = excluded.region_insights_enabled,
          privacy_version = excluded.privacy_version,
          terms_version = excluded.terms_version,
          updated_at = now()
  `;
  return jsonResponse(200, { status: 'synced' });
}

function normalizeVerificationStatus(value: unknown): string {
  if (value === 'pending' || value === 'mismatch' || value === 'rejected') return value;
  return 'unverified';
}

async function handlePaymentMethods(req: ApiRequest, body: Record<string, unknown>, deps: BackendDeps): Promise<RouteResponse> {
  const auth = await requireAccountAuth(req, deps);
  requireAccountTarget(body, auth);
  const sql = depsSql(deps);
  if (!Array.isArray(body.methods)) throw new HttpError(400, 'invalid_methods', 'methods must be an array.');
  const methods = body.methods.slice(0, 50);

  await sql`
    update public.user_payment_methods
      set enabled = false,
          updated_at = now()
    where account_id = ${auth.accountId}
  `;

  for (const item of methods) {
    if (!isRecord(item)) continue;
    const provider = requiredString(item.provider, 'provider', 80);
    const instrumentType = requiredString(item.instrumentType, 'instrumentType', 80);
    await sql`
      insert into public.user_payment_methods (
        account_id,
        provider,
        instrument_type,
        enabled,
        can_pay_merchant_qr,
        alias_label,
        owner_identity_hash,
        owner_identity_last4,
        identity_verification_status,
        preference_rank,
        updated_at
      )
      values (
        ${auth.accountId},
        ${provider},
        ${instrumentType},
        ${optionalBoolean(item.enabled, true)},
        ${optionalBoolean(item.canPayMerchantQr, true)},
        ${optionalString(item.label ?? item.aliasLabel, 120)},
        ${optionalString(item.ownerIdentityHash, 128)},
        ${optionalString(item.ownerIdentityLast4, 4)},
        ${normalizeVerificationStatus(item.identityVerificationStatus)},
        ${typeof item.preferenceRank === 'number' ? Math.trunc(item.preferenceRank) : null},
        now()
      )
      on conflict (account_id, provider, instrument_type) do update
        set enabled = excluded.enabled,
            can_pay_merchant_qr = excluded.can_pay_merchant_qr,
            alias_label = excluded.alias_label,
            owner_identity_hash = excluded.owner_identity_hash,
            owner_identity_last4 = excluded.owner_identity_last4,
            identity_verification_status = excluded.identity_verification_status,
            preference_rank = excluded.preference_rank,
            updated_at = now()
    `;
  }

  return jsonResponse(200, { status: 'synced', count: methods.length });
}

async function handleAccountDeletion(req: ApiRequest, body: Record<string, unknown>, deps: BackendDeps): Promise<RouteResponse> {
  const auth = await optionalAccountAuth(req, deps);
  const sql = depsSql(deps);
  let accountId: string | null = auth?.accountId ?? null;
  let email = optionalString(body.email, 254);

  if (auth) {
    const accountRows = await sql<{ email: string }>`
      update public.accounts
        set status = 'deletion_requested',
            updated_at = now()
      where id = ${auth.accountId}
      returning email
    `;
    email = firstRow(accountRows)?.email ?? email;
  } else {
    if (!email) throw new HttpError(400, 'missing_email', 'email is required when no access token is provided.');
    email = normalizeEmail(email);
    const accountRows = await sql<{ id: string }>`
      select id
      from public.accounts
      where email = ${email}
      limit 1
    `;
    accountId = firstRow(accountRows)?.id ?? null;
  }

  const rows = await sql<{ id: string }>`
    insert into public.deletion_requests (account_id, email, status, retained_for_security, audit_note)
    values (${accountId}, ${email}, 'requested', true, 'public beta deletion request')
    returning id
  `;
  const request = firstRow(rows);
  if (!request) throw new HttpError(500, 'deletion_request_failed', 'Could not create deletion request.');
  return jsonResponse(200, { requestId: request.id, retainedForSecurity: true });
}

async function handleTelemetry(req: ApiRequest, body: Record<string, unknown>, deps: BackendDeps): Promise<RouteResponse> {
  const auth = await optionalAccountAuth(req, deps);
  const sql = depsSql(deps);
  if (!Array.isArray(body.events)) throw new HttpError(400, 'invalid_events', 'events must be an array.');
  const events = body.events.slice(0, 100).map((event) => sanitizeTelemetryEvent(event));

  for (const event of events) {
    await sql`
      insert into public.telemetry_events (
        account_id,
        event_name,
        merchant_name,
        merchant_category,
        amount_band,
        recommendation_position,
        selected_provider,
        handoff_target,
        is_sponsored,
        stale_data,
        app_version,
        device_class,
        payload
      )
      values (
        ${auth?.accountId ?? null},
        ${event.eventName},
        ${event.merchantName},
        ${event.merchantCategory},
        ${event.amountBand},
        ${event.recommendationPosition},
        ${event.selectedProvider},
        ${event.handoffTarget},
        ${event.isSponsored},
        ${event.staleData},
        ${event.appVersion},
        ${event.deviceClass},
        ${JSON.stringify(event.payload)}
      )
    `;
  }

  return jsonResponse(200, { status: 'accepted', count: events.length });
}

async function handleRemoteConfig(deps: BackendDeps): Promise<RouteResponse> {
  const config = deps.config ?? getPublicConfig();
  const sql = deps.sql ?? (config.databaseUrl ? getSql(config) : null);
  if (sql) {
    const rows = await sql<{ version: number; signed_payload: JsonValue; signature: string }>`
      select version, signed_payload, signature
      from public.remote_configs
      where published_at is not null
      order by version desc
      limit 1
    `;
    const remote = firstRow(rows);
    if (remote) {
      return jsonResponse(200, {
        version: remote.version,
        variant: 'public-beta',
        signedPayload: remote.signed_payload,
        signature: remote.signature,
      });
    }
  }

  return jsonResponse(200, buildDefaultRemoteConfig(config) as unknown as JsonObject);
}

async function handleHealth(): Promise<RouteResponse> {
  return jsonResponse(200, {
    status: 'ok',
    service: 'pagamenos-public-beta',
    recommendationOnly: true,
    checkedAt: new Date().toISOString(),
  });
}

async function audit(sql: SqlClient, action: string, targetType: string, targetId: string | null, metadata: JsonObject): Promise<void> {
  await sql`
    insert into public.audit_logs (actor_role, action, target_type, target_id, metadata)
    values ('merchant_api', ${action}, ${targetType}, ${targetId}, ${JSON.stringify(metadata)})
  `;
}

async function handleMerchantDashboard(req: ApiRequest, deps: BackendDeps): Promise<RouteResponse> {
  requireMerchantAuth(req, deps);
  const sql = depsSql(deps);
  const rows = await sql<{
    offers: number;
    exposures: number;
    selections: number;
    handoffs: number;
    saved_merchants: number;
  }>`
    select
      count(distinct o.id)::int as offers,
      coalesce(sum(m.exposures), 0)::int as exposures,
      coalesce(sum(m.selections), 0)::int as selections,
      coalesce(sum(m.handoffs), 0)::int as handoffs,
      coalesce(sum(m.saved_merchants), 0)::int as saved_merchants
    from public.sponsored_offers o
    left join public.merchant_offer_metrics m on m.offer_id = o.id
  `;
  const metrics = firstRow(rows) ?? {
    offers: 0,
    exposures: 0,
    selections: 0,
    handoffs: 0,
    saved_merchants: 0,
  };
  await audit(sql, 'merchant_dashboard_read', 'merchant_dashboard', null, {});
  return jsonResponse(200, {
    aggregateOnly: true,
    offers: metrics.offers,
    exposures: metrics.exposures,
    selections: metrics.selections,
    handoffs: metrics.handoffs,
    savedMerchants: metrics.saved_merchants,
  });
}

async function findOrCreateMerchant(sql: SqlClient, body: Record<string, unknown>): Promise<string> {
  const merchantName = requiredString(body.merchantName, 'merchantName', 120);
  const category = optionalString(body.category, 80);
  const existing = firstRow(await sql<{ id: string }>`
    select id
    from public.merchant_profiles
    where lower(merchant_name) = lower(${merchantName})
      and coalesce(category, '') = coalesce(${category}, '')
    order by created_at asc
    limit 1
  `);
  if (existing) return existing.id;

  const created = firstRow(await sql<{ id: string }>`
    insert into public.merchant_profiles (merchant_name, category, status)
    values (${merchantName}, ${category}, 'active')
    returning id
  `);
  if (!created) throw new HttpError(500, 'merchant_create_failed', 'Could not create merchant profile.');
  return created.id;
}

function parseDateField(value: unknown, fieldName: string): string {
  const raw = requiredString(value, fieldName, 80);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, 'invalid_date', `${fieldName} must be a valid ISO date.`);
  }
  return parsed.toISOString();
}

function jsonObject(value: unknown): JsonObject {
  if (!isRecord(value)) return {};
  return value as JsonObject;
}

async function handleMerchantOffer(req: ApiRequest, body: Record<string, unknown>, deps: BackendDeps): Promise<RouteResponse> {
  requireMerchantAuth(req, deps);
  const sql = depsSql(deps);
  const merchantId = optionalString(body.merchantId, 80) ?? await findOrCreateMerchant(sql, body);
  const startsAt = parseDateField(body.startsAt, 'startsAt');
  const endsAt = parseDateField(body.endsAt, 'endsAt');
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new HttpError(400, 'invalid_offer_window', 'endsAt must be after startsAt.');
  }

  const budgetCents = Math.trunc(optionalNumber(body.budgetCents, -1));
  if (budgetCents < 0) throw new HttpError(400, 'invalid_budget', 'budgetCents must be zero or greater.');

  const rows = await sql<{ id: string; status: string }>`
    insert into public.sponsored_offers (
      merchant_id,
      title,
      category,
      eligibility,
      starts_at,
      ends_at,
      budget_cents,
      status,
      ranking_policy
    )
    values (
      ${merchantId},
      ${requiredString(body.title, 'title', 140)},
      ${optionalString(body.category, 80)},
      ${JSON.stringify(jsonObject(body.eligibility))},
      ${startsAt},
      ${endsAt},
      ${budgetCents},
      'pending_review',
      'labeled_secondary'
    )
    returning id, status
  `;
  const offer = firstRow(rows);
  if (!offer) throw new HttpError(500, 'offer_create_failed', 'Could not create sponsored offer.');
  await audit(sql, 'merchant_offer_submitted', 'sponsored_offer', offer.id, { rankingPolicy: 'labeled_secondary' });
  return jsonResponse(200, {
    id: offer.id,
    status: offer.status,
    rankingPolicy: 'labeled_secondary',
    requiresReview: true,
  });
}

async function disabledFundingEndpoint(): Promise<RouteResponse> {
  return jsonResponse(403, {
    error: {
      code: 'funding_disabled_public_beta',
      message: 'Funding destination and route-plan endpoints are disabled for the public recommendation-only build.',
    },
  });
}

export async function routeRequest(req: ApiRequest, deps: BackendDeps = {}): Promise<RouteResponse> {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'OPTIONS') return withCors(jsonResponse(204, {}));

  const path = getRequestPath(req).replace(/\/+$/, '') || '/';
  const body = method === 'GET' ? {} : getBodyRecord(await readJsonBody(req));

  if (method === 'POST' && path === '/v1/auth/magic-link') return withCors(await handleMagicLink(body, deps));
  if (method === 'POST' && path === '/v1/auth/exchange') return withCors(await handleExchange(body, deps));
  if (method === 'POST' && path === '/v1/auth/refresh') return withCors(await handleRefresh(body, deps));
  if (method === 'POST' && path === '/v1/auth/logout') return withCors(await handleLogout(req, deps));
  if (method === 'POST' && path === '/v1/accounts/sync') return withCors(await handleAccountSync(req, body, deps));
  if (method === 'POST' && path === '/v1/accounts/consent') return withCors(await handleConsent(req, body, deps));
  if (method === 'POST' && path === '/v1/accounts/payment-methods') return withCors(await handlePaymentMethods(req, body, deps));
  if (method === 'POST' && path === '/v1/accounts/delete') return withCors(await handleAccountDeletion(req, body, deps));
  if (method === 'POST' && path === '/v1/telemetry/batch') return withCors(await handleTelemetry(req, body, deps));
  if (method === 'GET' && path === '/v1/health') return withCors(await handleHealth());
  if (method === 'GET' && path === '/v1/remote-config') return withCors(await handleRemoteConfig(deps));
  if (method === 'GET' && path === '/v1/merchant/dashboard') return withCors(await handleMerchantDashboard(req, deps));
  if (method === 'POST' && path === '/v1/merchant/offers') return withCors(await handleMerchantOffer(req, body, deps));

  if ([
    '/v1/accounts/funding-destinations',
    '/v1/accounts/funding-destinations/verify',
    '/v1/checkout/route-plans',
    '/v1/checkout/route-plans/opened',
    '/v1/liquidity/pair-capabilities',
    '/v1/liquidity/route-plans',
    '/v1/liquidity/route-plans/events',
  ].includes(path) && (method === 'GET' || method === 'POST')) {
    return withCors(await disabledFundingEndpoint());
  }

  throw new HttpError(404, 'not_found', `${method} ${path} is not implemented.`);
}

export async function handleRequest(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader?.('Access-Control-Allow-Origin', JSON_HEADERS['Access-Control-Allow-Origin']);
  res.setHeader?.('Access-Control-Allow-Methods', JSON_HEADERS['Access-Control-Allow-Methods']);
  res.setHeader?.('Access-Control-Allow-Headers', JSON_HEADERS['Access-Control-Allow-Headers']);

  try {
    writeRouteResponse(res, await routeRequest(req));
  } catch (error) {
    writeError(res, error);
  }
}
