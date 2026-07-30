import {
  translationProviderDefault,
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
const baseUrlHelp = document.querySelector<HTMLElement>('#base-url-help')!;
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
  const modelList = modelListFor(config.provider);
  if (modelList === undefined) {
    model.removeAttribute('list');
  } else {
    model.setAttribute('list', modelList);
  }
  baseUrl.closest<HTMLElement>('.field')!.hidden =
    config.provider === 'deepseek' || config.provider === 'doubao';
  baseUrlHelp.hidden =
    config.provider !== 'qwen-cn' && config.provider !== 'qwen-sg';
}

function applyProviderDefaults(value: TranslationProvider): void {
  const preset = translationProviderDefault(value);
  if (preset !== undefined) {
    renderConfig(preset);
    return;
  }
  renderConfig({
    provider: value,
    baseUrl: value === 'local' ? 'http://localhost:11434/v1' : '',
    apiKey: '',
    model: '',
  });
}

function modelListFor(provider: TranslationProvider): string | undefined {
  switch (provider) {
    case 'deepseek':
      return 'deepseek-models';
    case 'qwen-cn':
    case 'qwen-sg':
      return 'qwen-models';
    case 'doubao':
      return 'doubao-models';
    default:
      return undefined;
  }
}

function show(ok: boolean | undefined, message: string): void {
  status.value = message;
  status.dataset.state = ok === undefined ? 'pending' : ok ? 'success' : 'error';
}
