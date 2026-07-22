import { describe, expect, it } from 'vitest';

import type { Cue } from '../src/core/contracts';
import { createOverlayModel } from '../src/core/overlay-model';

const english: Cue = {
  start: 0,
  end: 2_000,
  text: 'First line',
  language: 'en',
};
const chinese: Cue = {
  start: 0,
  end: 2_000,
  text: '第一行',
  language: 'zh-Hant',
};

function model(
  overrides: Partial<Parameters<typeof createOverlayModel>[0]> = {},
) {
  return createOverlayModel({
    active: true,
    enActive: [english],
    zhActive: [chinese],
    englishMachineTranslated: false,
    chineseMachineTranslated: false,
    controlsVisible: false,
    ...overrides,
  });
}

describe('overlay render model', () => {
  it('keeps English above Traditional Chinese and merges same-side cues', () => {
    const result = model({
      enActive: [english, { ...english, text: 'Second line' }],
    });

    expect(result.visible).toBe(true);
    expect(result.lines).toEqual([
      {
        id: 'english',
        lang: 'en',
        text: 'First line\nSecond line',
        sizePercent: 82,
        machineTranslated: false,
      },
      {
        id: 'chinese',
        lang: 'zh-Hant',
        text: '第一行',
        sizePercent: 100,
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
      model({ zhActive: [{ ...chinese, position: 'top' }] }).placement,
    ).toEqual({ edge: 'top', offset: '8%' });
  });

  it('exposes an inline MT marker only for the generated line', () => {
    const result = model({ chineseMachineTranslated: true });

    expect(result.lines[0].machineTranslated).toBe(false);
    expect(result.lines[1].machineTranslated).toBe(true);
  });

  it('hides when disabled or when neither side has an active cue', () => {
    expect(model({ active: false }).visible).toBe(false);
    expect(model({ enActive: [], zhActive: [] }).visible).toBe(false);
  });
});
