import { afterEach, describe, expect, it, vi } from 'vitest';

import { startPrimeVideoMainHook } from '../src/main/primevideo-hook';

const OFF_CAMPUS_TEXT_URL =
  'https://a124vod-dash-pv-ta-amazon.akamaized.net/ww_nrt/sanitized/' +
  'english_text_1.mp4?token=SIGNED_PLACEHOLDER';

class FakeXmlHttpRequest {
  open(): void {}
  send(): void {}
}

class FakeSourceBuffer {
  #timestampOffset = 0;

  get timestampOffset(): number {
    return this.#timestampOffset;
  }

  set timestampOffset(value: number) {
    this.#timestampOffset = value;
  }
}

class FakeMediaSource {
  addSourceBuffer(): FakeSourceBuffer {
    return new FakeSourceBuffer();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
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
    let activeVideoSource = '';
    let messageListener:
      | ((event: MessageEvent<unknown>) => void)
      | undefined;
    let clickListener: ((event: MouseEvent) => void) | undefined;

    vi.stubGlobal('window', {
      fetch: originalFetch,
      location: {
        href: 'https://www.primevideo.com/region/eu/detail/off-campus',
        origin: 'https://www.primevideo.com',
      },
      postMessage,
      addEventListener(
        type: string,
        listener: (event: MessageEvent<unknown>) => void,
      ) {
        if (type === 'message') messageListener = listener;
      },
    });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    vi.stubGlobal('HTMLInputElement', class {
      static [Symbol.hasInstance](value: unknown): boolean {
        return typeof (value as { matches?: unknown })?.matches === 'function';
      }
    });
    vi.stubGlobal('SourceBuffer', FakeSourceBuffer);
    vi.stubGlobal('MediaSource', FakeMediaSource);
    vi.stubGlobal('document', {
      addEventListener(
        type: string,
        listener: (event: MouseEvent) => void,
      ) {
        if (type === 'click') clickListener = listener;
      },
      querySelector(selector: string) {
        if (selector !== '#dv-web-player video') return null;
        return {
          currentSrc: activeVideoSource,
          src: activeVideoSource,
        };
      },
    });
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:https://www.primevideo.com/active-player')
      .mockReturnValueOnce('blob:https://www.primevideo.com/preview');
    vi.spyOn(URL, 'revokeObjectURL');

    startPrimeVideoMainHook();
    const mediaSource = new MediaSource();
    activeVideoSource = URL.createObjectURL(mediaSource);
    const audio = mediaSource.addSourceBuffer('audio/mp4');
    const video = mediaSource.addSourceBuffer('video/mp4');
    audio.timestampOffset = 0;
    video.timestampOffset = 0;

    expect(messageListener).toBeTypeOf('function');
    messageListener?.({
      source: window,
      data: {
        channel: 'duetsub',
        version: 1,
        direction: 'isolated-to-main',
        type: 'request-prime-timeline-offset',
        siteId: 'primevideo',
        requestId: 'initializing-clock-request',
      },
    } as unknown as MessageEvent<unknown>);
    expect(postMessage).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(postMessage).not.toHaveBeenCalled();

    video.timestampOffset = 6;
    audio.timestampOffset = 6;

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledOnce();
    });
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'prime-timeline-offset',
      requestId: 'initializing-clock-request',
      timelineOffsetMs: 6_000,
    });

    const observationGeneration = {
      contentGeneration: 4,
      clockGeneration: 7,
      selectionGeneration: 2,
    };
    clickListener?.({
      target: {
        id: 'en-us_Caption_Dialog',
        matches: (selector: string) =>
          selector === 'input[type="radio"][name="subtitle"]',
        getAttribute: (name: string) =>
          name === 'data-duetsub-observation-request'
            ? 'english-observation'
            : name === 'data-duetsub-observation-generation'
            ? '4:7:2'
            : null,
      },
    } as unknown as MouseEvent);

    await window.fetch(
      new Request(OFF_CAMPUS_TEXT_URL, {
        headers: { range: 'bytes=0-16383' },
      }),
    );

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(2);
    });
    expect(postMessage.mock.calls[1]?.[0]).toMatchObject({
      type: 'prime-ttml-response',
      url: OFF_CAMPUS_TEXT_URL,
      raw: completeTrack,
      observation: {
        requestId: 'english-observation',
        trackId: 'en-us_Caption_Dialog',
        generation: observationGeneration,
      },
    });

    await window.fetch(OFF_CAMPUS_TEXT_URL, {
      headers: { range: 'bytes=16384-32767' },
    });

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(3);
    });
    expect(postMessage.mock.calls[2]?.[0]).toMatchObject({
      type: 'prime-ttml-response',
      url: OFF_CAMPUS_TEXT_URL,
      raw: completeTrack,
    });
    expect(postMessage.mock.calls[2]?.[0]).not.toHaveProperty('observation');
    expect(originalFetch).toHaveBeenCalledTimes(3);

    const previewMediaSource = new MediaSource();
    URL.createObjectURL(previewMediaSource);
    const previewAudio = previewMediaSource.addSourceBuffer('audio/mp4');
    const previewVideo = previewMediaSource.addSourceBuffer('video/mp4');
    previewAudio.timestampOffset = 0;
    previewVideo.timestampOffset = 0;

    messageListener?.({
      source: window,
      data: {
        channel: 'duetsub',
        version: 1,
        direction: 'isolated-to-main',
        type: 'request-prime-timeline-offset',
        siteId: 'primevideo',
        requestId: 'clock-request',
      },
    } as unknown as MessageEvent<unknown>);
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(4);
    });
    expect(postMessage.mock.calls.at(-1)?.[0]).toMatchObject({
      type: 'prime-timeline-offset',
      requestId: 'clock-request',
      timelineOffsetMs: 6_000,
    });
  });
});
