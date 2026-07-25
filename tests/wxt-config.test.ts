import { describe, expect, it } from 'vitest';
import type { ConfigEnv, UserManifestFn } from 'wxt';

import config from '../wxt.config';

const manifest = config.manifest as UserManifestFn;

describe('release-channel manifest', () => {
  it('omits the fixed key from the Chrome Web Store package', async () => {
    expect(await manifest(env('store'))).not.toHaveProperty('key');
  });

  it('keeps the stable key in standalone builds', async () => {
    expect(await manifest(env('production'))).toHaveProperty('key');
  });
});

function env(mode: string): ConfigEnv {
  return {
    browser: 'chrome',
    command: 'build',
    manifestVersion: 3,
    mode,
  };
}
