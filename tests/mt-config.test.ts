import { describe, expect, it } from 'vitest';

import {
  chatCompletionsUrl,
  configPermissionOrigin,
  DEFAULT_TRANSLATION_CONFIG,
  DOUBAO_TRANSLATION_CONFIG,
  QWEN_CN_TRANSLATION_CONFIG,
  QWEN_SG_TRANSLATION_CONFIG,
  qwenBaseUrl,
  qwenWorkspaceId,
  translationProviderDefault,
  translationRequestUrl,
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

  it('provides current Qwen and Doubao presets', () => {
    expect(QWEN_CN_TRANSLATION_CONFIG).toEqual({
      provider: 'qwen-cn',
      baseUrl:
        'https://YOUR_WORKSPACE_ID.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      apiKey: '',
      model: 'qwen3.6-flash',
    });
    expect(translationRequestUrl(QWEN_CN_TRANSLATION_CONFIG)).toBe(
      'https://YOUR_WORKSPACE_ID.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/responses',
    );
    expect(QWEN_SG_TRANSLATION_CONFIG).toEqual({
      provider: 'qwen-sg',
      baseUrl:
        'https://YOUR_WORKSPACE_ID.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
      apiKey: '',
      model: 'qwen3.6-flash',
    });
    expect(translationRequestUrl(QWEN_SG_TRANSLATION_CONFIG)).toBe(
      'https://YOUR_WORKSPACE_ID.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/responses',
    );
    expect(DOUBAO_TRANSLATION_CONFIG).toEqual({
      provider: 'doubao',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: '',
      model: 'doubao-seed-2-1-pro-260628',
    });
    expect(translationRequestUrl(DOUBAO_TRANSLATION_CONFIG)).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/responses',
    );
    expect(translationProviderDefault('qwen-cn')).toBe(
      QWEN_CN_TRANSLATION_CONFIG,
    );
    expect(translationProviderDefault('qwen-sg')).toBe(
      QWEN_SG_TRANSLATION_CONFIG,
    );
    expect(translationProviderDefault('doubao')).toBe(
      DOUBAO_TRANSLATION_CONFIG,
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
        provider: 'qwen-cn',
        baseUrl:
          'https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
        apiKey: 'secret',
        model: 'qwen3.6-flash',
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

  it('derives recommended Qwen endpoints from the user workspace ID', () => {
    expect(qwenBaseUrl('qwen-cn', 'ws-test')).toBe(
      'https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    );
    expect(qwenBaseUrl('qwen-sg', 'ws-test')).toBe(
      'https://ws-test.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    );
    expect(qwenWorkspaceId({
      ...QWEN_CN_TRANSLATION_CONFIG,
      baseUrl: qwenBaseUrl('qwen-cn', 'ws-test'),
    })).toBe('ws-test');
    expect(qwenWorkspaceId(QWEN_CN_TRANSLATION_CONFIG)).toBe('');
  });

  it('requires replacing the Qwen workspace placeholder before use', () => {
    expect(validateTranslationConfig({
      ...QWEN_CN_TRANSLATION_CONFIG,
      apiKey: 'secret',
    })).toEqual({
      ok: false,
      error: '請填寫有效的百煉 Workspace ID',
    });
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
