import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const warnings = [];
const args = process.argv.slice(2);

function readText(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${relativePath} is missing`);
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
    failures.push(`${relativePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function readCliOption(name) {
  const equalsPrefix = `${name}=`;
  const equalsMatch = args.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsMatch) return equalsMatch.slice(equalsPrefix.length).trim();

  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1]?.trim() ?? '';
  return '';
}

function unescapeJavaPropertiesValue(value) {
  return value
    .replaceAll('\\\\', '\\')
    .replaceAll('\\:', ':')
    .replaceAll('\\=', '=');
}

function readAndroidSdkFromLocalProperties() {
  const localPropertiesPath = path.join(root, 'app/android/local.properties');
  if (!existsSync(localPropertiesPath)) return '';
  const text = readFileSync(localPropertiesPath, 'utf8');
  const line = text.split(/\r?\n/).find((entry) => entry.trim().startsWith('sdk.dir='));
  if (!line) return '';
  return unescapeJavaPropertiesValue(line.slice(line.indexOf('=') + 1).trim());
}

function existingDirectories(paths) {
  return [...new Set(paths.filter(Boolean))]
    .filter((candidate) => {
      try {
        return statSync(candidate).isDirectory();
      } catch {
        return false;
      }
    });
}

function compareVersionName(left, right) {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function findLatestBuildTool(sdkRoot, executableName) {
  const buildToolsRoot = path.join(sdkRoot, 'build-tools');
  if (!existsSync(buildToolsRoot)) return '';
  const versions = readdirSync(buildToolsRoot)
    .map((name) => path.join(buildToolsRoot, name))
    .filter((candidate) => {
      try {
        return statSync(candidate).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((left, right) => compareVersionName(path.basename(right), path.basename(left)));

  for (const versionPath of versions) {
    const toolPath = path.join(versionPath, executableName);
    if (existsSync(toolPath)) return toolPath;
  }
  return '';
}

function findAndroidTool(toolName) {
  const executableName = process.platform === 'win32' ? `${toolName}.exe` : toolName;
  const batchName = process.platform === 'win32' ? `${toolName}.bat` : toolName;
  const sdkRoots = existingDirectories([
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    readAndroidSdkFromLocalProperties(),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '',
  ]);

  for (const sdkRoot of sdkRoots) {
    const cmdlineTool = path.join(sdkRoot, 'cmdline-tools', 'latest', 'bin', batchName);
    if (existsSync(cmdlineTool)) return cmdlineTool;

    const buildTool = findLatestBuildTool(sdkRoot, executableName);
    if (buildTool) return buildTool;
  }
  return '';
}

function runAndroidTool(toolPath, toolArgs) {
  if (process.platform === 'win32' && toolPath.toLowerCase().endsWith('.bat')) {
    return execFileSync('cmd.exe', ['/d', '/c', toolPath, ...toolArgs], { encoding: 'utf8' });
  }
  return execFileSync(toolPath, toolArgs, { encoding: 'utf8' });
}

function parseManifestAttribute(manifest, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return manifest.match(new RegExp(`${escaped}="([^"]+)"`))?.[1] ?? '';
}

function parseManifestPermissions(manifest) {
  return [...manifest.matchAll(/<uses-permission\b[\s\S]*?android:name="([^"]+)"/g)]
    .map((match) => match[1])
    .filter(Boolean);
}

function auditManifestText(manifest, artifactPath, expected) {
  const packageName = parseManifestAttribute(manifest, 'package');
  const versionCode = Number.parseInt(parseManifestAttribute(manifest, 'android:versionCode'), 10);
  const versionName = parseManifestAttribute(manifest, 'android:versionName');
  const targetSdk = Number.parseInt(parseManifestAttribute(manifest, 'android:targetSdkVersion'), 10);
  const allowBackup = parseManifestAttribute(manifest, 'android:allowBackup');
  const permissions = new Set(parseManifestPermissions(manifest));

  if (packageName !== expected.packageName) {
    failures.push(`${artifactPath} package is ${packageName || '<missing>'}, expected ${expected.packageName}`);
  }
  if (versionCode !== expected.versionCode) {
    failures.push(`${artifactPath} versionCode is ${Number.isNaN(versionCode) ? '<missing>' : versionCode}, expected ${expected.versionCode}`);
  }
  if (versionName !== expected.versionName) {
    failures.push(`${artifactPath} versionName is ${versionName || '<missing>'}, expected ${expected.versionName}`);
  }
  if (!Number.isInteger(targetSdk) || targetSdk < 35) {
    failures.push(`${artifactPath} targetSdkVersion must be >= 35, found ${Number.isNaN(targetSdk) ? '<missing>' : targetSdk}`);
  }
  if (allowBackup !== 'false') {
    failures.push(`${artifactPath} must set android:allowBackup="false" to avoid backing up local sessions/payment preferences`);
  }

  const allowedPermissions = new Set([
    'android.permission.CAMERA',
    'android.permission.INTERNET',
    'android.permission.VIBRATE',
    'android.permission.ACCESS_NETWORK_STATE',
    `${expected.packageName}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
  ]);
  const sensitivePermissions = new Set([
    'android.permission.RECORD_AUDIO',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.READ_CONTACTS',
    'android.permission.READ_SMS',
    'android.permission.RECEIVE_SMS',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
  ]);

  for (const permission of permissions) {
    if (sensitivePermissions.has(permission)) {
      failures.push(`${artifactPath} must not request sensitive permission ${permission}`);
    } else if (!allowedPermissions.has(permission)) {
      failures.push(`${artifactPath} requests unexpected permission ${permission}`);
    }
  }
}

function auditAndroidArtifact(artifactInput, expected) {
  if (!artifactInput) {
    warnings.push('No release artifact supplied. Run this check with --artifact <apk-or-aab> before upload.');
    return;
  }

  const artifactPath = path.resolve(root, artifactInput);
  if (!existsSync(artifactPath)) {
    failures.push(`Release artifact does not exist: ${artifactPath}`);
    return;
  }

  const extension = path.extname(artifactPath).toLowerCase();
  if (extension === '.aab') {
    failures.push('AAB artifact auditing needs bundletool in this environment. Download the production AAB, run `bundletool dump manifest --bundle <file.aab> --module base`, and inspect the same package/version/targetSdk/permission/allowBackup fields before upload.');
    return;
  }
  if (extension !== '.apk') {
    failures.push(`Unsupported release artifact extension ${extension || '<none>'}; expected .apk or .aab`);
    return;
  }

  const apkAnalyzer = findAndroidTool('apkanalyzer');
  if (!apkAnalyzer) {
    failures.push('Android SDK apkanalyzer was not found; cannot audit APK manifest');
    return;
  }

  const manifest = runAndroidTool(apkAnalyzer, ['manifest', 'print', artifactPath]);
  auditManifestText(manifest, artifactPath, expected);
  warnings.push('Local APK artifact audited. Repeat this artifact audit on the downloaded production AAB before Play upload.');
}

function requireEnv(name, { allowMailto = false } = {}) {
  const value = process.env[name]?.trim() ?? '';
  if (!value) {
    failures.push(`${name} must be set in the production build environment`);
    return;
  }
  if (value.includes('example.com') || value.includes('github.com/diegomoro/pagamax')) {
    failures.push(`${name} must be a stable production URL, not a placeholder or repository URL`);
  }
  if (!allowMailto && !value.startsWith('https://')) {
    failures.push(`${name} must be an https:// URL`);
  }
  if (allowMailto && !(value.startsWith('https://') || value.startsWith('mailto:'))) {
    failures.push(`${name} must be an https:// URL or mailto: support address`);
  }
}

const appConfig = readJson('app/app.json');
const expo = appConfig?.expo;
const android = expo?.android;

if (expo?.name !== 'Paga Menos') failures.push('app/app.json expo.name must be Paga Menos');
if ((expo?.name?.length ?? 0) > 30) failures.push('Google Play app name must be 30 characters or fewer');
if (expo?.scheme !== 'pagamenos') failures.push('app/app.json expo.scheme must be pagamenos');
if (android?.package !== 'com.pagamenos.app') failures.push('Android package must be com.pagamenos.app');
if (!Number.isInteger(android?.versionCode) || android.versionCode < 1) failures.push('Android versionCode must be a positive integer');
if (android?.allowBackup !== false) failures.push('app/app.json android.allowBackup must be false for the public release');

const explicitPermissions = new Set(android?.permissions ?? []);
const blockedPermissions = new Set(android?.blockedPermissions ?? []);
if (!explicitPermissions.has('android.permission.CAMERA')) failures.push('Android CAMERA permission must be declared for QR scanning');

for (const permission of [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.RECORD_AUDIO',
]) {
  if (!blockedPermissions.has(permission)) {
    failures.push(`app/app.json must block ${permission}`);
  }
  if (explicitPermissions.has(permission)) {
    failures.push(`app/app.json must not explicitly request ${permission}`);
  }
}

for (const permission of [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.READ_SMS',
  'android.permission.POST_NOTIFICATIONS',
]) {
  if (explicitPermissions.has(permission)) {
    failures.push(`app/app.json must not request ${permission} for the public release`);
  }
}

const easConfig = readJson('app/eas.json');
if (easConfig?.build?.production?.android?.buildType !== 'app-bundle') {
  failures.push('app/eas.json production Android buildType must be app-bundle');
}

const appPackage = readJson('app/package.json');
for (const scriptName of ['build:preview', 'build:production']) {
  const script = appPackage?.scripts?.[scriptName] ?? '';
  if (!script.includes('eas-cli@20.1.0')) {
    failures.push(`app/package.json ${scriptName} must use the verified eas-cli@20.1.0 command`);
  }
}

const envExample = readText('app/.env.example');
for (const key of [
  'EXPO_PUBLIC_APP_VARIANT',
  'EXPO_PUBLIC_RECOMMENDATION_ONLY',
  'EXPO_PUBLIC_OWNER_SPLIT_FLOW',
  'EXPO_PUBLIC_PAYMENT_PROOF',
  'EXPO_PUBLIC_FUNDING_DESTINATIONS',
  'EXPO_PUBLIC_BACKEND_API_URL',
  'EXPO_PUBLIC_PRIVACY_URL',
  'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_ACCOUNT_DELETION_URL',
  'EXPO_PUBLIC_SUPPORT_URL',
]) {
  if (!envExample.includes(`${key}=`)) failures.push(`app/.env.example is missing ${key}`);
}

requireEnv('EXPO_PUBLIC_BACKEND_API_URL');
requireEnv('EXPO_PUBLIC_PRIVACY_URL');
requireEnv('EXPO_PUBLIC_TERMS_URL');
requireEnv('EXPO_PUBLIC_ACCOUNT_DELETION_URL');
requireEnv('EXPO_PUBLIC_SUPPORT_URL', { allowMailto: true });

auditAndroidArtifact(readCliOption('--artifact') || process.env.PLAY_RELEASE_ARTIFACT?.trim(), {
  packageName: android?.package,
  versionCode: android?.versionCode,
  versionName: expo?.version,
});

for (const file of [
  'docs/play-console-public-beta.md',
  'docs/play-store-listing-assets.md',
  'docs/legal/privacy-policy.md',
  'docs/legal/terms.md',
  'docs/legal/account-deletion.md',
]) {
  readText(file);
}

warnings.push('Verify Google Play developer account type/date to know whether 12 closed testers for 14 continuous days are required.');

if (warnings.length > 0) {
  console.warn('Play release readiness warnings:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (failures.length > 0) {
  console.error('Play release readiness failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Play release readiness static checks passed.');
