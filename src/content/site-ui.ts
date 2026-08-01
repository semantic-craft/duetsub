import type { SiteId } from '../core/contracts';
import {
  PRIME_PLAYER_SELECTOR,
  PRIME_VIDEO_SELECTOR,
} from '../core/primevideo-dom';
import { readNetflixWatchIdentity } from '../adapters/netflix-location';
import { readMaxContentIdentity } from '../adapters/max-location';
import { readDisneyContentIdentity } from '../adapters/disney-location';
import { youtubeVideoIdFromUrl } from '../adapters/youtube-url';

interface SiteUiBinding {
  readonly videoSelector: string;
  readonly playerSelector?: string;
  readonly controlsSelector?: string;
  readonly toggleBeforeSelector?: string;
  readonly nativeCaptionSelector: string;
  readonly suppressNativeVideoCues?: boolean;
}

const SITE_UI: Record<SiteId, SiteUiBinding> = {
  netflix: {
    videoSelector: '#appMountPoint video',
    playerSelector: '.watch-video--player-view',
    nativeCaptionSelector:
      '.player-timedtext, [data-duetsub-native-captions="netflix"]',
  },
  primevideo: {
    videoSelector: PRIME_VIDEO_SELECTOR,
    playerSelector: PRIME_PLAYER_SELECTOR,
    nativeCaptionSelector:
      '.atvwebplayersdk-captions-overlay, [data-duetsub-native-captions="primevideo"]',
  },
  max: {
    videoSelector: '[data-testid="VideoElement"]',
    controlsSelector:
      '[data-testid="playback_controls"] *:has(> [data-testid="player-ux-track-selector-button"]):has(> [data-testid="player-ux-fullscreen-button"])',
    toggleBeforeSelector:
      '[data-testid="playback_controls"] *:has(> [data-testid="player-ux-track-selector-button"]):has(> [data-testid="player-ux-fullscreen-button"]) > [data-testid="player-ux-fullscreen-button"]',
    nativeCaptionSelector:
      '[data-testid="caption_renderer_overlay"], [data-duetsub-native-captions="max"]',
  },
  youtube: {
    videoSelector: '#movie_player video',
    playerSelector: '#movie_player',
    controlsSelector: '.ytp-right-controls',
    nativeCaptionSelector:
      '.ytp-caption-window-container, [data-duetsub-native-captions="youtube"]',
  },
  disneyplus: {
    videoSelector: 'disney-web-player video',
    playerSelector: 'disney-web-player',
    nativeCaptionSelector:
      'timed-text-override-region, [data-duetsub-native-captions="disneyplus"]',
    suppressNativeVideoCues: true,
  },
};

export interface SiteUiTarget {
  readonly video: HTMLVideoElement;
  readonly player: HTMLElement;
  readonly controls?: HTMLElement;
  readonly toggleBefore?: HTMLElement;
  readonly nativeCaptionSelector: string;
  readonly nativeCaptionRoot?: HTMLElement;
  readonly contentIdentity?: string;
  readonly nativeCueVideos?: readonly HTMLVideoElement[];
}

