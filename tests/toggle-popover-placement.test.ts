import { describe, expect, it } from 'vitest';

import { choosePopoverPlacement } from '../src/content/toggle-view';

describe('DuetSub language popover placement', () => {
  it('opens downward when a player control is near the top viewport edge', () => {
    expect(
      choosePopoverPlacement({
        triggerTop: 140,
        triggerBottom: 188,
        popoverHeight: 360,
        viewportHeight: 900,
        gap: 8,
      }),
    ).toBe('below');
  });

  it('opens upward when a player control is near the bottom viewport edge', () => {
    expect(
      choosePopoverPlacement({
        triggerTop: 820,
        triggerBottom: 868,
        popoverHeight: 360,
        viewportHeight: 900,
        gap: 8,
      }),
    ).toBe('above');
  });

  it('uses the roomier side when the full menu fits on neither side', () => {
    expect(
      choosePopoverPlacement({
        triggerTop: 280,
        triggerBottom: 328,
        popoverHeight: 600,
        viewportHeight: 900,
        gap: 8,
      }),
    ).toBe('below');
  });
});
