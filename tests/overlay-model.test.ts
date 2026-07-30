import { describe, expect, it } from 'vitest';

import type { Cue } from '../src/core/contracts';
import { createOverlayModel } from '../src/core/overlay-model';

const top: Cue = {
  start: 0,
  end: 2_000,
  text: '第一行目',
  language: 'ja',
};
const bottom: Cue = {
  start: 0,
  end: 2_000,
  text: '第一行',
  language: 'zh-Hans',
};

function model(
  overrides: Partial<Parameters<typeof createOverlayModel>[0]> = {},
) {
  return createOverlayModel({
    active: true,
    topActive: [top],
    bottomActive: [bottom],
    topLanguage: 'ja',
    bottomLanguage: 'zh-Hans',
    topMachineTranslated: false,
    bottomMachineTranslated: false,
    controlsVisible: false,
    ...overrides,
  });
}

describe('overlay render model', () => {
  it('keeps Japanese above Simplified Chinese with dynamic language metadata', () => {
    const result = model({
      topActive: [top, { ...top, text: '第二行目' }],
    });

    expect(result.visible).toBe(true);
    expect(result.lines).toEqual([
      {
        id: 'top',
        lang: 'ja',
        dir: 'ltr',
        text: '第一行目\n第二行目',
        sizePercent: 100,
        machineTranslated: false,
      },
      {
        id: 'bottom',
        lang: 'zh-Hans',
        dir: 'ltr',
        text: '第一行',
        sizePercent: 90,
        machineTranslated: false,
      },
    ]);
  });

  it('uses the frozen bottom, raised-controls, and top offsets', () => {
    expect(model().placement).toEqual({ edge: 'bottom', offset: '8.5%' });
    expect(model({ controlsVisible: true }).placement).toEqual({
      edge: 'bottom',
      offset: '18%',
    });
    expect(
      model({ bottomActive: [{ ...bottom, position: 'top' }] }).placement,
    ).toEqual({ edge: 'top', offset: '8%' });
  });

  it('exposes an inline MT marker only for the generated line', () => {
    const result = model({ bottomMachineTranslated: true });

    expect(result.lines[0].machineTranslated).toBe(false);
    expect(result.lines[1].machineTranslated).toBe(true);
  });

  it('hides when disabled or when neither side has an active cue', () => {
    expect(model({ active: false }).visible).toBe(false);
    expect(model({ topActive: [], bottomActive: [] }).visible).toBe(false);
  });

  it('isolates RTL and LTR directions per line', () => {
    const result = model({
      topLanguage: 'ar',
      bottomLanguage: 'de',
    });

    expect(result.lines.map(({ dir }) => dir)).toEqual(['rtl', 'ltr']);
  });
});
