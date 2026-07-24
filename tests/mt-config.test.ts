import { describe, expect, it } from 'vitest';

import {
  chatCompletionsUrl,
  configPermissionOrigin,
  DEFAULT_TRANSLATION_CONFIG,
  validateTranslationConfig,
} from '../src/mt/config';

describe('translation config', () => {
  it('uses the current DeepSeek OpenAI-compatible endpoint and V4 Flash default', () => {
    expect(DEFAULT_TRANSLATION_CONFIG).toEqual({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-v4-flash',
    });
    expect(chatCompletionsUrl(DEFAULT_TRANSLATION_CONFIG)).toBe(
      'https://api.deepseek.com/chat/completions',
    );
  });

  it('accepts cloud HTTPS and explicit loopback HTTP endpoints', () => {
    expect(
      validateTranslationConfig({
        provider: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'secret',
        model: 'model-a',
      }).ok,
    ).toBe(true);
    expect(
      validateTranslationConfig({
        provider: 'local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        apiKey: '',
        model: 'qwen',
      }).ok,
    ).toBe(true);
  });

  it('rejects insecure non-loopback, credentials in URLs, and missing cloud keys', () => {
    for (const config of [
      {
        provider: 'openai-compatible' as const,
        baseUrl: 'http://api.example.com/v1',
        apiKey: 'secret',
        model: 'm',
      },
      {
        provider: 'local' as const,
        baseUrl: 'http://user:pass@localhost:11434/v1',
        apiKey: '',
        model: 'm',
      },
      {
        provider: 'deepseek' as const,
        baseUrl: 'https://api.deepseek.com',
        apiKey: '',
        model: 'deepseek-v4-flash',
      },
    ]) {
      expect(validateTranslationConfig(config).ok).toBe(false);
    }
  });

  it('derives only the exact user-configured origin permission', () => {
    expect(
      configPermissionOrigin({
        provider: 'local',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        model: 'qwen',
      }),
    ).toBe('http://localhost/*');
  });
});
