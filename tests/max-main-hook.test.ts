import { afterEach, describe, expect, it, vi } from 'vitest';

import { startMaxMainHook } from '../src/main/max-hook';

const EPISODE_ONE =
  '/video/watch/b8a64f23-c654-4be6-829a-1cb5fb0b7c8e/c6728d9b-86a7-45cd-97a9-4ac7380aa4c6';
const EPISODE_TWO =
  '/video/watch/41c7eddd-2eea-4ed3-a299-474d693063f4/35a8260d-3bc6-4b91-b370-a5f3c72ad6d5';
const PLAYBACK_INFO_URL =
  'https://default.any-any.prd.api.hbomax.com/any/playback/v1/playbackInfo';

class FakeXmlHttpRequest {
  open(): void {}
  send(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Max MAIN-world response observation', () => {
  it('binds a response to the episode active when it completes', async () => {
    let resolveFetch:
      | ((response: Response) => void)
      | undefined;
    const originalFetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const postMessage = vi.fn();
    const location = {
      href: `https://play.hbomax.com${EPISODE_ONE}`,
      origin: 'https://play.hbomax.com',
    };

    vi.stubGlobal('window', {
      fetch: originalFetch,
      location,
      postMessage,
    });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);

    startMaxMainHook();
    const response = window.fetch(PLAYBACK_INFO_URL);
    location.href = `https://play.hbomax.com${EPISODE_TWO}`;
    resolveFetch?.(
      new Response(
        JSON.stringify({
          manifest: {
            url: 'https://edge.prd.media.h264.io/title/dash.mpd',
          },
          videos: [],
        }),
        { status: 200 },
      ),
    );
    await response;

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledOnce();
    });
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'max-subtitle-response',
      kind: 'playback-info',
      contentIdentity: EPISODE_TWO,
    });
  });
});
