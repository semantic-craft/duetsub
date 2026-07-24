import { afterEach, describe, expect, it, vi } from 'vitest';

import { NativeCaptionVisibility } from '../src/content/native-captions';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('native caption visibility', () => {
  it('reasserts hidden after the site resets a tracked element style', () => {
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
