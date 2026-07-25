import { afterEach, describe, expect, it, vi } from 'vitest';

import { findSiteUiTarget } from '../src/content/site-ui';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Prime Video site UI', () => {
  it('anchors the toggle in the current native control group before fullscreen', () => {
    const player = element();
    const subtitleControls = element(player);
    const subtitleWrapper = element(subtitleControls);
    const subtitle = element(subtitleWrapper);
    const controls = element(player);
    const fullscreenWrapper = element(controls);
    const fullscreen = element(fullscreenWrapper);
    const video = element(player) as HTMLVideoElement;

    player.querySelector = vi.fn((selector: string) => {
      if (
        selector ===
        'button[aria-label="Subtitles and Audio Menu"]'
      ) {
        return subtitle;
      }
      if (selector === 'button[aria-label="Fullscreen"]') {
        return fullscreen;
      }
      return null;
    }) as typeof player.querySelector;

    vi.stubGlobal('document', {
      querySelector: (selector: string) => {
        if (selector === '#dv-web-player video') return video;
        if (selector === '#dv-web-player') return player;
        return null;
      },
    });
    vi.stubGlobal('getComputedStyle', () => ({
      display: 'block',
      visibility: 'visible',
    }));

    const target = findSiteUiTarget('primevideo');

    expect(target?.controls).toBe(controls);
    expect(target?.toggleBefore).toBe(fullscreenWrapper);
  });

  it('uses the visible movie title as the verified content identity', () => {
    const player = element();
    const video = element(player) as HTMLVideoElement;
    const title = {
      textContent: ' 挽救计划 ',
    } as HTMLElement;

    player.querySelector = vi.fn((selector: string) => {
      if (selector === '.atvwebplayersdk-title-text') return title;
      return null;
    }) as typeof player.querySelector;

    vi.stubGlobal('document', {
      querySelector: (selector: string) => {
        if (selector === '#dv-web-player video') return video;
        if (selector === '#dv-web-player') return player;
        return null;
      },
    });
    vi.stubGlobal('getComputedStyle', () => ({
      display: 'block',
      visibility: 'visible',
    }));

    expect(findSiteUiTarget('primevideo')?.contentIdentity).toBe('挽救计划');
  });
});

describe('Netflix site UI', () => {
  it('anchors the toggle in the native control group before fullscreen', () => {
    const player = element();
    const controls = element(player);
    const audioWrapper = element(controls);
    const audio = element(audioWrapper);
    const speedWrapper = element(controls);
    const fullscreenWrapper = element(controls);
    const fullscreen = element(fullscreenWrapper);
    const video = element(player) as HTMLVideoElement;

    player.querySelector = vi.fn((selector: string) => {
      if (selector === 'button[data-uia="control-audio-subtitle"]') {
        return audio;
      }
      if (selector === 'button[data-uia^="control-fullscreen-"]') {
        return fullscreen;
      }
      return null;
    }) as typeof player.querySelector;

    vi.stubGlobal('window', {
      location: {
        href: 'https://www.netflix.com/watch/80021956',
      },
    });
    vi.stubGlobal('document', {
      querySelector: (selector: string) => {
        if (selector === '#appMountPoint video') return video;
        if (selector === '.watch-video--player-view') return player;
        return null;
      },
    });

    const target = findSiteUiTarget('netflix');

    expect(audioWrapper.parentElement).toBe(controls);
    expect(speedWrapper.parentElement).toBe(controls);
    expect(target?.controls).toBe(controls);
    expect(target?.toggleBefore).toBe(fullscreenWrapper);
  });
});

function element(parentElement: HTMLElement | null = null): HTMLElement {
  return {
    parentElement,
    querySelector: vi.fn(() => null),
    getClientRects: () => [{}] as unknown as DOMRectList,
  } as unknown as HTMLElement;
}
