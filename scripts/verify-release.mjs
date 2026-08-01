import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageJson = readJson('package.json');
const version = packageJson.version;
const channel = process.argv[2] ?? 'standalone';
assert(
  channel === 'standalone' || channel === 'store',
  `unknown release channel: ${channel}`,
);
const archiveName = channel === 'store'
  ? `duetsub-${version}-chrome-web-store.zip`
  : `duetsub-${version}-chrome.zip`;
const archivePath = resolve(root, '.output', archiveName);
const manifest = JSON.parse(
  execFileSync('unzip', ['-p', archivePath, 'manifest.json'], {
    encoding: 'utf8',
  }),
);
const expectedId = 'nopbidmmkeonplhniidecfeibhnanmig';

assert(manifest.manifest_version === 3, 'manifest_version must be 3');
assert(manifest.version === version, 'package and manifest versions differ');
assert(
  manifest.name === '__MSG_extensionName__' &&
    manifest.description === '__MSG_extensionDescription__' &&
    manifest.default_locale === 'en',
  'manifest localization metadata is incomplete',
);
assert(
  process.env.RELEASE_TAG === undefined ||
    process.env.RELEASE_TAG === `v${version}`,
  `tag ${process.env.RELEASE_TAG} does not match v${version}`,
);

assertExactStrings(
  manifest.permissions,
  ['storage', 'webRequest'],
  'required API permissions',
);
assertExactStrings(
  manifest.host_permissions,
  [
    'https://www.netflix.com/*',
    'https://www.primevideo.com/*',
    'https://*.amazon.pv-cdn.net/*',
    'https://play.hbomax.com/*',
    'https://www.youtube.com/*',
    'https://www.disneyplus.com/*',
  ],
  'required host permissions',
);
assertExactStrings(
  manifest.optional_host_permissions,
  [
    'https://*/*',
    'http://localhost/*',
    'http://127.0.0.1/*',
    'http://[::1]/*',
  ],
  'optional host permissions',
);

if (channel === 'store') {
  assert(
    !Object.hasOwn(manifest, 'key'),
    'Chrome Web Store package must omit manifest.key',
  );
} else {
  assert(typeof manifest.key === 'string', 'manifest public key is missing');
  assert(
    extensionId(manifest.key) === expectedId,
    `stable extension ID must remain ${expectedId}`,
  );
}

const entries = execFileSync('unzip', ['-Z1', archivePath], {
  encoding: 'utf8',
}).trim().split('\n');
assert(entries.includes('manifest.json'), `${archiveName} has no manifest.json`);
for (const locale of ['en', 'zh_CN', 'zh_TW']) {
  assert(
    entries.includes(`_locales/${locale}/messages.json`),
    `${archiveName} has no ${locale} localization`,
  );
}
const forbidden = entries.filter((entry) =>
  entry.endsWith('.map') ||
  entry.endsWith('.pem') ||
  entry.endsWith('.key') ||
  /(^|\/)\.env(?:\.|$)/u.test(entry)
);
assert(
  forbidden.length === 0,
  `forbidden release files: ${forbidden.join(', ')}`,
);

console.log(
  channel === 'store'
    ? `Verified ${archiveName}: MV3, version ${version}, store-assigned ID, ` +
      `${entries.length} files, no manifest.key, least-privilege host boundary.`
    : `Verified ${archiveName}: MV3, version ${version}, ID ${expectedId}, ` +
      `${entries.length} files, least-privilege host boundary.`,
);

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function assertExactStrings(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array`);
  const left = [...actual].sort();
  const right = [...expected].sort();
  assert(
    JSON.stringify(left) === JSON.stringify(right),
    `${label} differ: ${JSON.stringify(left)}`,
  );
}

function extensionId(publicKey) {
  return createHash('sha256')
    .update(Buffer.from(publicKey, 'base64'))
    .digest('hex')
    .slice(0, 32)
    .replace(/[0-9a-f]/gu, (digit) =>
      String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(digit, 16))
    );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
