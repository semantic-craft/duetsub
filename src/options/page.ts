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
import {
  loadLanguagePairPreference,
  resetLanguagePairPreference,
  type LoadedLanguagePairPreference,
} from '../core/official-pair-preference';
import {
  isUiLanguage,
  languageDisplayName,
  loadUiLanguage,
  resolveUiLanguage,
  saveUiLanguage,
  translate,
  translateRuntimeMessage,
  type UiLanguage,
  type UiMessageKey,
} from '../i18n';

const form = document.querySelector<HTMLFormElement>('form')!;
const uiLanguageSelect = document.querySelector<HTMLSelectElement>(
  '#ui-language',
)!;
const provider = document.querySelector<HTMLSelectElement>('#provider')!;
const baseUrl = document.querySelector<HTMLInputElement>('#base-url')!;
const apiKey = document.querySelector<HTMLInputElement>('#api-key')!;
const model = document.querySelector<HTMLInputElement>('#model')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const testButton = document.querySelector<HTMLButtonElement>('#test')!;
const languagePair = document.querySelector<HTMLOutputElement>(
  '#official-language-pair',
)!;
const resetLanguagePair = document.querySelector<HTMLButtonElement>(
  '#reset-official-language-pair',
)!;

let uiLanguage = resolveUiLanguage(undefined, browserLanguages());
let loadedLanguagePair: LoadedLanguagePairPreference | undefined;
let renderStatusMessage = (language: UiLanguage) =>
  translate(language, 'options.notTested');
let statusState: boolean | undefined;

void initialize();

uiLanguageSelect.addEventListener('change', () => {
  if (!isUiLanguage(uiLanguageSelect.value)) return;
  uiLanguage = uiLanguageSelect.value;
  applyUiLanguage();
  void saveUiLanguage(chrome.storage.local, uiLanguage).then(() => {
    showMessage(true, 'options.languageSaved');
  });
});
provider.addEventListener('change', () =>
  applyProviderDefaults(provider.value as TranslationProvider)
);
resetLanguagePair.addEventListener('click', () => {
  void (async () => {
    await resetLanguagePairPreference(chrome.storage.local);
    loadedLanguagePair = await loadLanguagePairPreference(chrome.storage.local);
    renderLanguagePair();
    showMessage(true, 'options.resetSuccess');
  })();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveCurrent();
});

testButton.addEventListener('click', () => {
  void (async () => {
    const config = readConfig();
    const validation = validateTranslationConfig(config);
    if (!validation.ok) return showRuntimeMessage(false, validation.error);
    if (!(await requestEndpointPermission(chrome.permissions, validation.config))) {
      return showMessage(false, 'options.permissionDenied');
    }
    showMessage(undefined, 'options.testing');
    const result = (await chrome.runtime.sendMessage({
      channel: 'duetsub-mt',
      version: 1,
      type: 'test-connection',
      config: validation.config,
    })) as { ok: boolean; message: string };
    showRuntimeMessage(result.ok, result.message);
  })();
});

async function initialize(): Promise<void> {
  const [config, pair, language] = await Promise.all([
    loadTranslationConfig(chrome.storage.local),
    loadLanguagePairPreference(chrome.storage.local),
    loadUiLanguage(chrome.storage.local, browserLanguages()),
  ]);
  uiLanguage = language;
  loadedLanguagePair = pair;
  uiLanguageSelect.value = language;
  applyUiLanguage();
  renderConfig(config);
  renderLanguagePair();
}

async function saveCurrent(): Promise<void> {
  const validation = validateTranslationConfig(readConfig());
  if (!validation.ok) return showRuntimeMessage(false, validation.error);
  if (!(await requestEndpointPermission(chrome.permissions, validation.config))) {
    return showMessage(false, 'options.permissionDenied');
  }
  await saveTranslationConfig(chrome.storage.local, validation.config);
  renderConfig(validation.config);
  showMessage(true, 'options.saved');
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

function renderLanguagePair(): void {
  if (loadedLanguagePair === undefined) return;
  const { preference } = loadedLanguagePair;
  languagePair.value = translate(uiLanguage, 'options.pair', {
    topName: languageDisplayName(uiLanguage, preference.top),
    topCode: preference.top,
    bottomName: languageDisplayName(uiLanguage, preference.bottom),
    bottomCode: preference.bottom,
    suffix: loadedLanguagePair.stored
      ? ''
      : translate(uiLanguage, 'options.memoryDefault'),
  });
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

function applyUiLanguage(): void {
  document.documentElement.lang = uiLanguage;
  document.title = translate(uiLanguage, 'options.title');
  for (
    const element of document.querySelectorAll<HTMLElement>('[data-i18n]')
  ) {
    element.textContent = translate(
      uiLanguage,
      element.dataset.i18n as UiMessageKey,
    );
  }
  renderLanguagePair();
  renderStatus();
}

function showMessage(
  ok: boolean | undefined,
  key: UiMessageKey,
  values: Readonly<Record<string, string | number>> = {},
): void {
  statusState = ok;
  renderStatusMessage = (language) => translate(language, key, values);
  renderStatus();
}

function showRuntimeMessage(
  ok: boolean | undefined,
  message: string,
): void {
  statusState = ok;
  renderStatusMessage = (language) =>
    translateRuntimeMessage(language, message);
  renderStatus();
}

function renderStatus(): void {
  status.value = renderStatusMessage(uiLanguage);
  status.dataset.state = statusState === undefined
    ? 'pending'
    : statusState
    ? 'success'
    : 'error';
}

function browserLanguages(): readonly string[] {
  return [...navigator.languages, navigator.language];
}
