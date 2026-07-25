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

  it('reuses first-load responses, then restores native state after fallback switching', async () => {
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
    let selectionClicks = 0;
    let emitResponseAfterSelection = false;
    let controlsVisible = true;
    const selectionHistory: string[] = [];
    const visible = {
      getClientRects: () => [{}],
    };
    const video = {
      ...visible,
      readyState: 4,
    };
    const button = {
      click() {
        if (!controlsVisible) return;
        menuOpen = true;
      },
    };
    const player = {
      dispatchEvent() {
        controlsVisible = true;
        return true;
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
        selectionClicks += 1;
        selectionHistory.push(config.key);
        selectedKey = config.key;
        menuOpen = false;
        controlsVisible = false;
        if (
          emitResponseAfterSelection &&
          config.key === 'english-cc'
        ) {
          queueMicrotask(() => {
            onMessage?.({
              source: fakeWindow,
              data: netflixTtmlResponseMessage(
                'english-after-selection',
                '81262757',
                netflixFixture,
              ),
            } as unknown as MessageEvent<unknown>);
          });
        }
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
      {
        textContent: '關閉',
        click() {
          selectionClicks += 1;
          selectionHistory.push('off');
          selectedKey = 'off';
          menuOpen = false;
          controlsVisible = false;
        },
        getAttribute(name: string) {
          if (name === 'data-uia') return 'subtitle-item-off';
          if (name === 'aria-selected') {
            return selectedKey === 'off' ? 'true' : 'false';
          }
          return null;
        },
      },
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
        if (selector === '.watch-video--player-view') return player;
        if (selector.includes('control-audio-subtitle')) {
          return controlsVisible ? button : null;
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
    onMessage?.({
      source: fakeWindow,
      data: netflixTtmlResponseMessage(
        'early-traditional-chinese',
        '81262757',
        netflixFixture.replace('xml:lang="en"', 'xml:lang="zh"'),
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
    const traditionalChinese = emittedTracks?.find(
      ({ id }) => id === 'traditional-chinese',
    );
    expect(englishCc).toBeDefined();
    expect(traditionalChinese).toBeDefined();
    const englishCuesPromise = adapter.fetchTrack(englishCc!);
    const chineseCuesPromise = adapter.fetchTrack(traditionalChinese!);
    await vi.advanceTimersByTimeAsync(500);

    expect((await englishCuesPromise)[0]).toMatchObject({
      start: 22_708,
      end: 24_708,
      language: 'en',
    });
    expect((await chineseCuesPromise)[0]).toMatchObject({
      start: 22_708,
      end: 24_708,
      language: 'zh-Hant',
    });
    expect(selectionClicks).toBe(0);
    expect(selectedKey).toBe('traditional-chinese');
    expect(menuOpen).toBe(false);

    emitResponseAfterSelection = true;
    const recapturedEnglish = adapter.fetchTrack(englishCc!);
    await vi.advanceTimersByTimeAsync(500);

    expect((await recapturedEnglish)[0]).toMatchObject({
      language: 'en',
    });
    expect(selectionHistory).toEqual([
      'english-cc',
      'traditional-chinese',
    ]);
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

  it('does not erase manifest tracks when menu enumeration times out later', async () => {
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
    const video = {
      getClientRects: () => [{}],
      readyState: 4,
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', {
      querySelector(selector: string) {
        if (selector === '#appMountPoint video') return video;
        return null;
      },
    });
    vi.stubGlobal('getComputedStyle', () => ({
      display: 'block',
      visibility: 'visible',
    }));
    const adapter = createNetflixAdapter();
    const emissions: string[][] = [];
    adapter.onTracks((tracks) => emissions.push(tracks.map(({ id }) => id)));

    adapter.start();
    await vi.advanceTimersByTimeAsync(100);
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
    await vi.advanceTimersByTimeAsync(8_100);

    expect(emissions).toEqual([
      ['english-cc', 'traditional-chinese'],
    ]);
  });
});
