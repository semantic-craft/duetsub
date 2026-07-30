import { describe, expect, it, vi } from 'vitest';

import type { Cue } from '../src/core/contracts';
import {
  subtitleTranslationSystemPrompt,
  translateCueBatch,
} from '../src/mt/translator';

const source: Cue[] = [
  { start: 100, end: 900, text: 'Hello', language: 'en' },
  { start: 1_000, end: 1_800, text: 'World', language: 'en' },
];
const config = {
  provider: 'deepseek' as const,
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'test-only-token',
  model: 'deepseek-v4-flash',
};

describe('translation HTTP seam', () => {
  it('keeps cue timing and uses successful cached translations', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{
            message: {
              content:
                '{"translations":[{"id":0,"text":"你好"},{"id":1,"text":"世界"}]}',
            },
          }],
        }),
        { status: 200 },
      ),
    );
    const result = await translateCueBatch(
      {
        contentId: 'episode',
        trackId: 'en',
        promptProfile: 'film-tv',
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

    const request = JSON.parse(
      String(fetch.mock.calls[0]?.[1]?.body),
    ) as {
      thinking?: { type?: string };
      response_format?: { type?: string };
      max_tokens?: number;
      messages?: Array<{ role?: string; content?: string }>;
    };
    expect(request.thinking).toEqual({ type: 'disabled' });
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.max_tokens).toBe(4_096);
    expect(request.messages?.[0]?.role).toBe('system');
    expect(request.messages?.[0]?.content).toContain(
      'Traditional Chinese (zh-Hant)',
    );
    expect(request.messages?.[0]?.content).toContain(
      'film and television',
    );
    expect(request.messages?.[0]?.content).toContain(
      'duration_ms',
    );
    expect(request.messages?.[1]).toEqual({
      role: 'user',
      content:
        '{"cues":[{"id":0,"start_ms":100,"end_ms":900,"duration_ms":800,"max_reading_units":9,"text":"Hello"},{"id":1,"start_ms":1000,"end_ms":1800,"duration_ms":800,"max_reading_units":9,"text":"World"}]}',
    });
  });

  it('fails soft when a cloud key is absent', async () => {
    const result = await translateCueBatch(
      { contentId: 'episode', trackId: 'en', promptProfile: 'film-tv',
        targetLanguage: 'zh-Hant', cues: source,
        config: { ...config, apiKey: '' } },
      { fetch: vi.fn() },
    );
    expect(result).toEqual({ status: 'missing-key', cues: [] });
  });

  it.each([
    {
      provider: 'qwen-cn' as const,
      baseUrl:
        'https://ws-cn-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      model: 'qwen3.7-flash',
      expected: {
        reasoning: { effort: 'none' },
        store: false,
      },
    },
    {
      provider: 'qwen-sg' as const,
      baseUrl:
        'https://ws-sg-test.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
      model: 'qwen3.7-plus',
      expected: {
        reasoning: { effort: 'none' },
        store: false,
      },
    },
    {
      provider: 'doubao' as const,
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-seed-2-1-pro-260628',
      expected: {
        thinking: { type: 'disabled' },
        text: { format: { type: 'json_object' } },
        max_output_tokens: 4_096,
        store: false,
      },
    },
  ])('uses deterministic $provider request options', async ({
    provider,
    baseUrl,
    model,
    expected,
  }) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: 'reasoning',
              summary: [],
            },
            {
              type: 'message',
              content: [{
                type: 'output_text',
                text:
                  '{"translations":[{"id":0,"text":"你好"},{"id":1,"text":"世界"}]}',
              }],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await translateCueBatch(
      {
        contentId: 'episode',
        trackId: 'en',
        promptProfile: 'youtube',
        targetLanguage: 'zh-Hant',
        cues: source,
        config: {
          provider,
          baseUrl,
          apiKey: 'provider-test-token',
          model,
        },
      },
      { fetch },
    );

    expect(result.status).toBe('ok');
    expect(fetch).toHaveBeenCalledWith(
      `${baseUrl}/responses`,
      expect.any(Object),
    );
    const request = JSON.parse(
      String(fetch.mock.calls[0]?.[1]?.body),
    ) as {
      input?: Array<{ role?: string; content?: string }>;
      messages?: unknown;
    } & Record<string, unknown>;
    expect(request).toMatchObject(expected);
    expect(request.messages).toBeUndefined();
    expect(request.input?.[0]).toEqual({
      role: 'system',
      content: expect.stringContaining('YouTube'),
    });
    expect(request.input?.[1]).toEqual({
      role: 'user',
      content:
        '{"cues":[{"id":0,"start_ms":100,"end_ms":900,"duration_ms":800,"max_reading_units":11,"text":"Hello"},{"id":1,"start_ms":1000,"end_ms":1800,"duration_ms":800,"max_reading_units":11,"text":"World"}]}',
    });
  });

  it('uses separate film/TV and YouTube subtitle prompt contracts', () => {
    const film = subtitleTranslationSystemPrompt('film-tv', 'en');
    const youtube = subtitleTranslationSystemPrompt('youtube', 'en');

    expect(film).toContain('character voice');
    expect(film).toContain('humor');
    expect(youtube).toContain('tutorial steps');
    expect(youtube).toContain('software UI labels');
    expect(
      subtitleTranslationSystemPrompt('film-tv', 'zh-Hant'),
    ).toContain('calculated at 9');
    expect(
      subtitleTranslationSystemPrompt('youtube', 'zh-Hant'),
    ).toContain('calculated at 11');
    expect(film).not.toBe(youtube);
    for (const prompt of [film, youtube]) {
      expect(prompt).toContain('start_ms');
      expect(prompt).toContain('end_ms');
      expect(prompt).toContain('duration_ms');
      expect(prompt).toContain('max_reading_units');
      expect(prompt).toContain('Duration is a display budget');
      expect(prompt).toContain('at most two lines');
      expect(prompt).toContain('same cue ids');
    }
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
        promptProfile: 'film-tv',
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
        promptProfile: 'film-tv',
        targetLanguage: 'zh-Hant',
        cues: source,
        config,
      },
      { fetch, signal: controller.signal },
    );
    expect(aborted.status).toBe('aborted');
  });
});
