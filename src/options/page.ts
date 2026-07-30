import {
  QWEN_WORKSPACE_ID_PLACEHOLDER,
  qwenBaseUrl,
  qwenWorkspaceId,
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
import {
  loadLanguagePairPreference,
  resetLanguagePairPreference,
  saveLanguagePairPreference,
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

const uiLanguageSelect = document.querySelector<HTMLSelectElement>(
  '#ui-language',
)!;
const form = document.querySelector<HTMLFormElement>('#translation-form')!;
const languagePairForm = document.querySelector<HTMLFormElement>(
  '#official-language-pair-form',
)!;
const provider = document.querySelector<HTMLSelectElement>('#provider')!;
const baseUrl = document.querySelector<HTMLInputElement>('#base-url')!;
const baseUrlField = baseUrl.closest<HTMLElement>('.field')!;
const workspaceId = document.querySelector<HTMLInputElement>('#workspace-id')!;
const workspaceIdField = document.querySelector<HTMLElement>(
  '#workspace-id-field',
)!;
const webSearch = document.querySelector<HTMLInputElement>('#web-search')!;
const webSearchField = document.querySelector<HTMLElement>(
  '#web-search-field',
)!;
const apiKey = document.querySelector<HTMLInputElement>('#api-key')!;
const model = document.querySelector<HTMLInputElement>('#model')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const testButton = document.querySelector<HTMLButtonElement>('#test')!;
const languagePair = document.querySelector<HTMLOutputElement>(
  '#official-language-pair',
)!;
const topLanguage = document.querySelector<HTMLSelectElement>(
  '#official-language-top',
)!;
const topLanguageCustom = document.querySelector<HTMLInputElement>(
  '#official-language-top-custom',
)!;
const bottomLanguage = document.querySelector<HTMLSelectElement>(
  '#official-language-bottom',
)!;
const bottomLanguageCustom = document.querySelector<HTMLInputElement>(
  '#official-language-bottom-custom',
)!;
const resetLanguagePair = document.querySelector<HTMLButtonElement>(
  '#reset-official-language-pair',
)!;

const CUSTOM_LANGUAGE_VALUE = '__custom__';
const COMMON_LANGUAGE_TAGS = [
  'en',
  'zh-Hant',
  'zh-Hans',
  'ja',
  'ko',
  'es-ES',
  'es-419',
  'fr',
  'de',
  'it',
  'pt-BR',
  'pt-PT',
  'ar',
  'hi',
  'id',
  'ms',
  'th',
  'vi',
  'tr',
  'pl',
  'nl',
  'sv',
  'da',
  'nb',
  'fi',
  'cs',
  'el',
  'he',
  'hu',
  'ro',
  'ca',
  'ta',
  'te',
] as const;

let uiLanguage = resolveUiLanguage(undefined, browserLanguages());
let loadedLanguagePair: LoadedLanguagePairPreference | undefined;
let renderStatusMessage = (language: UiLanguage) =>
  translate(language, 'options.notTested');
let statusState: boolean | undefined;

populateLanguageSelect(topLanguage);
populateLanguageSelect(bottomLanguage);
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
languagePairForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveCurrentLanguagePair();
});
topLanguage.addEventListener('change', () => {
  updateCustomLanguageField(topLanguage, topLanguageCustom);
});
bottomLanguage.addEventListener('change', () => {
  updateCustomLanguageField(bottomLanguage, bottomLanguageCustom);
});
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

async function saveCurrentLanguagePair(): Promise<void> {
  const saved = await saveLanguagePairPreference(chrome.storage.local, {
    version: 1,
    top: selectedLanguage(topLanguage, topLanguageCustom),
    bottom: selectedLanguage(bottomLanguage, bottomLanguageCustom),
  });
  if (!saved) {
    languagePair.dataset.state = 'error';
    languagePair.value = translate(uiLanguage, 'options.invalidPair');
    return;
  }
  loadedLanguagePair = await loadLanguagePairPreference(chrome.storage.local);
  renderLanguagePair();
  languagePair.dataset.state = 'success';
  showMessage(true, 'options.pairSaved');
}

function readConfig(): TranslationConfig {
  const selectedProvider = provider.value as TranslationProvider;
  return {
    provider: selectedProvider,
    baseUrl: isQwenProvider(selectedProvider)
      ? qwenBaseUrl(
        selectedProvider,
        workspaceId.value.trim() || QWEN_WORKSPACE_ID_PLACEHOLDER,
      )
      : baseUrl.value,
    apiKey: apiKey.value,
    model: model.value,
    webSearchEnabled: isQwenProvider(selectedProvider) && webSearch.checked,
  };
}

