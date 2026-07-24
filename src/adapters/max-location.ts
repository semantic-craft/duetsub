const MAX_WATCH_PATH =
  /^\/video\/watch\/[A-Za-z0-9-]{1,128}\/[A-Za-z0-9-]{1,128}$/;

export function readMaxContentIdentity(
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
    url.hostname !== 'play.hbomax.com' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    !MAX_WATCH_PATH.test(url.pathname)
  ) {
    return undefined;
  }
  return url.pathname;
}
