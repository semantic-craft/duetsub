import { describe, expect, it } from 'vitest';

import { OVERLAY_FONT_SIZE } from '../src/content/overlay-view';

describe('overlay typography', () => {
  it('keeps the frozen rem bounds independent of the host page root size', () => {
    expect(OVERLAY_FONT_SIZE).toBe('clamp(13.76px, 6.2cqh, 40px)');
  });
});
