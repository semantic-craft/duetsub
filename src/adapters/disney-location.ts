const DISNEY_PLAY_PATH =
  /^\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?play\/([A-Za-z0-9-]{36})$/i;

export function readDisneyContentIdentity(
  value: string | URL,
): string | undefined {
  let url: URL;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    return undefined;
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.disneyplus.com' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    return undefined;
  }
  const match = url.pathname.match(DISNEY_PLAY_PATH);
  return match === null ? undefined : `/play/${match[1]}`;
}
