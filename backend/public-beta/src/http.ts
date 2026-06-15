import type { IncomingHttpHeaders } from 'node:http';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ApiRequest {
  method?: string;
  url?: string;
  headers?: IncomingHttpHeaders;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  socket?: {
    remoteAddress?: string;
  };
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
  end?(body?: string): void;
}

export interface RouteResponse {
  status: number;
  body: JsonValue;
  headers?: Record<string, string>;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: JsonValue,
  ) {
    super(message);
  }
}

function isHttpErrorLike(error: unknown): error is {
  status: number;
  code: string;
  message: string;
  details?: JsonValue;
} {
  if (!isRecord(error)) return false;
  return typeof error.status === 'number'
    && Number.isInteger(error.status)
    && error.status >= 400
    && error.status <= 599
    && typeof error.code === 'string'
    && error.code.length > 0
    && typeof error.message === 'string'
    && error.message.length > 0;
}

export function jsonResponse(status: number, body: JsonValue, headers?: Record<string, string>): RouteResponse {
  return headers ? { status, body, headers } : { status, body };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getHeader(req: ApiRequest, name: string): string | null {
  const headers = req.headers ?? {};
  const exact = headers[name];
  const lower = headers[name.toLowerCase()];
  const value = exact ?? lower;
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' ? value : null;
}

export function getRequestPath(req: ApiRequest): string {
  const queryPath = req.query?.path;
  if (typeof queryPath === 'string') return `/v1/${queryPath}`;
  if (Array.isArray(queryPath)) return `/v1/${queryPath.join('/')}`;

  const rawUrl = req.url ?? '/';
  const pathname = new URL(rawUrl, 'https://pagamax.local').pathname;
  if (pathname.startsWith('/api/v1/')) return pathname.replace('/api/v1/', '/v1/');
  if (pathname === '/api/v1') return '/v1';
  return pathname;
}

async function readJsonBodyUnsafe(req: ApiRequest): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      if (req.body.trim().length === 0) return {};
      return JSON.parse(req.body) as unknown;
    }
    return req.body;
  }

  const maybeStream = req as unknown as AsyncIterable<Buffer | string>;
  if (typeof maybeStream[Symbol.asyncIterator] !== 'function') return {};

  let raw = '';
  for await (const chunk of maybeStream) {
    raw += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
  }

  if (raw.trim().length === 0) return {};
  return JSON.parse(raw) as unknown;
}

export async function readJsonBody(req: ApiRequest): Promise<unknown> {
  try {
    return await readJsonBodyUnsafe(req);
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message === 'Invalid JSON')) {
      throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON.');
    }
    throw error;
  }
}

export function writeRouteResponse(res: ApiResponse, routeResponse: RouteResponse): void {
  const headers = routeResponse.headers ?? {};
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader?.(name, value);
  }
  res.status(routeResponse.status).json(routeResponse.body);
}

export function writeError(res: ApiResponse, error: unknown): void {
  if (error instanceof HttpError || isHttpErrorLike(error)) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
    });
    return;
  }

  const diagnostic = error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: typeof error, message: 'Non-Error throwable' };
  console.error('Unexpected backend error', diagnostic);

  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Unexpected backend error.',
    },
  });
}
