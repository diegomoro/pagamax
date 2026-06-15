#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const reportsRoot = join(root, 'reports', 'real-qr-tests');
const allowedSources = new Set(['controlled_receiver', 'naranjax_receiver', 'store']);
const allowedQrTypes = new Set(['dynamic_amount_closed', 'static_amount_entered', 'unknown']);
const allowedStages = new Set([
  'setup',
  'qr_created',
  'pagamax_scan',
  'pagamax_results',
  'handoff_opened',
  'naranjax_review',
  'payment_approved',
  'receiver_confirmed',
  'blocked',
  'aborted',
]);
const allowedStatuses = new Set(['pass', 'fail', 'blocked', 'info']);
const sensitiveStages = new Set(['naranjax_review', 'payment_approved', 'receiver_confirmed']);

function usage(exitCode = 0) {
  const text = `
Real low-value QR test runner

Commands:
  node scripts/real-qr-test-runner.mjs new controlled_receiver 100 "Mercado Pago Diego" dynamic_amount_closed
  node scripts/real-qr-test-runner.mjs open-scan <run-id>
  node scripts/real-qr-test-runner.mjs checkpoint <run-id> pagamax_results pass "Naranja X shown as manual scanner fallback" capture
  node scripts/real-qr-test-runner.mjs checkpoint <run-id> pagamax_results pass "Route checked" --target-id <target-id> --merchant-match pass --amount-match pass --top-provider naranjax --top-method "Naranja X app QR" --naranjax-rank 1 --chosen-payer naranjax
  node scripts/real-qr-test-runner.mjs list
  node scripts/real-qr-test-runner.mjs report <run-id>
  node scripts/real-qr-test-runner.mjs summary

Safety:
  - Amount must be ARS 1-500.
  - Raw QR payloads are never accepted.
  - Screenshots are captured only for Pagamax-safe stages unless --capture-wallet-screen is provided.
`;
  console.log(text.trim());
  process.exit(exitCode);
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      result._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
    } else {
      result[key] = next;
      i += 1;
    }
  }
  return result;
}

function nowIso() {
  return new Date().toISOString();
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'qr-test';
}

function ensureReportsRoot() {
  mkdirSync(reportsRoot, { recursive: true });
}

function runDir(runId) {
  return join(reportsRoot, runId);
}

