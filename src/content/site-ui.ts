import type { SiteId } from '../core/contracts';
import { readNetflixWatchIdentity } from '../adapters/netflix-location';
import { readMaxContentIdentity } from '../adapters/max-location';
import { youtubeVideoIdFromUrl } from '../adapters/youtube-url';

interface SiteUiBinding {
  readonly videoSelector: string;
  readonly playerSelector?: string;
  readonly controlsSelector?: string;
  readonly toggleBeforeSelector?: string;
  readonly nativeCaptionSelector: string;
}

const SITE_UI: Record<SiteId, SiteUiBinding> = {
  netflix: {
    videoSelector: '#appMountPoint video',
    playerSelector: '.watch-video--player-view',
    nativeCaptionSelector:
      '.player-timedtext, [data-duetsub-native-captions="netflix"]',
  },
  primevideo: {
    videoSelector: '#dv-web-player video',
    playerSelector: '#dv-web-player',
    nativeCaptionSelector:
      '#dv-web-player .atvwebplayersdk-captions-overlay, [data-duetsub-native-captions="primevideo"]',
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
    nativeCaptionSelector: '[data-duetsub-native-captions="youtube"]',
  },
};

export interface SiteUiTarget {
  readonly video: HTMLVideoElement;
  readonly player: HTMLElement;
  readonly controls?: HTMLElement;
  readonly toggleBefore?: HTMLElement;
  readonly nativeCaptionSelector: string;
  readonly contentIdentity?: string;
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
  const binding = SITE_UI[siteId];
  const video = document.querySelector<HTMLVideoElement>(binding.videoSelector);
  if (video === null) return undefined;

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
  const controls =
    netflixControls?.controls ??
    primeControls?.controls ??
    (binding.controlsSelector
      ? document.querySelector<HTMLElement>(binding.controlsSelector) ??
        undefined
      : undefined);
  const selectedToggleBefore =
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
    contentIdentity:
      siteId === 'primevideo'
        ? readPrimeContentIdentity(player)
        : siteId === 'max'
          ? readMaxContentIdentity(window.location.href)
          : siteId === 'netflix'
            ? readNetflixWatchIdentity(window.location.href)
          : undefined,
  };
}

function findNetflixControls(player: HTMLElement): {
  readonly controls?: HTMLElement;
  readonly toggleBefore?: HTMLElement;
} {
  const subtitle = player.querySelector<HTMLElement>(
    'button[data-uia="control-audio-subtitle"]',
  );
  const fullscreen = player.querySelector<HTMLElement>(
    'button[data-uia^="control-fullscreen-"]',
  );
  const subtitleWrapper = subtitle?.parentElement ?? undefined;
  const toggleBefore = fullscreen?.parentElement ?? undefined;
  const controls = toggleBefore?.parentElement ?? undefined;

  if (
    controls === undefined ||
    toggleBefore === undefined ||
    subtitleWrapper?.parentElement !== controls
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
  const fullscreen = player.querySelector<HTMLElement>(
    'button[aria-label="Fullscreen"]',
  );
  const toggleBefore = fullscreen?.parentElement ?? undefined;
  const controls = toggleBefore?.parentElement ?? undefined;

  if (
    subtitle === null ||
    controls === undefined ||
    toggleBefore === undefined
  ) {
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
