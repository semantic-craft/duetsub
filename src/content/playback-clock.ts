import type { SiteAdapter } from '../core/contracts';

export function resolvePlaybackTimeMs(
  adapter: SiteAdapter | undefined,
  video: HTMLVideoElement,
): number {
  const siteTimeMs = adapter?.getPlaybackTimeMs?.();
  return typeof siteTimeMs === 'number' &&
      Number.isFinite(siteTimeMs) &&
      siteTimeMs >= 0
    ? siteTimeMs
    : video.currentTime * 1_000;
}
