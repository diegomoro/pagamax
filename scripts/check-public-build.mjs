import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function rel(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function fail(message) {
  failures.push(message);
}

function readText(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`${relativePath} is missing`);
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

function readJson(relativePath) {
  const text = readText(relativePath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function walkFiles(relativeDir, files = []) {
  const dir = path.join(root, relativeDir);
  if (!existsSync(dir)) {
    fail(`${relativeDir} is missing`);
    return files;
  }

  for (const entry of readdirSync(dir)) {
    const absolutePath = path.join(dir, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      walkFiles(rel(absolutePath), files);
    } else if (/\.(tsx?|jsx?|json|md|sql|html|css|ya?ml)$/.test(entry)) {
      files.push(absolutePath);
    }
  }
  return files;
}

const publicBuildConfig = readText('app/src/config/public-build.ts');
const requiredFlagSnippets = [
  "env.EXPO_PUBLIC_APP_VARIANT?.trim() || 'public'",
  "'EXPO_PUBLIC_RECOMMENDATION_ONLY'",
  "'EXPO_PUBLIC_OWNER_SPLIT_FLOW'",
  "'EXPO_PUBLIC_PAYMENT_PROOF'",
  "'EXPO_PUBLIC_KILL_SWITCH'",
];
for (const snippet of requiredFlagSnippets) {
  if (!publicBuildConfig.includes(snippet)) {
    fail(`app/src/config/public-build.ts is missing public flag snippet: ${snippet}`);
  }
}

const paymentAppConfig = readText('app/src/config/payment-apps.ts');
for (const snippet of ['PROVIDER_ALLOWED_SCHEMES', 'TRUSTED_HTTPS_HOSTS', 'isAllowedPaymentAppUrl', 'isAllowedAndroidPackage']) {
  if (!paymentAppConfig.includes(snippet)) {
    fail(`app/src/config/payment-apps.ts is missing handoff allowlist control: ${snippet}`);
  }
}

const defaultMethods = readJson('app/assets/data/default-methods.json');
if (Array.isArray(defaultMethods)) {
  for (const method of defaultMethods) {
    const label = method?.id ?? method?.provider ?? 'unknown-method';
    const sensitiveFields = [
      'receivingAlias',
      'availableBalanceArs',
      'creditAvailableArs',
      'qrTransferLimitRemainingArs',
      'promoCapRemainingArs',
    ];
    for (const field of sensitiveFields) {
      if (method?.[field] != null) {
        fail(`default method ${label} ships ${field}; public bundle must not expose owner balances, caps, or aliases`);
      }
    }
    if (method?.ownerPhone !== false) {
      fail(`default method ${label} must ship ownerPhone=false in public beta`);
    }
    if (method?.canReceiveCustomerTransfer !== false) {
      fail(`default method ${label} must ship canReceiveCustomerTransfer=false in public beta`);
    }
    const checkoutRails = Array.isArray(method?.checkoutRails) ? method.checkoutRails : [];
    if (checkoutRails.includes('linked_card')) {
      fail(`default method ${label} ships linked_card checkout; public liquidity mode is money-in-account only`);
    }
    if (method?.isDefault === true && (method?.rail === 'card' || method?.cardType === 'credit' || method?.cardType === 'debit' || method?.cardType === 'prepaid')) {
      fail(`default method ${label} is a card-like funded route; public liquidity mode must default to account money`);
    }
  }
} else if (defaultMethods) {
  fail('app/assets/data/default-methods.json must contain an array');
}

const appConfig = readJson('app/app.json');
const androidConfig = appConfig?.expo?.android;
const requestedPermissions = new Set(androidConfig?.permissions ?? []);
const blockedPermissions = new Set(androidConfig?.blockedPermissions ?? []);
for (const permission of [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.RECORD_AUDIO',
]) {
  if (!blockedPermissions.has(permission)) {
    fail(`app/app.json must block sensitive permission ${permission}`);
  }
  if (requestedPermissions.has(permission)) {
    fail(`app/app.json must not request sensitive permission ${permission}`);
  }
}
for (const permission of [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.READ_SMS',
  'android.permission.POST_NOTIFICATIONS',
]) {
  if (requestedPermissions.has(permission)) {
    fail(`app/app.json must not request unrelated sensitive permission ${permission}`);
  }
}

const forbiddenPublicSurface = [
  'Alias destino',
  'Pagamax captura',
  'cliente pago',
  'Cerrar prueba',
  'Listo, ya volvi',
  'Guardar este pago',
  'comprobante simulado',
  'payoutAlias',
  'customerChargeArs',
  'ownerCaptureArs',
  'Fee Paga Menos',
];

for (const filePath of [...walkFiles('app/app'), ...walkFiles('app/src')]) {
  const relativePath = rel(filePath);
  const text = readFileSync(filePath, 'utf8');
  for (const forbidden of forbiddenPublicSurface) {
    if (text.includes(forbidden)) {
      fail(`${relativePath} contains public-forbidden surface text or field: ${forbidden}`);
    }
  }
}

const forbiddenRepoIdentifiers = [
  'dd' + 'moro',
  'diego.' + 'daniel.' + 'moro',
  'buceo.' + 'deseo.' + 'curso.mp',
  'dmoro17.' + 'ppay',
  'Paga.' + 'Menos.CF',
  'Paga.' + 'Menos.BNA',
];
for (const filePath of [
  ...walkFiles('app'),
  ...walkFiles('packages'),
  ...walkFiles('backend'),
  ...walkFiles('docs'),
  ...walkFiles('merchant-portal'),
  ...walkFiles('.github'),
]) {
  const relativePath = rel(filePath);
  const text = readFileSync(filePath, 'utf8');
  for (const forbidden of forbiddenRepoIdentifiers) {
    if (text.includes(forbidden)) {
      fail(`${relativePath} contains a real owner payment alias or personal identifier`);
    }
  }
}

const requiredFiles = [
  'docs/legal/privacy-policy.md',
  'docs/legal/terms.md',
  'docs/legal/account-deletion.md',
  'docs/play-console-public-beta.md',
  'docs/security-threat-model-public-beta.md',
  'docs/monetization-public-beta.md',
  'backend/public-beta/schema.sql',
  'backend/public-beta/README.md',
  'merchant-portal/README.md',
];
for (const file of requiredFiles) {
  if (!existsSync(path.join(root, file))) {
    fail(`${file} is required for the public beta package`);
  }
}

if (failures.length > 0) {
  console.error('Public beta check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Public beta check passed.');
