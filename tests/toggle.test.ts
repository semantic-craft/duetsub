import { describe, expect, it } from 'vitest';

import {
  INITIAL_TOGGLE_STATE,
  isOverlayActive,
  reduceToggle,
} from '../src/core/toggle';

describe('toggle reducer', () => {
  it('starts off and toggles only the user preference', () => {
    expect(INITIAL_TOGGLE_STATE).toEqual({
      enabled: false,
      tracksReady: false,
      suspension: 'none',
    });

    expect(reduceToggle(INITIAL_TOGGLE_STATE, { type: 'toggle' })).toEqual({
      enabled: true,
      tracksReady: false,
      suspension: 'none',
    });
  });

  it('activates only when enabled, ready, and not suspended', () => {
    const enabled = reduceToggle(INITIAL_TOGGLE_STATE, {
      type: 'hydrate',
      enabled: true,
    });
    const ready = reduceToggle(enabled, { type: 'tracks-ready' });
    const suspended = reduceToggle(ready, {
      type: 'suspend',
      reason: 'seeking',
    });

    expect(isOverlayActive(enabled)).toBe(false);
    expect(isOverlayActive(ready)).toBe(true);
    expect(isOverlayActive(suspended)).toBe(false);
    expect(suspended.enabled).toBe(true);
    expect(isOverlayActive(reduceToggle(suspended, { type: 'resume' }))).toBe(
      true,
    );
  });

  it('resets readiness without forgetting the saved site preference', () => {
    const ready = reduceToggle(
      { ...INITIAL_TOGGLE_STATE, enabled: true },
      { type: 'tracks-ready' },
    );

    expect(reduceToggle(ready, { type: 'reset' })).toEqual({
      enabled: true,
      tracksReady: false,
      suspension: 'reset',
    });
  });
});
