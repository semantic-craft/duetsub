import { describe, expect, it, vi } from 'vitest';

import { testTranslationConnection } from '../src/mt/connection';

const config = {
  provider: 'local' as const,
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'qwen',
  webSearchEnabled: false,
};

describe('options test connection', () => {
  it('reports a clear success and failure with a mocked endpoint', async () => {
    expect(
      await testTranslationConnection(
        config,
        vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 })),
      ),
    ).toEqual({ ok: true, message: '連線成功' });
    expect(
      await testTranslationConnection(
        config,
        vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })),
      ),
    ).toEqual({ ok: false, message: '連線失敗（HTTP 503）' });
  });
});