function renderConfig(config: TranslationConfig): void {
  provider.value = config.provider;
  baseUrl.value = config.baseUrl;
  const qwen = isQwenProvider(config.provider);
  const configuredWorkspaceId = qwenWorkspaceId(config);
  if (configuredWorkspaceId !== '' || !qwen) {
    workspaceId.value = configuredWorkspaceId;
  }
  apiKey.value = config.apiKey;
  model.value = config.model;
  const modelList = modelListFor(config.provider);
  if (modelList === undefined) {
    model.removeAttribute('list');
  } else {
    model.setAttribute('list', modelList);
  }
  baseUrlField.hidden =
    config.provider === 'deepseek' || config.provider === 'doubao' || qwen;
  baseUrl.required = !baseUrlField.hidden;
  workspaceIdField.hidden = !qwen;
  workspaceId.required = qwen;
  webSearchField.hidden = !qwen;
  webSearch.checked = qwen && config.webSearchEnabled;
}

function renderLanguagePair(): void {
  if (loadedLanguagePair === undefined) return;
  const { preference } = loadedLanguagePair;
  renderLanguageSelect(
    topLanguage,
    topLanguageCustom,
    preference.top,
  );
  renderLanguageSelect(
    bottomLanguage,
    bottomLanguageCustom,
    preference.bottom,
  );
  languagePair.value = translate(uiLanguage, 'options.pair', {
    topName: languageDisplayName(uiLanguage, preference.top),
    topCode: preference.top,
    bottomName: languageDisplayName(uiLanguage, preference.bottom),
    bottomCode: preference.bottom,
    suffix: loadedLanguagePair.stored
      ? ''
      : translate(uiLanguage, 'options.memoryDefault'),
  });
  delete languagePair.dataset.state;
}

function applyProviderDefaults(value: TranslationProvider): void {
  const preset = translationProviderDefault(value);
  if (preset !== undefined) {
    renderConfig(
      isQwenProvider(value) && workspaceId.value.trim() !== ''
        ? {
          ...preset,
          baseUrl: qwenBaseUrl(value, workspaceId.value),
          webSearchEnabled: webSearch.checked,
        }
        : preset,
    );
    return;
  }
  renderConfig({
    provider: value,
    baseUrl: value === 'local' ? 'http://localhost:11434/v1' : '',
    apiKey: '',
    model: '',
    webSearchEnabled: false,
  });
}

function isQwenProvider(
  value: TranslationProvider,
): value is Extract<TranslationProvider, 'qwen-cn' | 'qwen-sg'> {
  return value === 'qwen-cn' || value === 'qwen-sg';
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
  for (
    const element of document.querySelectorAll<HTMLInputElement>(
      '[data-i18n-placeholder]',
    )
  ) {
    element.placeholder = translate(
      uiLanguage,
      element.dataset.i18nPlaceholder as UiMessageKey,
    );
  }
  updateLanguageSelectLabels(topLanguage);
  updateLanguageSelectLabels(bottomLanguage);
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

function populateLanguageSelect(select: HTMLSelectElement): void {
  for (const language of COMMON_LANGUAGE_TAGS) {
    const option = document.createElement('option');
    option.value = language;
    select.append(option);
  }
  const custom = document.createElement('option');
  custom.value = CUSTOM_LANGUAGE_VALUE;
  select.append(custom);
  updateLanguageSelectLabels(select);
}

function updateLanguageSelectLabels(select: HTMLSelectElement): void {
  for (const option of select.options) {
    option.textContent = option.value === CUSTOM_LANGUAGE_VALUE
      ? translate(uiLanguage, 'options.otherLanguage')
      : `${languageDisplayName(uiLanguage, option.value)} (${option.value})`;
  }
}

function updateCustomLanguageField(
  select: HTMLSelectElement,
  custom: HTMLInputElement,
): void {
  custom.hidden = select.value !== CUSTOM_LANGUAGE_VALUE;
  custom.required = !custom.hidden;
  if (!custom.hidden) custom.focus();
}

function selectedLanguage(
  select: HTMLSelectElement,
  custom: HTMLInputElement,
): string {
  return select.value === CUSTOM_LANGUAGE_VALUE
    ? custom.value.trim()
    : select.value;
}

function renderLanguageSelect(
  select: HTMLSelectElement,
  custom: HTMLInputElement,
  language: string,
): void {
  if (COMMON_LANGUAGE_TAGS.some((candidate) => candidate === language)) {
    select.value = language;
    custom.value = '';
  } else {
    select.value = CUSTOM_LANGUAGE_VALUE;
    custom.value = language;
  }
  updateCustomLanguageField(select, custom);
}