function loadMeta(runId) {
  const file = join(runDir(runId), 'metadata.json');
  if (!existsSync(file)) throw new Error(`Unknown run id: ${runId}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function saveJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableString(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeCheck(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).toLowerCase();
  if (['pass', 'true', 'yes', 'matched', 'match'].includes(normalized)) return 'pass';
  if (['fail', 'false', 'no', 'mismatch'].includes(normalized)) return 'fail';
  if (['unknown', 'missing', 'na', 'n/a'].includes(normalized)) return 'unknown';
  return String(value);
}

function structuredCheckpoint(args) {
  const route = {
    targetId: nullableString(args['target-id']),
    topRecommendationProvider: nullableString(args['top-provider']),
    topRecommendationMethod: nullableString(args['top-method']),
    topRecommendationSavingsArs: nullableNumber(args['top-savings-ars']),
    naranjaxRank: nullableNumber(args['naranjax-rank']),
    naranjaxEstimatedSavingsArs: nullableNumber(args['naranjax-savings-ars']),
    finalChosenPayer: nullableString(args['chosen-payer']),
    finalChosenMethod: nullableString(args['chosen-method']),
    reasonChosen: nullableString(args['reason-chosen']),
  };
  const validation = {
    merchantMatch: normalizeCheck(args['merchant-match']),
    amountMatch: normalizeCheck(args['amount-match']),
    receiverMatch: normalizeCheck(args['receiver-match']),
    methodMatch: normalizeCheck(args['method-match']),
    promoShownInWallet: normalizeCheck(args['promo-shown']),
    paymentApproved: normalizeCheck(args['payment-approved']),
    receiverCredited: normalizeCheck(args['receiver-credited']),
  };
  const walletReview = {
    walletProvider: nullableString(args['wallet-provider']),
    walletReceiver: nullableString(args['wallet-receiver']),
    walletAmountArs: nullableNumber(args['wallet-amount-ars']),
    walletInstrument: nullableString(args['wallet-instrument']),
    walletPromoTextSafe: nullableString(args['wallet-promo-safe']),
  };

  const hasRoute = Object.values(route).some((value) => value !== null);
  const hasValidation = Object.values(validation).some((value) => value !== null);
  const hasWalletReview = Object.values(walletReview).some((value) => value !== null);

  if (!hasRoute && !hasValidation && !hasWalletReview) return null;
  return {
    route: hasRoute ? route : null,
    validation: hasValidation ? validation : null,
    walletReview: hasWalletReview ? walletReview : null,
  };
}

function runAdb(args, options = {}) {
  const result = spawnSync('adb', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim();
    throw new Error(`adb ${args.join(' ')} failed: ${message}`);
  }
  return result.stdout ?? '';
}

function ensureDevice() {
  const out = runAdb(['devices', '-l']);
  const lines = out.split(/\r?\n/).filter((line) => /\bdevice\b/.test(line) && !line.startsWith('List'));
  if (lines.length === 0) throw new Error('No connected adb device found.');
  return lines[0].trim();
}

function captureSafeEvidence(dir, stage, allowWalletScreen) {
  if (sensitiveStages.has(stage) && !allowWalletScreen) {
    return { skipped: true, reason: 'sensitive_stage_capture_blocked' };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `${stamp}-${stage}`;
  const devicePng = `/sdcard/${prefix}.png`;
  const deviceXml = `/sdcard/${prefix}.xml`;
  const screenshot = join(dir, `${prefix}.png`);
  const ui = join(dir, `${prefix}.xml`);
  const log = join(dir, `${prefix}-logcat.txt`);

  const errors = [];
  try {
    runAdb(['shell', 'screencap', '-p', devicePng]);
    runAdb(['pull', devicePng, screenshot]);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  try {
    runAdb(['shell', 'uiautomator', 'dump', deviceXml]);
    runAdb(['pull', deviceXml, ui]);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  try {
    const logcat = runAdb(['logcat', '-d', '-t', '500']);
    writeFileSync(log, logcat);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return {
    skipped: false,
    screenshot: existsSync(screenshot) ? screenshot.replace(`${root}\\`, '').replaceAll('\\', '/') : null,
    ui: existsSync(ui) ? ui.replace(`${root}\\`, '').replaceAll('\\', '/') : null,
    logcat: existsSync(log) ? log.replace(`${root}\\`, '').replaceAll('\\', '/') : null,
    errors,
  };
}

function commandNew(args) {
  const source = args.source ?? args._[1] ?? 'controlled_receiver';
  const amount = Number(args.amount ?? args._[2] ?? 100);
  const receiver = args.receiver ?? args._[3] ?? '';
  const qrType = args['qr-type'] ?? args._[4] ?? 'dynamic_amount_closed';

  if (!allowedSources.has(source)) throw new Error(`Invalid --source. Use: ${[...allowedSources].join(', ')}`);
  if (!Number.isFinite(amount) || amount < 1 || amount > 500) throw new Error('--amount must be between ARS 1 and ARS 500.');
  if (!receiver || receiver.length < 2) throw new Error('--receiver is required.');
  if (!allowedQrTypes.has(qrType)) throw new Error(`Invalid --qr-type. Use: ${[...allowedQrTypes].join(', ')}`);

  ensureReportsRoot();
  const id = `${nowIso().replace(/[:.]/g, '-').slice(0, 19)}-${slug(source)}-${amount}`;
  const dir = runDir(id);
  mkdirSync(dir, { recursive: true });

  const meta = {
    id,
    createdAt: nowIso(),
    source,
    amountArs: amount,
    receiver,
    targetId: args['target-id'] ?? null,
    expectedMerchant: args['expected-merchant'] ?? receiver,
    expectedMethod: args['expected-method'] ?? 'Naranja X',
    expectedRoute: args['expected-route'] ?? `Naranja X -> recommended method -> ${receiver}`,
    expectedPayer: 'Naranja X',
    qrType,
    maxPaymentArs: 500,
    rawQrPayloadStored: false,
    status: 'open',
    safetyRules: [
      'Approve only if receiver and amount match.',
      'Stop if payment amount is above ARS 500.',
      'Do not store raw QR payloads or full receipts.',
      'Pagamax must not claim payment completion or QR/amount prefill into Naranja X.',
    ],
  };

  saveJson(join(dir, 'metadata.json'), meta);
  writeFileSync(join(dir, 'events.jsonl'), '');
  writeFileSync(join(dir, 'notes.md'), `# Real QR Test ${id}

## Header

- Source: ${source}
- Amount: ARS ${amount}
- Receiver: ${receiver}
- Target ID: ${args['target-id'] ?? 'not linked'}
- Expected method: ${args['expected-method'] ?? 'Naranja X'}
- Expected route: ${args['expected-route'] ?? `Naranja X -> recommended method -> ${receiver}`}
- Expected payer: Naranja X
- QR type: ${qrType}

## Manual checklist

- [ ] QR created by receiver.
- [ ] QR displayed on a second screen or paper.
- [ ] Pagamax scanned QR.
- [ ] Pagamax showed merchant/amount safely.
- [ ] Naranja X was shown as top route or alternative.
- [ ] Naranja X opened from Pagamax.
- [ ] Payment approved only after receiver and amount matched.
- [ ] Receiver credit confirmed.

Do not paste raw QR payloads into this file.
`);

  appendEvent(id, {
    stage: 'setup',
    status: 'info',
    detail: 'Run created. Create/display the low-value payable QR outside this script.',
  }, { capture: false });

  console.log(`Created ${id}`);
  console.log(`Next: npm run qr:real:open-scan -- ${id}`);
}

function appendEvent(runId, event, options = {}) {
  const dir = runDir(runId);
  const meta = loadMeta(runId);
  const record = {
    at: nowIso(),
    stage: event.stage,
    status: event.status,
    detail: event.detail ?? '',
    structured: event.structured ?? null,
    evidence: null,
  };

  if (options.capture) {
    record.evidence = captureSafeEvidence(dir, event.stage, options.allowWalletScreen);
  }

  appendFileSync(join(dir, 'events.jsonl'), `${JSON.stringify(record)}\n`);
  meta.updatedAt = record.at;
  if (event.status === 'fail' || event.status === 'blocked') meta.status = event.status;
  if (event.stage === 'receiver_confirmed' && event.status === 'pass') meta.status = 'passed';
  saveJson(join(dir, 'metadata.json'), meta);
  return record;
}

function commandOpenScan(runId) {
  loadMeta(runId);
  const device = ensureDevice();
  runAdb(['logcat', '-c']);
  const result = spawnSync('adb', [
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    'pagamenos://scan',
    'com.pagamenos.app',
  ], { cwd: root, encoding: 'utf8' });
  const detail = result.stdout || result.stderr || '';
  appendEvent(runId, {
    stage: 'pagamax_scan',
    status: result.status === 0 ? 'info' : 'blocked',
    detail: `Device=${device}; launch=${detail.trim()}`,
  }, { capture: false });
  if (result.status !== 0) throw new Error(detail.trim());
  console.log(`Opened Pagamax scan for ${runId}`);
}

function commandCheckpoint(runId, args) {
  const stage = args.stage ?? args._[2];
  const status = args.status ?? args._[3] ?? 'info';
  const detail = args.detail ?? args._[4] ?? '';
  const capture = Boolean(args.capture) || args._.includes('capture');
  const captureWalletScreen = Boolean(args['capture-wallet-screen']) || args._.includes('capture-wallet-screen');
  if (!allowedStages.has(stage)) throw new Error(`Invalid --stage. Use: ${[...allowedStages].join(', ')}`);
  if (!allowedStatuses.has(status)) throw new Error(`Invalid --status. Use: ${[...allowedStatuses].join(', ')}`);
  if (detail.toLowerCase().includes('qr payload')) throw new Error('Do not store raw QR payloads or QR payload text in checkpoints.');
  if (String(args['wallet-promo-safe'] ?? '').length > 160) throw new Error('--wallet-promo-safe must be a short non-sensitive summary.');

  const record = appendEvent(runId, { stage, status, detail, structured: structuredCheckpoint(args) }, {
    capture,
    allowWalletScreen: captureWalletScreen,
  });
  console.log(JSON.stringify(record, null, 2));
}

function commandList() {
  ensureReportsRoot();
  const rows = readdirSync(reportsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const file = join(reportsRoot, entry.name, 'metadata.json');
      if (!existsSync(file)) return null;
      const meta = JSON.parse(readFileSync(file, 'utf8'));
      return `${meta.id}\t${meta.status}\tARS ${meta.amountArs}\t${meta.source}\t${meta.receiver}`;
    })
    .filter(Boolean);
  console.log(rows.length ? rows.join('\n') : 'No real QR test runs yet.');
}

function loadRunEvents(runId) {
  const dir = runDir(runId);
  const eventsPath = join(dir, 'events.jsonl');
  return existsSync(eventsPath)
    ? readFileSync(eventsPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : [];
}

function lastStructuredValue(events, section, key) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const value = events[i]?.structured?.[section]?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return '';
}

function stageStatus(events, stage) {
  const event = [...events].reverse().find((entry) => entry.stage === stage);
  return event?.status ?? '';
}

function commandSummary() {
  ensureReportsRoot();
  const runs = readdirSync(reportsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const metaPath = join(reportsRoot, entry.name, 'metadata.json');
      if (!existsSync(metaPath)) return null;
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      const events = loadRunEvents(entry.name);
      return {
        id: meta.id,
        status: meta.status,
        source: meta.source,
        amountArs: meta.amountArs,
        receiver: meta.receiver,
        targetId: meta.targetId ?? '',
        expectedRoute: meta.expectedRoute ?? '',
        topProvider: lastStructuredValue(events, 'route', 'topRecommendationProvider'),
        topMethod: lastStructuredValue(events, 'route', 'topRecommendationMethod'),
        naranjaxRank: lastStructuredValue(events, 'route', 'naranjaxRank'),
        chosenPayer: lastStructuredValue(events, 'route', 'finalChosenPayer'),
        merchantMatch: lastStructuredValue(events, 'validation', 'merchantMatch'),
        amountMatch: lastStructuredValue(events, 'validation', 'amountMatch'),
        methodMatch: lastStructuredValue(events, 'validation', 'methodMatch'),
        promoShown: lastStructuredValue(events, 'validation', 'promoShownInWallet'),
        paymentApproved: lastStructuredValue(events, 'validation', 'paymentApproved') || stageStatus(events, 'payment_approved'),
        receiverCredited: lastStructuredValue(events, 'validation', 'receiverCredited') || stageStatus(events, 'receiver_confirmed'),
      };
    })
    .filter(Boolean);

  if (runs.length === 0) {
    console.log('No real QR test runs yet.');
    return;
  }

  const headers = [
    'run_id',
    'status',
    'amount',
    'receiver',
    'target_id',
    'top_provider',
    'top_method',
    'nx_rank',
    'chosen_payer',
    'merchant_match',
    'amount_match',
    'method_match',
    'promo_shown',
    'payment_approved',
    'receiver_credited',
  ];
  console.log(headers.join('\t'));
  for (const run of runs) {
    console.log([
      run.id,
      run.status,
      run.amountArs,
      run.receiver,
      run.targetId,
      run.topProvider,
      run.topMethod,
      run.naranjaxRank,
      run.chosenPayer,
      run.merchantMatch,
      run.amountMatch,
      run.methodMatch,
      run.promoShown,
      run.paymentApproved,
      run.receiverCredited,
    ].map((value) => String(value ?? '').replace(/\s+/g, ' ').trim()).join('\t'));
  }
}

function commandReport(runId) {
  const meta = loadMeta(runId);
  const dir = runDir(runId);
  const events = loadRunEvents(runId);
  console.log(`# ${basename(dir)}

Status: ${meta.status}
Amount: ARS ${meta.amountArs}
Receiver: ${meta.receiver}
Target ID: ${meta.targetId ?? 'not linked'}
Expected route: ${meta.expectedRoute ?? 'not recorded'}
Source: ${meta.source}
QR type: ${meta.qrType}

Events:
${events.map((event) => {
  const structured = event.structured ? ` | structured=${JSON.stringify(event.structured)}` : '';
  return `- ${event.at} | ${event.stage} | ${event.status} | ${event.detail}${structured}`;
}).join('\n') || '- none'}
`);
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

try {
  if (!command || command === 'help') usage(0);
  if (command === 'new') commandNew(args);
  else if (command === 'open-scan') commandOpenScan(args._[1]);
  else if (command === 'checkpoint') commandCheckpoint(args._[1], args);
  else if (command === 'list') commandList();
  else if (command === 'report') commandReport(args._[1]);
  else if (command === 'summary') commandSummary();
  else usage(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
