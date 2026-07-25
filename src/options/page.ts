import {
  DEFAULT_TRANSLATION_CONFIG,
  validateTranslationConfig,
  type TranslationConfig,
  type TranslationProvider,
} from '../mt/config';
import { requestEndpointPermission } from '../mt/permissions';
import {
  loadTranslationConfig,
  saveTranslationConfig,
} from './settings';

const form = document.querySelector<HTMLFormElement>('form')!;
const provider = document.querySelector<HTMLSelectElement>('#provider')!;
const baseUrl = document.querySelector<HTMLInputElement>('#base-url')!;
const apiKey = document.querySelector<HTMLInputElement>('#api-key')!;
const model = document.querySelector<HTMLInputElement>('#model')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const testButton = document.querySelector<HTMLButtonElement>('#test')!;

void loadTranslationConfig(chrome.storage.local).then(renderConfig);
provider.addEventListener('change', () => applyProviderDefaults(provider.value as TranslationProvider));

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveCurrent();
});

testButton.addEventListener('click', () => {
  void (async () => {
    const config = readConfig();
    const validation = validateTranslationConfig(config);
    if (!validation.ok) return show(false, validation.error);
    if (!(await requestEndpointPermission(chrome.permissions, validation.config))) {
      return show(false, '未授權此翻譯端點');
    }
    show(undefined, '測試中…');
    const result = await chrome.runtime.sendMessage({
      channel: 'duetsub-mt',
      version: 1,
      type: 'test-connection',
      config: validation.config,
    }) as { ok: boolean; message: string };
    show(result.ok, result.message);
  })();
});

async function saveCurrent(): Promise<void> {
  const validation = validateTranslationConfig(readConfig());
  if (!validation.ok) return show(false, validation.error);
  if (!(await requestEndpointPermission(chrome.permissions, validation.config))) {
    return show(false, '未授權此翻譯端點');
  }
  await saveTranslationConfig(chrome.storage.local, validation.config);
  renderConfig(validation.config);
  show(true, '設定已儲存；API key 保持遮蔽');
}

function readConfig(): TranslationConfig {
  return {
    provider: provider.value as TranslationProvider,
    baseUrl: baseUrl.value,
    apiKey: apiKey.value,
    model: model.value,
  };
}

function renderConfig(config: TranslationConfig): void {
  provider.value = config.provider;
  baseUrl.value = config.baseUrl;
  apiKey.value = config.apiKey;
  model.value = config.model;
  if (config.provider === 'deepseek') {
    model.setAttribute('list', 'deepseek-models');
  } else {
    model.removeAttribute('list');
  }
  baseUrl.closest<HTMLElement>('.field')!.hidden = config.provider === 'deepseek';
}

function applyProviderDefaults(value: TranslationProvider): void {
  if (value === 'deepseek') {
    renderConfig({ ...DEFAULT_TRANSLATION_CONFIG, apiKey: apiKey.value });
  } else {
    baseUrl.closest<HTMLElement>('.field')!.hidden = false;
    if (value === 'local' && baseUrl.value.includes('deepseek.com')) {
      baseUrl.value = 'http://localhost:11434/v1';
      model.value = '';
    }
  }
}

function show(ok: boolean | undefined, message: string): void {
  status.value = message;
  status.dataset.state = ok === undefined ? 'pending' : ok ? 'success' : 'error';
}
