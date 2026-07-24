import type { SiteId } from '../core/contracts';

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
    controlsSelector:
      '#dv-web-player .atvwebplayersdk-infobar-container *:has(> .atvwebplayersdk-nexttitle-button)',
    toggleBeforeSelector:
      '#dv-web-player .atvwebplayersdk-nexttitle-button',
    nativeCaptionSelector:
      '#dv-web-player .atvwebplayersdk-captions-overlay, [data-duetsub-native-captions="primevideo"]',
  },
  max: {
    videoSelector: '[data-testid="VideoElement"]',
    controlsSelector: '[data-testid="playback_controls"]',
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
  const binding = SITE_UI[siteId];
  const video = document.querySelector<HTMLVideoElement>(binding.videoSelector);
  if (video === null) return undefined;

  const selectedPlayer = binding.playerSelector
    ? document.querySelector<HTMLElement>(binding.playerSelector)
    : undefined;
  const player = selectedPlayer ?? video.parentElement;
  if (player === null) return undefined;
  if (siteId === 'primevideo' && !isVisible(player)) return undefined;

  const controls = binding.controlsSelector
    ? document.querySelector<HTMLElement>(binding.controlsSelector) ?? undefined
    : undefined;
  const selectedToggleBefore = binding.toggleBeforeSelector
    ? document.querySelector<HTMLElement>(binding.toggleBeforeSelector)
    : null;
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
    contentIdentity: siteId === 'primevideo'
      ? readPrimeEpisodeIdentity(player)
      : undefined,
  };
}

function readPrimeEpisodeIdentity(player: HTMLElement): string | undefined {
  const title = player
    .querySelector<HTMLElement>('.atvwebplayersdk-title-text')
    ?.textContent?.trim();
  const episode = player
    .querySelector<HTMLElement>('.atvwebplayersdk-subtitle-text')
    ?.textContent?.trim();
  return title && episode ? `${title}\n${episode}` : undefined;
}

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    element.getClientRects().length > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden'
  );
}
