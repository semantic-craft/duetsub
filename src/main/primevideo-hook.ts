import {
  isPrimeTtmlUrl,
  postDuetSubMessage,
  primeTtmlResponseMessage,
} from '../core/messages';

const xhrUrls = new WeakMap<XMLHttpRequest, string>();

export function startPrimeVideoMainHook(): void {
  patchFetch();
  patchXmlHttpRequest();
}

function patchFetch(): void {
  const originalFetch = window.fetch;

  window.fetch = function duetSubPrimeFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const result = originalFetch.call(this, input, init);
    const url = requestUrl(input);

    if (url !== undefined && isPrimeTtmlUrl(url)) {
      void result.then(
        (response) => observeFetchResponse(response, url),
        () => undefined,
      );
    }

    return result;
  };
}

function patchXmlHttpRequest(): void {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function duetSubPrimeOpen(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    const resolved = resolveUrl(String(url));
    if (resolved !== undefined && isPrimeTtmlUrl(resolved)) {
      xhrUrls.set(this, resolved);
    } else {
      xhrUrls.delete(this);
    }

    originalOpen.call(this, method, url, async ?? true, username, password);
  };

  XMLHttpRequest.prototype.send = function duetSubPrimeSend(
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const url = xhrUrls.get(this);
    if (url !== undefined) {
      this.addEventListener(
        'load',
        () => {
          void observeXhrResponse(this, url);
        },
        { once: true },
      );
    }

    originalSend.call(this, body);
  };
}

async function observeFetchResponse(
  response: Response,
  url: string,
): Promise<void> {
  try {
    forwardRawResponse(url, await response.clone().text());
  } catch {
    // Observing must never affect the page's original response.
  }
}

async function observeXhrResponse(
  xhr: XMLHttpRequest,
  url: string,
): Promise<void> {
  try {
    const raw = await readXhrBody(xhr);
    if (raw !== undefined) forwardRawResponse(url, raw);
  } catch {
    // Observing must never affect the page's original response.
  }
}

function readXhrBody(xhr: XMLHttpRequest): string | Promise<string> | undefined {
  if (typeof xhr.response === 'string') return xhr.response;
  if (xhr.response instanceof ArrayBuffer) {
    return new TextDecoder().decode(xhr.response);
  }
  if (xhr.response instanceof Blob) return xhr.response.text();
  return undefined;
}

function forwardRawResponse(url: string, raw: string): void {
  if (raw.length === 0 || raw.length > 2_000_000) return;
  postDuetSubMessage(
    primeTtmlResponseMessage(crypto.randomUUID(), url, raw),
  );
}

function requestUrl(input: RequestInfo | URL): string | undefined {
  if (input instanceof Request) return resolveUrl(input.url);
  return resolveUrl(String(input));
}

function resolveUrl(value: string): string | undefined {
  try {
    return new URL(value, window.location.href).href;
  } catch {
    return undefined;
  }
}
