#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toQR } from 'toqr';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const outputRoot = join(root, 'reports', 'qr-ready-kit');
const defaultManifestPath = join(outputRoot, 'qr-inputs.example.json');

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
    if (!next || next.startsWith('--')) result[key] = true;
    else {
      result[key] = next;
      i += 1;
    }
  }
  return result;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'qr';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readEntries(file) {
  if (!file) return [];
  const resolved = resolve(root, file);
  if (!existsSync(resolved)) throw new Error(`Payload file not found: ${resolved}`);
  const parsed = JSON.parse(readFileSync(resolved, 'utf8'));
  const entries = Array.isArray(parsed) ? parsed : parsed.entries;
  if (!Array.isArray(entries)) throw new Error('Payload file must be an array or an object with an entries array.');
  return entries;
}

function controlEntries() {
  return [
    {
      id: 'control-pagamax-nonpayable',
      label: 'Pagamax Non-Payable Control',
      kind: 'non_payable_control',
      payer: 'Pagamax scanner',
      qrProvider: 'local',
      receiver: 'none',
      amountArs: null,
      qrType: 'static_text',
      payload: 'PAGAMAX_NON_PAYABLE_CONTROL_v1',
      payable: false,
      notes: 'Use only to verify that scanner detects a QR and follows safe fallback copy. This is not a payment QR.',
    },
    {
      id: 'control-static-amount-missing',
      label: 'Static Amount Missing Control',
      kind: 'non_payable_control',
      payer: 'Pagamax scanner',
      qrProvider: 'local',
      receiver: 'none',
      amountArs: null,
      qrType: 'static_amount_entered',
      payload: 'PAGAMAX_STATIC_AMOUNT_MISSING_CONTROL_v1',
      payable: false,
      notes: 'Use only to validate amount-missing handling. This is not a payment QR.',
    },
  ];
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('Each QR entry must be an object.');
  if (!entry.payload || typeof entry.payload !== 'string') throw new Error(`Entry ${entry.id ?? '<unknown>'} is missing a string payload.`);
  if (entry.payable === true) {
    if (!entry.receiver || !entry.qrProvider) throw new Error(`Payable entry ${entry.id ?? '<unknown>'} needs receiver and qrProvider.`);
    const amount = Number(entry.amountArs);
    if (!Number.isFinite(amount) || amount < 1 || amount > 500) {
      throw new Error(`Payable entry ${entry.id ?? '<unknown>'} amountArs must be between 1 and 500.`);
    }
  }
}