export function findSiteUiTarget(siteId: SiteId): SiteUiTarget | undefined {
  if (
    siteId === 'youtube' &&
    youtubeVideoIdFromUrl(window.location.href) === undefined
  ) {
    return undefined;
  }
  if (
    siteId === 'netflix' &&
    readNetflixWatchIdentity(window.location.href) === undefined
  ) {
    return undefined;
  }
  if (
    siteId === 'disneyplus' &&
    readDisneyContentIdentity(window.location.href) === undefined
  ) {
    return undefined;
  }
  const binding = SITE_UI[siteId];
  const video = siteId === 'disneyplus'
    ? findDisneyVideo(binding.videoSelector)
    : document.querySelector<HTMLVideoElement>(binding.videoSelector) ??
      undefined;
  if (video === undefined) return undefined;

  const selectedPlayer = binding.playerSelector
    ? document.querySelector<HTMLElement>(binding.playerSelector)
    : undefined;
  const player = selectedPlayer ?? video.parentElement;
  if (player === null) return undefined;
  if (siteId === 'primevideo' && !isVisible(player)) return undefined;

  const primeControls =
    siteId === 'primevideo' ? findPrimeVideoControls(player) : undefined;
  const netflixControls =
    siteId === 'netflix' ? findNetflixControls(player) : undefined;
  const disneyUi = siteId === 'disneyplus'
    ? document.querySelector<HTMLElement>('disney-web-player-ui') ?? undefined
    : undefined;
  const disneyControls = findDisneyControls(disneyUi);
  const controls =
    disneyControls.controls ??
    netflixControls?.controls ??
    primeControls?.controls ??
    (binding.controlsSelector
      ? document.querySelector<HTMLElement>(binding.controlsSelector) ??
        undefined
      : undefined);
  const selectedToggleBefore =
    disneyControls.toggleBefore ??
    netflixControls?.toggleBefore ??
    primeControls?.toggleBefore ??
    (binding.toggleBeforeSelector
      ? document.querySelector<HTMLElement>(binding.toggleBeforeSelector)
      : null);
  const toggleBefore =
    controls !== undefined && selectedToggleBefore?.parentElement === controls
      ? selectedToggleBefore
      : undefined;

  return {
    video,
    player,
    controls,
    toggleBefore,
    nativeCaptionSelector: binding.nativeCaptionSelector,
    nativeCaptionRoot: disneyUi,
    nativeCueVideos: binding.suppressNativeVideoCues
      ? [...document.querySelectorAll<HTMLVideoElement>(binding.videoSelector)]
      : undefined,
    contentIdentity:
      siteId === 'primevideo'
        ? readPrimeContentIdentity(player)
        : siteId === 'max'
          ? readMaxContentIdentity(window.location.href)
          : siteId === 'netflix'
            ? readNetflixWatchIdentity(window.location.href)
          : siteId === 'disneyplus'
            ? readDisneyContentIdentity(window.location.href)
          : undefined,
  };
}

function findDisneyControls(disneyUi?: HTMLElement): {
  readonly controls?: HTMLElement;
  readonly toggleBefore?: HTMLElement;
} {
  const root = disneyUi
    ?.querySelector<HTMLElement>('main-app-controls-overlay')
    ?.shadowRoot;
  if (root === undefined || root === null) return {};

  const candidates = root.querySelectorAll<HTMLElement>(
    '.experience-controls, ' +
    '.experience-controls-narrow, ' +
    '.experience-controls-extra-narrow',
  );
  for (const controls of candidates) {
    if (!isVisible(controls)) continue;
    const toggleBefore = [...controls.children].find(
      (element) => element.localName === 'toggle-mute-button',
    ) as HTMLElement | undefined;
    if (toggleBefore !== undefined) return { controls, toggleBefore };
  }
  return {};
}

function findDisneyVideo(selector: string): HTMLVideoElement | undefined {
  const candidates = [...document.querySelectorAll<HTMLVideoElement>(selector)];
  return candidates.find((video) => {
    const bounds = video.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  }) ?? candidates.find((video) => video.readyState > HTMLMediaElement.HAVE_NOTHING) ??
    candidates[0];
}

function findNetflixControls(player: HTMLElement): {
  readonly controls?: HTMLElement;
  readonly toggleBefore?: HTMLElement;
} {
  const audio = player.querySelector<HTMLElement>(
    'button[data-uia="control-audio-subtitle"]',
  );
  const fullscreen = player.querySelector<HTMLElement>(
    'button[data-uia^="control-fullscreen-"]',
  );
  const audioWrapper = audio?.parentElement ?? undefined;
  const toggleBefore = fullscreen?.parentElement ?? undefined;
  const controls = toggleBefore?.parentElement ?? undefined;

  if (
    controls === undefined ||
    toggleBefore === undefined ||
    audioWrapper?.parentElement !== controls
  ) {
    return {};
  }
  return { controls, toggleBefore };
}

function findPrimeVideoControls(player: HTMLElement): {
  readonly controls?: HTMLElement;
  readonly toggleBefore?: HTMLElement;
} {
  const subtitle = player.querySelector<HTMLElement>(
    'button[aria-label="Subtitles and Audio Menu"]',
  );
  const toggleBefore = subtitle?.parentElement ?? undefined;
  const controls = toggleBefore?.parentElement ?? undefined;

  if (controls === undefined || toggleBefore === undefined) {
    return {};
  }
  return { controls, toggleBefore };
}

function readPrimeContentIdentity(player: HTMLElement): string | undefined {
  const title = player
    .querySelector<HTMLElement>('.atvwebplayersdk-title-text')
    ?.textContent?.trim();
  if (!title) return undefined;
  const episode = player
    .querySelector<HTMLElement>('.atvwebplayersdk-subtitle-text')
    ?.textContent?.trim();
  return episode ? `${title}\n${episode}` : title;
}

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    element.getClientRects().length > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden'
  );
}
