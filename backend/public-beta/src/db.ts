import { neon } from '@neondatabase/serverless';
import { getConfig, type BackendConfig } from './config.js';
import { HttpError } from './http.js';

export type DbRow = Record<string, unknown>;
export type SqlClient = <T extends DbRow = DbRow>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

let cachedSql: SqlClient | null = null;
let cachedUrl: string | null = null;

export function getSql(config: Pick<BackendConfig, 'databaseUrl'> = getConfig()): SqlClient {
  if (!config.databaseUrl) {
    throw new HttpError(503, 'backend_misconfigured', 'DATABASE_URL must be configured.');
  }

  if (cachedSql && cachedUrl === config.databaseUrl) return cachedSql;

  cachedUrl = config.databaseUrl;
  cachedSql = neon(config.databaseUrl) as unknown as SqlClient;
  return cachedSql;
}

export function firstRow<T extends DbRow>(rows: T[]): T | null {
  return rows[0] ?? null;
}