function qrSvg(payload, title) {
  const matrix = toQR(payload);
  const size = Math.sqrt(matrix.length);
  if (!Number.isInteger(size)) throw new Error('Unexpected QR matrix size.');
  const quiet = 4;
  const viewSize = size + quiet * 2;
  const rects = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (matrix[y * size + x]) rects.push(`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" role="img" aria-label="${escapeHtml(title)}">
  <rect width="${viewSize}" height="${viewSize}" fill="#fff"/>
  <g fill="#000">${rects.join('')}</g>
</svg>
`;
}

function renderIndex(entries) {
  const cards = entries.map((entry) => {
    const file = `${slug(entry.id)}.svg`;
    const status = entry.payable ? 'PAYABLE REAL QR' : 'NON-PAYABLE CONTROL';
    const amount = entry.amountArs == null ? 'amount missing / not payable' : `ARS ${entry.amountArs}`;
    return `<section class="card ${entry.payable ? 'payable' : 'control'}">
      <div class="meta">
        <p class="status">${escapeHtml(status)}</p>
        <h2>${escapeHtml(entry.label ?? entry.id)}</h2>
        <dl>
          <dt>Payer</dt><dd>${escapeHtml(entry.payer ?? 'unknown')}</dd>
          <dt>QR provider</dt><dd>${escapeHtml(entry.qrProvider ?? 'unknown')}</dd>
          <dt>Receiver</dt><dd>${escapeHtml(entry.receiver ?? 'none')}</dd>
          <dt>Amount</dt><dd>${escapeHtml(amount)}</dd>
          <dt>Type</dt><dd>${escapeHtml(entry.qrType ?? 'unknown')}</dd>
        </dl>
        <p>${escapeHtml(entry.notes ?? '')}</p>
      </div>
      <img class="qr" src="./${file}" alt="${escapeHtml(entry.label ?? entry.id)}"/>
    </section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Pagamax QR Ready Kit</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #111827; background: #f3f4f6; }
    header { padding: 24px; background: #111827; color: #fff; }
    header h1 { margin: 0 0 8px; font-size: 28px; }
    header p { margin: 0; color: #d1d5db; }
    main { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; padding: 20px; }
    .card { background: #fff; border: 3px solid #d1d5db; border-radius: 8px; padding: 18px; display: grid; grid-template-columns: 1fr 260px; gap: 18px; align-items: center; }
    .card.payable { border-color: #047857; }
    .card.control { border-color: #b45309; }
    .status { display: inline-block; margin: 0 0 8px; padding: 4px 8px; border-radius: 4px; background: #e5e7eb; font-size: 12px; font-weight: 700; letter-spacing: .03em; }
    .payable .status { background: #d1fae5; color: #065f46; }
    .control .status { background: #fef3c7; color: #92400e; }
    h2 { margin: 0 0 12px; font-size: 22px; }
    dl { margin: 0; display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; }
    dt { color: #6b7280; }
    dd { margin: 0; font-weight: 700; }
    .qr { width: 260px; height: 260px; image-rendering: pixelated; background: #fff; }
    @media print {
      body { background: #fff; }
      main { display: block; padding: 0; }
      .card { break-inside: avoid; margin: 0 0 18px; grid-template-columns: 1fr 300px; }
      .qr { width: 300px; height: 300px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Pagamax QR Ready Kit</h1>
    <p>Only cards marked PAYABLE REAL QR should be used for real payments. Never approve above ARS 500.</p>
  </header>
  <main>${cards}</main>
</body>
</html>
`;
}

function writeExampleManifest() {
  const example = {
    entries: [
      {
        id: 'real-nx-to-mercadopago-100',
        label: 'NX -> Mercado Pago Receiver ARS 100',
        kind: 'controlled_cross_provider',
        payer: 'Naranja X app QR',
        qrProvider: 'Mercado Pago',
        receiver: 'Mercado Pago controlled receiver',
        amountArs: 100,
        qrType: 'dynamic_amount_closed',
        payable: true,
        payload: 'PASTE_REAL_MERCADO_PAGO_QR_PAYLOAD_OR_PAYMENT_LINK_HERE',
        notes: 'Create this from a receiver account you control. Do not use the placeholder payload.',
      },
    ],
  };
  writeFileSync(defaultManifestPath, `${JSON.stringify(example, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(outputRoot, { recursive: true });
  writeExampleManifest();

  const entries = [
    ...controlEntries(),
    ...readEntries(args['payload-file']),
  ];
  for (const entry of entries) validateEntry(entry);

  const manifest = entries.map((entry) => {
    const id = slug(entry.id ?? entry.label);
    const file = `${id}.svg`;
    writeFileSync(join(outputRoot, file), qrSvg(entry.payload, entry.label ?? id));
    return {
      id,
      label: entry.label ?? entry.id,
      kind: entry.kind ?? 'unknown',
      payer: entry.payer ?? null,
      qrProvider: entry.qrProvider ?? null,
      receiver: entry.receiver ?? null,
      amountArs: entry.amountArs ?? null,
      qrType: entry.qrType ?? null,
      payable: Boolean(entry.payable),
      file,
      notes: entry.notes ?? '',
      rawPayloadStoredInManifest: false,
    };
  });

  writeFileSync(join(outputRoot, 'manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), entries: manifest }, null, 2)}\n`);
  writeFileSync(join(outputRoot, 'index.html'), renderIndex(entries));
  console.log(`Wrote ${join(outputRoot, 'index.html')}`);
  console.log(`Wrote ${join(outputRoot, 'manifest.json')}`);
  console.log(`Example real payload file: ${defaultManifestPath}`);
}

main();
