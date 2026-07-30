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
  vi.restoreAllMocks();
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
          return 'subtitle-item-selected-zh-Hant';
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
    expect(menuOpen).toBe(false);
  });

  it('fails closed when catalog enumeration cannot restore the menu', async () => {
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
      textContent: '日本語',
      getAttribute(name: string) {
        if (name === 'data-uia') return 'subtitle-item-selected-ja';
        if (name === 'aria-selected') return 'true';
        return null;
      },
    };
    const menu = {
      ...visible,
      querySelectorAll: () => [option],
      dispatchEvent() {
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
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const adapter = createNetflixAdapter();
    const emissions: string[][] = [];
    adapter.onTracks((tracks) => emissions.push(tracks.map(({ id }) => id)));

    adapter.start();
    await vi.advanceTimersByTimeAsync(8_100);

    expect(emissions).toEqual([[]]);
    expect(menuOpen).toBe(true);
  });

  it('acquires a non-default official pair and restores native state', async () => {
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
    let selectedKey = 'simplified-chinese';
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
          config.key === 'japanese-cc'
        ) {
          queueMicrotask(() => {
            onMessage?.({
              source: fakeWindow,
              data: netflixTtmlResponseMessage(
                'japanese-after-selection',
                '81262757',
                netflixFixture.replace('xml:lang="en"', 'xml:lang="ja"'),
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
        key: 'japanese-cc',
        label: '日本語 (CC)',
        language: 'ja',
        closedCaptions: true,
      }),
      option({
        key: 'japanese-plain',
        label: '日本語',
        language: 'ja',
      }),
      option({
        key: 'simplified-chinese',
        label: '中文（简体）',
        language: 'zh-Hans',
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
      contentGeneration: 2,
      clockGeneration: 2,
    });

    onMessage?.({
      source: fakeWindow,
      data: netflixTtmlResponseMessage(
        'early-japanese',
        '81262757',
        netflixFixture.replace('xml:lang="en"', 'xml:lang="ja"'),
      ),
    } as unknown as MessageEvent<unknown>);
    onMessage?.({
      source: fakeWindow,
      data: netflixTtmlResponseMessage(
        'early-simplified-chinese',
        '81262757',
        netflixFixture.replace('xml:lang="en"', 'xml:lang="zh-Hans"'),
      ),
    } as unknown as MessageEvent<unknown>);
    onMessage?.({
      source: fakeWindow,
      data: netflixManifestMessage({
        movieId: 81262757,
        timedtexttracks: [
          {
            id: 'japanese-cc',
            language: 'ja',
            languageDescription: '日本語',
            rawTrackType: 'closedcaptions',
            hydrated: true,
            ttDownloadables: {
              text: {
                downloadUrls: { primary: 'https://example.test/ja-cc' },
              },
            },
          },
          {
            id: 'japanese-plain',
            language: 'ja',
            languageDescription: '日本語',
            hydrated: true,
            ttDownloadables: {
              text: {
                downloadUrls: { primary: 'https://example.test/ja' },
              },
            },
          },
          {
            id: 'simplified-chinese',
            language: 'zh-Hans',
            languageDescription: '中文（简体）',
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

    const japaneseCc = emittedTracks?.find(({ id }) => id === 'japanese-cc');
    const simplifiedChinese = emittedTracks?.find(
      ({ id }) => id === 'simplified-chinese',
    );
    expect(japaneseCc).toBeDefined();
    expect(simplifiedChinese).toBeDefined();
    const japaneseCuesPromise = adapter.fetchTrack(japaneseCc!);
    const chineseCuesPromise = adapter.fetchTrack(simplifiedChinese!);
    await vi.advanceTimersByTimeAsync(500);

    expect((await japaneseCuesPromise)[0]).toMatchObject({
      start: 22_708,
      end: 24_708,
      language: 'ja',
    });
    expect((await chineseCuesPromise)[0]).toMatchObject({
      start: 22_708,
      end: 24_708,
      language: 'zh-Hans',
    });
    expect(selectionClicks).toBe(0);
    expect(selectedKey).toBe('simplified-chinese');
    expect(menuOpen).toBe(false);

    emitResponseAfterSelection = true;
    const recapturedJapanese = adapter.fetchTrack(japaneseCc!);
    await vi.advanceTimersByTimeAsync(500);

    expect((await recapturedJapanese)[0]).toMatchObject({
      language: 'ja',
    });
    expect(selectionHistory).toEqual([
      'japanese-cc',
      'simplified-chinese',
    ]);
    expect(selectedKey).toBe('simplified-chinese');
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
          return 'subtitle-item-selected-zh-Hant';
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
