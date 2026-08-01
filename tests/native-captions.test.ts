import { afterEach, describe, expect, it, vi } from 'vitest';

import { NativeCaptionVisibility } from '../src/content/native-captions';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('native caption visibility', () => {
  it('keeps changing caption elements hidden while suppression is active', () => {
    let activeCaptions: HTMLElement[] = [];
    const dynamicCaption = {
      matches: () => true,
      style: { visibility: 'visible' },
    } as unknown as HTMLElement;
    const observationTarget = {
      contains: (element: HTMLElement) => activeCaptions.includes(element),
      querySelectorAll: () => activeCaptions,
    } as unknown as HTMLElement;
    const notifyMutations = stubMutationObserver();
    const captions = new NativeCaptionVisibility(
      '.native-captions',
      observationTarget,
    );

    captions.setHidden(true);
    activeCaptions = [dynamicCaption];
    notifyMutations();
    expect(dynamicCaption.style.visibility).toBe('hidden');
    dynamicCaption.style.visibility = 'visible';
    notifyMutations();
    expect(dynamicCaption.style.visibility).toBe('hidden');
    activeCaptions = [];
    notifyMutations();
    expect(dynamicCaption.style.visibility).toBe('visible');
  });

  it('reasserts hidden on explicit synchronization without observing', () => {
    const element = {
      style: { visibility: 'collapse' },
    } as HTMLElement;
    vi.stubGlobal('document', {
      querySelectorAll: () => [element],
    });
    const captions = new NativeCaptionVisibility('.native-captions');

    captions.setHidden(true);
    element.style.visibility = '';
    captions.setHidden(true);

    expect(element.style.visibility).toBe('hidden');
    captions.restore();
    expect(element.style.visibility).toBe('collapse');
  });

  it('suppresses and restores browser-native video cues', () => {
    const attributes = new Set<string>();
    const video = {
      hasAttribute: (name: string) => attributes.has(name),
      setAttribute: (name: string) => attributes.add(name),
      removeAttribute: (name: string) => attributes.delete(name),
    } as unknown as HTMLVideoElement;
    const appended: HTMLElement[] = [];
    vi.stubGlobal('document', {
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({ id: '', textContent: '' }),
      head: { append: (element: HTMLElement) => appended.push(element) },
    });
    const captions = new NativeCaptionVisibility(
      '.native-captions',
      undefined,
      video,
    );

    captions.setHidden(true);

    expect(
      attributes.has(NativeCaptionVisibility.VIDEO_CUE_ATTRIBUTE),
    ).toBe(true);
    expect(appended[0]?.textContent).toContain('::cue');

    captions.restore();
    expect(
      attributes.has(NativeCaptionVisibility.VIDEO_CUE_ATTRIBUTE),
    ).toBe(false);
  });

  it('moves native cue suppression to a replacement playback video', () => {
    const first = new Set<string>();
    const second = new Set<string>();
    const video = (attributes: Set<string>) => ({
      hasAttribute: (name: string) => attributes.has(name),
      setAttribute: (name: string) => attributes.add(name),
      removeAttribute: (name: string) => attributes.delete(name),
    }) as unknown as HTMLVideoElement;
    vi.stubGlobal('document', {
      querySelectorAll: () => [],
      getElementById: () => ({ id: 'duetsub-native-video-cue-style' }),
    });
    const captions = new NativeCaptionVisibility(
      '.native-captions',
      undefined,
      video(first),
    );

    captions.setHidden(true);
    captions.setCueVideos([video(second)]);
    captions.setHidden(true);

    expect(first.has(NativeCaptionVisibility.VIDEO_CUE_ATTRIBUTE)).toBe(false);
    expect(second.has(NativeCaptionVisibility.VIDEO_CUE_ATTRIBUTE)).toBe(true);
  });
});

function stubMutationObserver(): () => void {
  let notify: MutationCallback | undefined;
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(callback: MutationCallback) {
        notify = callback;
      }

      observe(): void {}
      disconnect(): void {}
    },
  );
  return () => {
    if (notify === undefined) throw new Error('MutationObserver was not created');
    notify([], {} as MutationObserver);
  };
}
