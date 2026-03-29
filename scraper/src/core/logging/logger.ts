import pino from 'pino';

/**
 * Root Pino logger.
 *
 * In development (non-production), output is pretty-printed with colors.
 * In production, output is NDJSON for log aggregators.
 *
 * LOG_LEVEL environment variable controls verbosity (default: 'info').
 */
const rootLogger = pino(
  {
    level: process.env['LOG_LEVEL'] ?? 'info',
  },
  process.env['NODE_ENV'] !== 'production'
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true, destination: 2 } })
    : pino.destination(2), // always write logs to stderr, keep stdout clean for data
);

/**
 * createLogger
 *
 * Creates a child logger with bound context fields.
 * Use this at the top of each module to bind issuerCode, phase, url, etc.
 *
 * @example
 * const log = createLogger({ issuerCode: 'naranjax', phase: 'extraction' });
 * log.info({ url, count }, 'Extracted candidates');
 */
export function createLogger(context: Record<string, string>): pino.Logger {
  return rootLogger.child(context);
}

export type { Logger } from 'pino';
