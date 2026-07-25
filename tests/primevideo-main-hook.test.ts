import { afterEach, describe, expect, it, vi } from 'vitest';

import { startPrimeVideoMainHook } from '../src/main/primevideo-hook';

const OFF_CAMPUS_TEXT_URL =
  'https://a124vod-dash-pv-ta-amazon.akamaized.net/ww_nrt/sanitized/' +
  'english_text_1.mp4?token=SIGNED_PLACEHOLDER';

class FakeXmlHttpRequest {
  open(): void {}
  send(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Prime MAIN-world response observation', () => {
  it('forwards the complete Off Campus text track instead of a range fragment', async () => {
    const completeTrack =
      '\u0000\u0000mdat<?xml version="1.0"?>' +
      '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en-US">' +
      '<body><div><p begin="00:00:04.625" end="00:00:06.291">' +
      'Sanitized cue' +
      '</p></div></body></tt>';
    const originalFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('range-fragment', { status: 206 }))
      .mockResolvedValueOnce(new Response(completeTrack, { status: 200 }))
      .mockResolvedValueOnce(
        new Response('cached-range-fragment', { status: 206 }),
      );
    const postMessage = vi.fn();

    vi.stubGlobal('window', {
      fetch: originalFetch,
      location: {
        href: 'https://www.primevideo.com/region/eu/detail/off-campus',
        origin: 'https://www.primevideo.com',
      },
      postMessage,
    });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);

    startPrimeVideoMainHook();
    await window.fetch(
      new Request(OFF_CAMPUS_TEXT_URL, {
        headers: { range: 'bytes=0-16383' },
      }),
    );

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledOnce();
    });
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'prime-ttml-response',
      url: OFF_CAMPUS_TEXT_URL,
      raw: completeTrack,
    });

    await window.fetch(OFF_CAMPUS_TEXT_URL, {
      headers: { range: 'bytes=16384-32767' },
    });

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(2);
    });
    expect(postMessage.mock.calls[1]?.[0]).toMatchObject({
      type: 'prime-ttml-response',
      url: OFF_CAMPUS_TEXT_URL,
      raw: completeTrack,
    });
    expect(originalFetch).toHaveBeenCalledTimes(3);
  });
});
