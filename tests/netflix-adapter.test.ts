import { DOMParser } from '@xmldom/xmldom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNetflixAdapter } from '../src/adapters/netflix';
import {
  netflixManifestMessage,
  netflixTtmlResponseMessage,
} from '../src/core/messages';
import netflixFixture from './fixtures/netflix-minimal.ttml?raw';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Netflix adapter lifecycle', () => {
  it('re-emits current tracks when restarted after the user re-enables DuetSub', () => {
    let onMessage: ((event: MessageEvent<unknown>) => void) | undefined;
    const fakeWindow = {
      addEventListener(
        type: string,
        callback: (event: MessageEvent<unknown>) => void,
      ) {
        if (type === 'message') onMessage = callback;
      },
      location: {
        href: 'https://www.netflix.com/watch/81262752',
      },
    } as unknown as Window & typeof globalThis;
    vi.stubGlobal('window', fakeWindow);
    const adapter = createNetflixAdapter();
    const emissions: string[][] = [];
    adapter.onTracks((tracks) => emissions.push(tracks.map(({ id }) => id)));

    onMessage?.({
      source: fakeWindow,
      data: netflixManifestMessage({
        movieId: 81262752,
        timedtexttracks: [
          {
            id: 'english-cc',
            language: 'en',
            languageDescription: 'English',
            rawTrackType: 'closedcaptions',
            hydrated: true,
            ttDownloadables: {
              'dfxp-ls-sdh': {
                downloadUrls: { primary: 'https://example.test/en.ttml' },
              },
            },
          },
          {
            id: 'traditional-chinese',
            language: 'zh-Hant',
            languageDescription: '中文（繁體）',
            hydrated: true,
            ttDownloadables: {
              'dfxp-ls-sdh': {
                downloadUrls: { primary: 'https://example.test/zh.ttml' },
              },
            },
          },
        ],
      }),
    } as unknown as MessageEvent<unknown>);

    adapter.start();
    adapter.start();

    expect(emissions).toEqual([
      ['english-cc', 'traditional-chinese'],
      ['english-cc', 'traditional-chinese'],
    ]);
  });

  it('reuses menu-enumerated tracks after a same-title video replacement', async () => {
    vi.useFakeTimers();
    const fakeWindow = {
      addEventListener() {},
      setTimeout,
      clearTimeout,
      location: {
        href: 'https://www.netflix.com/watch/81262757',
      },
    } as unknown as Window & typeof globalThis;
    let menuOpen = false;
    let menuOpenCount = 0;
    const visible = {
      getClientRects: () => [{}],
    };
    const video = {
      ...visible,
      readyState: 4,
    };
    const button = {
      click() {
        menuOpen = true;
        menuOpenCount += 1;
      },
    };
    const option = {
      textContent: '中文（繁體）',
      getAttribute(name: string) {
        if (name === 'data-uia') {
          return 'subtitle-item-selected-中文（繁體）';
        }
        if (name === 'aria-selected') return 'true';
        return null;
      },
    };
    const menu = {
      ...visible,
      querySelectorAll: () => [option],
      dispatchEvent() {
        menuOpen = false;
        return true;
      },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', {
      querySelector(selector: string) {
        if (selector === '#appMountPoint video') return video;
        if (selector.includes('control-audio-subtitle')) return button;
        if (selector === 'div[data-uia="selector-audio-subtitle"]') {
          return menuOpen ? menu : null;
        }
        return null;
      },
    });
    vi.stubGlobal('getComputedStyle', () => ({
      display: 'block',
      visibility: 'visible',
    }));
    vi.stubGlobal('KeyboardEvent', class {});
    const adapter = createNetflixAdapter();
    const emissions: string[][] = [];
    adapter.onTracks((tracks) => emissions.push(tracks.map(({ id }) => id)));

    adapter.bindGeneration?.({
      contentGeneration: 1,
      clockGeneration: 1,
    });
    adapter.start();
    await vi.advanceTimersByTimeAsync(200);

    adapter.bindGeneration?.({
      contentGeneration: 1,
      clockGeneration: 2,
    });
    adapter.start();
    await vi.advanceTimersByTimeAsync(200);

    expect(emissions).toEqual([
      ['menu:zh-Hant:plain:中文[繁體]'],
      ['menu:zh-Hant:plain:中文[繁體]'],
    ]);
    expect(menuOpenCount).toBe(1);
  });

  it('uses one request-bound buffered response after generation advances', async () => {
    vi.useFakeTimers();
    let onMessage: ((event: MessageEvent<unknown>) => void) | undefined;
    const fakeWindow = {
      addEventListener(
        type: string,
        callback: (event: MessageEvent<unknown>) => void,
      ) {
        if (type === 'message') onMessage = callback;
      },
      setTimeout,
      clearTimeout,
      location: {
        href: 'https://www.netflix.com/watch/81262757',
      },
    } as unknown as Window & typeof globalThis;
    let menuOpen = false;
    let selectedKey = 'traditional-chinese';
    const visible = {
      getClientRects: () => [{}],
    };
    const video = {
      ...visible,
      readyState: 4,
    };
    const button = {
      click() {
        menuOpen = true;
      },
    };
    const option = (config: {
      key: string;
      label: string;
      language: string;
      closedCaptions?: boolean;
    }) => ({
      textContent: config.label,
      click() {
        selectedKey = config.key;
        menuOpen = false;
      },
      getAttribute(name: string) {
        if (name === 'data-uia') {
          const selected = selectedKey === config.key ? 'selected-' : '';
          const captions = config.closedCaptions ? '-cc' : '';
          return `subtitle-item-${selected}${config.language}${captions}`;
        }
        if (name === 'aria-selected') {
          return selectedKey === config.key ? 'true' : 'false';
        }
        if (name === 'lang') return config.language;
        return null;
      },
    });
    const options = [
      option({
        key: 'english-cc',
        label: 'English (CC)',
        language: 'en',
        closedCaptions: true,
      }),
      option({
        key: 'english-plain',
        label: 'English',
        language: 'en',
      }),
      option({
        key: 'traditional-chinese',
        label: '中文（繁體）',
        language: 'zh-Hant',
      }),
    ];
    const menu = {
      ...visible,
      querySelectorAll: () => options,
      dispatchEvent() {
        menuOpen = false;
        return true;
      },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', {
      querySelector(selector: string) {
        if (selector === '#appMountPoint video') return video;
        if (selector.includes('control-audio-subtitle')) return button;
        if (selector === 'div[data-uia="selector-audio-subtitle"]') {
          return menuOpen ? menu : null;
        }
        return null;
      },
    });
    vi.stubGlobal('getComputedStyle', () => ({
      display: 'block',
      visibility: 'visible',
    }));
    vi.stubGlobal('KeyboardEvent', class {});
    vi.stubGlobal('DOMParser', DOMParser);
    const adapter = createNetflixAdapter();
    let emittedTracks:
      | Parameters<Parameters<typeof adapter.onTracks>[0]>[0]
      | undefined;
    adapter.onTracks((tracks) => {
      emittedTracks = tracks;
    });
    adapter.bindGeneration?.({
      contentGeneration: 1,
      clockGeneration: 1,
    });

    onMessage?.({
      source: fakeWindow,
      data: netflixTtmlResponseMessage(
        'early-english',
        '81262757',
        netflixFixture,
      ),
    } as unknown as MessageEvent<unknown>);
    adapter.bindGeneration?.({
      contentGeneration: 2,
      clockGeneration: 2,
    });
    onMessage?.({
      source: fakeWindow,
      data: netflixManifestMessage({
        movieId: 81262757,
        timedtexttracks: [
          {
            id: 'english-cc',
            language: 'en',
            languageDescription: 'English',
            rawTrackType: 'closedcaptions',
            hydrated: true,
            ttDownloadables: {
              text: {
                downloadUrls: { primary: 'https://example.test/en-cc' },
              },
            },
          },
          {
            id: 'english-plain',
            language: 'en',
            languageDescription: 'English',
            hydrated: true,
            ttDownloadables: {
              text: {
                downloadUrls: { primary: 'https://example.test/en' },
              },
            },
          },
          {
            id: 'traditional-chinese',
            language: 'zh-Hant',
            languageDescription: '中文（繁體）',
            hydrated: true,
            ttDownloadables: {
              text: {
                downloadUrls: { primary: 'https://example.test/zh' },
              },
            },
          },
        ],
      }),
    } as unknown as MessageEvent<unknown>);
    adapter.start();

    const englishCc = emittedTracks?.find(({ id }) => id === 'english-cc');
    expect(englishCc).toBeDefined();
    const cuesPromise = adapter.fetchTrack(englishCc!);
    await vi.advanceTimersByTimeAsync(500);

    expect((await cuesPromise)[0]).toMatchObject({
      start: 22_708,
      end: 24_708,
      language: 'en',
    });
    expect(selectedKey).toBe('traditional-chinese');
    expect(menuOpen).toBe(false);
  });

  it('retries after a real interaction makes episode controls available', async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, (event: Event) => void>();
    const fakeWindow = {
      addEventListener(type: string, callback: (event: Event) => void) {
        listeners.set(type, callback);
      },
      setTimeout,
      clearTimeout,
      location: {
        href: 'https://www.netflix.com/watch/81262754',
      },
    } as unknown as Window & typeof globalThis;
    let controlsAvailable = false;
    let menuOpen = false;
    const visible = {
      getClientRects: () => [{}],
    };
    const video = {
      ...visible,
      readyState: 4,
    };
    const button = {
      click() {
        menuOpen = true;
      },
    };
    const option = {
      textContent: '中文（繁體）',
      getAttribute(name: string) {
        if (name === 'data-uia') {
          return 'subtitle-item-selected-中文（繁體）';
        }
        if (name === 'aria-selected') return 'true';
        return null;
      },
    };
    const menu = {
      ...visible,
      querySelectorAll: () => [option],
      dispatchEvent() {
        menuOpen = false;
        return true;
      },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', {
      querySelector(selector: string) {
        if (selector === '#appMountPoint video') return video;
        if (selector.includes('control-audio-subtitle')) {
          return controlsAvailable ? button : null;
        }
        if (selector === 'div[data-uia="selector-audio-subtitle"]') {
          return menuOpen ? menu : null;
        }
        return null;
      },
    });
    vi.stubGlobal('getComputedStyle', () => ({
      display: 'block',
      visibility: 'visible',
    }));
    vi.stubGlobal('KeyboardEvent', class {});
    const adapter = createNetflixAdapter();
    const emissions: string[][] = [];
    adapter.onTracks((tracks) => emissions.push(tracks.map(({ id }) => id)));

    adapter.start();
    await vi.advanceTimersByTimeAsync(8_100);
    expect(emissions).toEqual([[]]);

    controlsAvailable = true;
    listeners.get('pointermove')?.(new Event('pointermove'));
    await vi.advanceTimersByTimeAsync(200);

    expect(emissions).toEqual([[], ['menu:zh-Hant:plain:中文[繁體]']]);
  });
});
