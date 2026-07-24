import { describe, expect, it, vi } from 'vitest';

import type { Cue } from '../src/core/contracts';
import { translateCueBatch } from '../src/mt/translator';

const source: Cue[] = [
  { start: 100, end: 900, text: 'Hello', language: 'en' },
  { start: 1_000, end: 1_800, text: 'World', language: 'en' },
];
const config = {
  provider: 'deepseek' as const,
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'test-only-token',
  model: 'deepseek-chat',
};

describe('translation HTTP seam', () => {
  it('keeps cue timing and uses successful cached translations', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '["你好","世界"]' } }],
        }),
        { status: 200 },
      ),
    );
    const result = await translateCueBatch(
      {
        contentId: 'episode',
        trackId: 'en',
        targetLanguage: 'zh-Hant',
        cues: source,
        config,
      },
      {
        fetch,
        cache: {
          get: vi.fn().mockResolvedValue({ hit: false }),
          put: vi.fn().mockResolvedValue(undefined),
        },
      },
    );
    expect(result.status).toBe('ok');
    expect(result.cues).toEqual([
      { ...source[0], text: '你好', language: 'zh-Hant' },
      { ...source[1], text: '世界', language: 'zh-Hant' },
    ]);
  });

  it('fails soft when a cloud key is absent', async () => {
    const result = await translateCueBatch(
      { contentId: 'episode', trackId: 'en', targetLanguage: 'zh-Hant', cues: source,
        config: { ...config, apiKey: '' } },
      { fetch: vi.fn() },
    );
    expect(result).toEqual({ status: 'missing-key', cues: [] });
  });

  it('bounds 429 retries and makes backoff abortable', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response('', { status: 429 }),
    );
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await translateCueBatch(
      {
        contentId: 'episode',
        trackId: 'en',
        targetLanguage: 'zh-Hant',
        cues: source,
        config,
      },
      { fetch, sleep },
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('failed');

    const controller = new AbortController();
    controller.abort();
    const aborted = await translateCueBatch(
      {
        contentId: 'episode',
        trackId: 'en',
        targetLanguage: 'zh-Hant',
        cues: source,
        config,
      },
      { fetch, signal: controller.signal },
    );
    expect(aborted.status).toBe('aborted');
  });
});
