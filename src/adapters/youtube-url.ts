export function youtubeVideoIdFromUrl(
  value: string | URL,
): string | undefined {
  try {
    const url = value instanceof URL ? value : new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'www.youtube.com' ||
      url.pathname !== '/watch'
    ) {
      return undefined;
    }
    const videoId = url.searchParams.get('v');
    return videoId !== null && /^[\w-]{6,32}$/.test(videoId)
      ? videoId
      : undefined;
  } catch {
    return undefined;
  }
}
