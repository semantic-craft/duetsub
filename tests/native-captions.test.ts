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
