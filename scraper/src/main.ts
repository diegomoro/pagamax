#!/usr/bin/env node
/**
 * main.ts — CLI entry point for the Pagamax scraper.
 *
 * Usage:
 *   npx tsx src/main.ts --issuer naranjax
 *   npx tsx src/main.ts --issuer naranjax --headless false
 *   npx tsx src/main.ts --issuer naranjax --output file
 *
 * Environment variables:
 *   LOG_LEVEL=debug|info|warn|error   (default: info)
 *   NODE_ENV=production               (disables pino-pretty, uses NDJSON)
 *
 * To add a new issuer:
 *   1. Create src/issuers/<name>/adapter.ts implementing IssuerAdapter.
 *   2. Add one entry to ADAPTER_REGISTRY below.
 *   That's it — no other files need to change.
 */
import { z } from 'zod';
import { browserManager } from './core/browser/BrowserManager.js';
import { DiscoveryPipeline, JsonStdoutSink } from './core/discovery/DiscoveryPipeline.js';
import { InMemoryDedupeStore } from './core/dedupe/DedupeStore.js';
import { NaranjaxAdapter } from './issuers/naranjax/adapter.js';
import { createLogger } from './core/logging/logger.js';
import type { IssuerAdapter } from './shared/types/adapter.js';

const log = createLogger({ phase: 'main' });

// ─── Adapter Registry ────────────────────────────────────────────────────────
//
// Add new issuers here. The key is the --issuer CLI flag value.
// Each factory function returns a fresh adapter instance per run.
//
const ADAPTER_REGISTRY: Record<string, () => IssuerAdapter & { detailPageDelayMs?: number }> = {
  naranjax: () => new NaranjaxAdapter(),
  // mercadopago: () => new MercadoPagoAdapter(),
  // bbva:        () => new BbvaAdapter(),
  // galicia:     () => new GaliciaAdapter(),
};

// ─── CLI Argument Schema ─────────────────────────────────────────────────────
const CliArgsSchema = z.object({
  issuer: z
    .string()
    .refine((v) => v in ADAPTER_REGISTRY, {
      message: `Unknown issuer. Valid values: ${Object.keys(ADAPTER_REGISTRY).join(', ')}`,
    }),
  output: z.enum(['stdout', 'file']).default('stdout'),
  headless: z.boolean().default(true),
});

type CliArgs = z.infer<typeof CliArgsSchema>;

// ─── Entry Point ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const rawArgs = parseArgv(process.argv.slice(2));

  const argsResult = CliArgsSchema.safeParse(rawArgs);
  if (!argsResult.success) {
    console.error('Invalid arguments:', argsResult.error.issues.map((i) => i.message).join(', '));
    console.error('Usage: tsx src/main.ts --issuer <name> [--headless false]');
    console.error('   or: tsx src/main.ts <name> [headless]');
    process.exit(1);
  }

  const args: CliArgs = argsResult.data;
  log.info({ issuer: args.issuer, headless: args.headless }, 'Scraper starting');

  await browserManager.init({ headless: args.headless });

  const adapterFactory = ADAPTER_REGISTRY[args.issuer];
  if (!adapterFactory) {
    log.error({ issuer: args.issuer }, 'No adapter factory found');
    process.exit(1);
  }

  const adapter = adapterFactory();
  const dedupe = new InMemoryDedupeStore();
  const sink = new JsonStdoutSink();
  const pipeline = new DiscoveryPipeline(adapter, dedupe, sink);

  try {
    const summary = await pipeline.run();
    log.info(summary, 'Run completed successfully');
    process.exit(0);
  } catch (err) {
    log.error({ error: (err as Error).message, stack: (err as Error).stack }, 'Unhandled error');
    process.exit(1);
  } finally {
    await browserManager.shutdown();
  }
}

// ─── Minimal argv parser ─────────────────────────────────────────────────────
// No dependency on commander/yargs — keeps the footprint small.
function parseArgv(argv: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (typeof arg === 'string' && arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (typeof next === 'string' && !next.startsWith('--')) {
        // Coerce booleans
        result[key] = next === 'true' ? true : next === 'false' ? false : next;
        i++;
      } else {
        result[key] = true;
      }
    } else if (typeof arg === 'string' && arg !== '--') {
      positional.push(arg);
    }
  }

  // npm 10/11 often strips unknown "--foo" script args and forwards only values.
  // Accept positional fallbacks so `npm start -- naranjax` still works.
  if (result.issuer === undefined && positional[0]) {
    result.issuer = positional[0];
  }
  if (result.headless === undefined && positional[1] && /^(true|false)$/i.test(positional[1])) {
    result.headless = positional[1].toLowerCase() === 'true';
  }

  return result;
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
