import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
);
const source = resolve(root, '.output', 'chrome-mv3-store');
const target = resolve(
  root,
  '.output',
  `duetsub-${packageJson.version}-chrome-web-store.zip`,
);

rmSync(target, { force: true });
execFileSync('zip', ['-qr', target, '.'], { cwd: source });
console.log(`Prepared ${basename(target)} for Chrome Web Store upload.`);
