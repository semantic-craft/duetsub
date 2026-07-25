import { describe, expect, it, vi } from 'vitest';

import { createPrimeVideoWebRequestObserver } from '../src/background/primevideo-subtitles';

const OFF_CAMPUS_TEXT_URL =
  'https://subtitle.ta.pop-vod-dash.main.amazon.pv-cdn.net/asset/' +
  'english_text_1.mp4?token=SIGNED_PLACEHOLDER';

describe('Prime background response observation', () => {
  it('fetches one complete Off Campus track and forwards it for every observed range', async () => {
    const completeTrack =
      '\u0000\u0000mdat<?xml version="1.0"?>' +
      '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en-US">' +
      '<body><div><p begin="00:00:04.625" end="00:00:06.291">' +
      'Sanitized cue' +
      '</p></div></body></tt>';
    const fetch = vi.fn().mockResolvedValue(
      new Response(completeTrack, { status: 200 }),
    );
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const observe = createPrimeVideoWebRequestObserver({
      fetch,
      sendMessage,
    });

    await observe({ tabId: 42, url: OFF_CAMPUS_TEXT_URL });
    await observe({ tabId: 42, url: OFF_CAMPUS_TEXT_URL });

    expect(fetch).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[0]).toEqual([
      42,
      expect.objectContaining({
        direction: 'main-to-isolated',
        type: 'prime-ttml-response',
        siteId: 'primevideo',
        url: OFF_CAMPUS_TEXT_URL,
        raw: completeTrack,
      }),
    ]);
  });

  it('ignores extension-origin and lookalike CDN requests', async () => {
    const fetch = vi.fn();
    const sendMessage = vi.fn();
    const observe = createPrimeVideoWebRequestObserver({
      fetch,
      sendMessage,
    });

    await observe({ tabId: -1, url: OFF_CAMPUS_TEXT_URL });
    await observe({
      tabId: 42,
      url:
        'https://subtitle.ta.pop-vod-dash.main.amazon.pv-cdn.net.' +
        'attacker.example/asset/english_text_1.mp4',
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
