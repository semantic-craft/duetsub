import {
  isPrimeTtmlUrl,
  primeTtmlResponseMessage,
  type PrimeTtmlResponseMessage,
} from '../core/messages';

interface PrimeVideoWebRequestDetails {
  readonly tabId: number;
  readonly url: string;
}

interface PrimeVideoWebRequestPorts {
  readonly fetch: (url: string) => Promise<Response>;
  readonly sendMessage: (
    tabId: number,
    message: PrimeTtmlResponseMessage,
  ) => Promise<unknown>;
}

export function createPrimeVideoWebRequestObserver(
  ports: PrimeVideoWebRequestPorts,
): (details: PrimeVideoWebRequestDetails) => Promise<void> {
  const completePayloads = new Map<string, Promise<string>>();

  return async ({ tabId, url }) => {
    if (tabId < 0 || !isPrimeTtmlUrl(url) || !isFragmentedTextUrl(url)) return;

    let payload = completePayloads.get(url);
    if (payload === undefined) {
      payload = fetchCompleteTrack(ports.fetch, url);
      completePayloads.set(url, payload);
    }

    try {
      const raw = await payload;
      await ports.sendMessage(
        tabId,
        primeTtmlResponseMessage(crypto.randomUUID(), url, raw),
      );
    } catch {
      if (completePayloads.get(url) === payload) {
        completePayloads.delete(url);
      }
    }
  };
}

async function fetchCompleteTrack(
  fetchTrack: PrimeVideoWebRequestPorts['fetch'],
  url: string,
): Promise<string> {
  const response = await fetchTrack(url);
  if (!response.ok) throw new Error('Prime text MP4 request failed');
  const raw = await response.text();
  if (raw.length === 0 || raw.length > 2_000_000) {
    throw new Error('Prime text MP4 response is invalid');
  }
  return raw;
}

function isFragmentedTextUrl(value: string): boolean {
  try {
    return /_text_\d+\.mp4$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}
