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

  it('declares localized extension metadata', async () => {
    const value = await manifest(env('production'));

    expect(value).toMatchObject({
      name: '__MSG_extensionName__',
      description: '__MSG_extensionDescription__',
      default_locale: 'en',
    });
  });

  it('grants the narrow network access required for Prime text MP4s', async () => {
    const value = await manifest(env('production'));

    expect(value.permissions).toContain('webRequest');
    expect(value.host_permissions).toContain(
      'https://*.amazon.pv-cdn.net/*',
    );
  });

  it('matches Disney+ pages without granting a media-CDN host permission', async () => {
    const value = await manifest(env('production'));

    expect(value.host_permissions).toContain(
      'https://www.disneyplus.com/*',
    );
    expect(value.host_permissions).not.toContain(
      'https://*.media.dssott.com/*',
    );
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
