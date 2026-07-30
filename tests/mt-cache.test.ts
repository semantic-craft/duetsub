import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

import { IndexedDbTranslationCache, translationCacheKey } from '../src/mt/cache';

describe('translation cache', () => {
  it('has stable keys and isolates provider, endpoint, model, and target language', async () => {
    const base = {
      contentId: 'episode-1',
      trackId: 'en',
      sourceText: '  Hello   world ',
      sourceStartMs: 1_000,
      sourceEndMs: 2_500,
      targetLanguage: 'zh-Hant',
      promptProfile: 'film-tv',
      promptVersion: 'subtitle-v10-scope-hard-check',
      provider: 'deepseek',
      endpoint: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      webSearchEnabled: false,
    };
    const key = await translationCacheKey(base);
    expect(key).toBe(await translationCacheKey({ ...base }));
    for (const changed of [
      { model: 'other' },
      { endpoint: 'https://other.example/v1' },
      { provider: 'openai-compatible' },
      { targetLanguage: 'en' },
      { promptProfile: 'youtube' },
      { sourceEndMs: 3_000 },
      { webSearchEnabled: true },
    ]) {
      expect(await translationCacheKey({ ...base, ...changed })).not.toBe(key);
    }
  });

  it('reports hit/miss and evicts the least recently used successful value', async () => {
    const cache = new IndexedDbTranslationCache(`test-${crypto.randomUUID()}`, 2);
    expect(await cache.get('a')).toEqual({ hit: false });
    await cache.put('a', '甲');
    await cache.put('b', '乙');
    expect(await cache.get('a')).toEqual({ hit: true, value: '甲' });
    await cache.put('c', '丙');
    expect(await cache.get('a')).toEqual({ hit: true, value: '甲' });
    expect(await cache.get('b')).toEqual({ hit: false });
    expect(await cache.get('c')).toEqual({ hit: true, value: '丙' });
  });
});
