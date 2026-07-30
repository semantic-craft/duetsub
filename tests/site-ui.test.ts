import { afterEach, describe, expect, it, vi } from 'vitest';

import { findSiteUiTarget } from '../src/content/site-ui';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Prime Video site UI', () => {
  it('anchors the toggle at the left edge before subtitles and audio', () => {
    const player = element();
    const controls = element(player);
    const subtitleWrapper = element(controls);
    const subtitle = element(subtitleWrapper);
    const video = element(player) as HTMLVideoElement;

    player.querySelector = vi.fn((selector: string) => {
      if (
        selector ===
        'button[aria-label="Subtitles and Audio Menu"]'
      ) {
        return subtitle;
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
    expect(target?.toggleBefore).toBe(subtitleWrapper);
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

describe('YouTube site UI', () => {
  it('uses the verified native caption window as the suppression target', () => {
    const player = element();
    const controls = element(player);
    const video = element(player) as HTMLVideoElement;

    vi.stubGlobal('window', {
      location: {
        href: 'https://www.youtube.com/watch?v=video-one',
      },
    });
    vi.stubGlobal('document', {
      querySelector: (selector: string) => {
        if (selector === '#movie_player video') return video;
        if (selector === '#movie_player') return player;
        if (selector === '.ytp-right-controls') return controls;
        return null;
      },
    });

    expect(findSiteUiTarget('youtube')?.nativeCaptionSelector).toBe(
      '.ytp-caption-window-container, [data-duetsub-native-captions="youtube"]',
    );
  });
});

describe('Netflix site UI', () => {
  it('uses the stable fullscreen anchor in the right control group', () => {
    const player = element();
    const rightControls = element(player);
    const audioWrapper = element(rightControls);
    const audio = element(audioWrapper);
    const fullscreenWrapper = element(rightControls);
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

    expect(target?.controls).toBe(rightControls);
    expect(target?.toggleBefore).toBe(fullscreenWrapper);
  });

  it('does not use an existing toggle as its next anchor', () => {
    const player = element();
    const rightControls = element(player);
    const existingToggle = element(rightControls);
    const audioWrapper = element(rightControls);
    const audio = element(audioWrapper);
    const fullscreenWrapper = element(rightControls);
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

    expect(target?.controls).toBe(rightControls);
    expect(target?.toggleBefore).toBe(fullscreenWrapper);
    expect(target?.toggleBefore).not.toBe(existingToggle);
  });
});

function element(parentElement: HTMLElement | null = null): HTMLElement {
  return {
    parentElement,
    querySelector: vi.fn(() => null),
    getClientRects: () => [{}] as unknown as DOMRectList,
  } as unknown as HTMLElement;
}
