import { describe, expect, it } from 'vitest';

import type { Cue } from '../src/core/contracts';
import {
  MT_BATCH_SIZE,
  scheduleTranslationBatches,
} from '../src/mt/scheduling';

const cues: Cue[] = Array.from({ length: 19 }, (_, index) => ({
  start: index * 1_000,
  end: index * 1_000 + 900,
  text: `cue-${index}`,
  language: 'en',
}));

describe('translation batch scheduling', () => {
  it('prioritizes the batch around the playback head and uses a bounded size', () => {
    const batches = scheduleTranslationBatches(cues, 10_200);
    expect(MT_BATCH_SIZE).toBe(8);
    expect(batches[0]?.map((cue) => cue.text)).toContain('cue-10');
    expect(batches.every((batch) => batch.length <= MT_BATCH_SIZE)).toBe(true);
    expect(batches.flat()).toHaveLength(cues.length);
  });
});
