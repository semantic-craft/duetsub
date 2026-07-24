export function isNetflixWatchUrl(value: string | URL): boolean {
  return readNetflixWatchIdentity(value) !== undefined;
}

export function readNetflixWatchIdentity(
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
    url.hostname !== 'www.netflix.com' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    return undefined;
  }

  return url.pathname.match(/^\/watch\/([^/]+)\/?$/)?.[1];
}
