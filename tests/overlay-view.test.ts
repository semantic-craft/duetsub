import { describe, expect, it } from 'vitest';

import {
  OVERLAY_CSS,
  OVERLAY_FONT_SIZE,
} from '../src/content/overlay-view';

describe('overlay typography', () => {
  it('keeps the frozen rem bounds independent of the host page root size', () => {
    expect(OVERLAY_FONT_SIZE).toBe('clamp(13.76px, 6.2cqh, 40px)');
  });

  it('uses position roles, bidi isolation, and language-specific CJK fallbacks', () => {
    expect(OVERLAY_CSS).toContain('unicode-bidi: plaintext');
    expect(OVERLAY_CSS).toContain(':lang(ja)');
    expect(OVERLAY_CSS).toContain(':lang(zh-Hans)');
    expect(OVERLAY_CSS).toContain(':lang(zh-Hant)');
    expect(OVERLAY_CSS).toContain(':lang(ko)');
    expect(OVERLAY_CSS).not.toContain('.english');
    expect(OVERLAY_CSS).not.toContain('.chinese');
  });
});
