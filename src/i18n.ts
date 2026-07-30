export const UI_LANGUAGE_STORAGE_KEY = 'duetsub:ui-language';

export const UI_LANGUAGES = ['zh-Hans', 'zh-Hant', 'en'] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number];

export interface UiLanguageStoragePort {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const ZH_HANT_MESSAGES = {
  'options.title': 'DuetSub 設定',
  'options.heading': 'DuetSub 設定',
  'options.intro': '字幕只會傳送到你在此設定並授權的端點。',
  'options.interfaceLanguage': '介面語言',
  'options.officialHeading': '官方字幕語言',
  'options.loadingPreference': '正在讀取本機偏好…',
  'options.officialHelp':
    '實際可用語言只由播放中的當前節目決定，請在播放器內長按或右鍵 DuetSub 按鈕選擇。',
  'options.resetPair': '恢復英文在上、繁體中文在下',
  'options.provider': '供應商',
  'options.openAiCompatible': 'OpenAI 兼容',
  'options.localOpenAiCompatible': '本地 OpenAI 兼容',
  'options.baseUrl': 'Base URL',
  'options.apiKey': 'API key',
  'options.model': '模型',
  'options.fallbackTarget':
    '翻譯 fallback 目標：繁體中文 / 英文（與手動官方語言對分離）',
  'options.save': '儲存',
  'options.test': '測試連線',
  'options.notTested': '尚未測試',
  'options.resetSuccess': '官方語言偏好已恢復預設值',
  'options.permissionDenied': '未授權此翻譯端點',
  'options.testing': '測試中…',
  'options.saved': '設定已儲存；API key 保持遮蔽',
  'options.languageSaved': '介面語言已更新',
  'options.pair': '{topName}（{topCode}）在上，{bottomName}（{bottomCode}）在下{suffix}',
  'options.memoryDefault': '（記憶體預設）',
  'validation.modelRequired': '請填寫模型名稱',
  'validation.baseUrlInvalid': 'Base URL 無效',
  'validation.credentialsInUrl': 'Base URL 不得包含憑據',
  'validation.queryInUrl': 'Base URL 不得包含查詢或片段',
  'validation.cloudRequiresHttps':
    '雲端服務必須使用 HTTPS；HTTP 僅限本機 loopback',
  'validation.localRequiresLoopback':
    '本地服務必須使用 localhost 或 loopback 位址',
  'validation.cloudRequiresKey': '雲端服務需要 API key',
  'connection.success': '連線成功',
  'connection.failedHttp': '連線失敗（HTTP {status}）',
  'connection.failedNetwork': '連線失敗（網路或 CORS）',
  'toggle.aria': '切換 DuetSub 雙字幕',
  'toggle.top': '上方字幕',
  'toggle.bottom': '下方字幕',
  'toggle.swap': '交換上下',
  'toggle.retranslate': '重新翻譯（ticket 04）',
  'toggle.openSettings': '打開設定',
  'toggle.noOfficialSubtitles': '尚未讀取官方字幕',
  'toggle.preferenceUnavailable': '目前偏好在本節目不可用',
  'pair.label': '官方{top} + 官方{bottom}',
  'status.readyDefault': '官方英文 + 官方繁中 · 100%',
  'status.disabledFakeNotLoaded': '關閉 · 尚未載入假軌',
  'status.disabledOfficialNotLoaded': '關閉 · 尚未載入官方軌',
  'status.noRetranslate': '目前使用官方雙軌，無需重新翻譯',
  'status.retranslating': '正在跳過快取重新翻譯…',
  'status.waitingContent': '開啟 · 等待可驗證的 {site} 內容身份',
  'status.contentChanged': '開啟 · {site} 內容已切換',
  'status.disabledLoadFake': '關閉 · 點擊即可載入假軌',
  'status.disabledLoadOfficial': '關閉 · 點擊即可載入官方軌',
  'status.enumerating': '開啟 · 枚舉 {site} 字幕軌…',
  'status.readingOfficial': '正在讀取當前節目的官方字幕…',
  'status.waitingFakeMain': '開啟 · 等待 MAIN 假軌',
  'status.switchingPair': '正在切換為 {pair}…',
  'status.savePairFailed': '無法在本機儲存官方語言偏好',
  'status.disabledSelectedPair': '關閉 · 已選擇 {pair}',
  'status.acquiringPair': '正在取得 {pair}…',
  'status.pairReady': '{pair} · 100%',
  'status.selectedPairFailed': '無法可靠取得並恢復所選官方字幕',
  'status.noEnglishChinese': '開啟 · 沒有可用的英文或中文來源',
  'status.acquiringOfficial': '開啟 · 正在取得官方字幕…',
  'status.maxOpenccReady': '官方英文主軌 + OpenCC 繁中對齊 · 100%',
  'status.maxOfficialReady': '官方英文主軌 + 官方繁中對齊 · 100%',
  'status.openccReady': '官方簡中 + OpenCC 繁中 · 100%',
  'status.englishChineseReady': '英文 + 繁中 · 100%',
  'status.officialMtReady': '官方字幕 + MT · 100%',
  'status.officialTranslating': '官方字幕已顯示 · 翻譯中…',
  'status.playbackReset': '開啟 · {site} 播放狀態已重設',
  'status.adPaused': '開啟 · 廣告期間暫停顯示',
  'status.waitingClock': '開啟 · 等待可靠的節目時鐘',
  'status.fakeTracksReceived': '開啟 · 已收到 {count} 條假軌',
  'status.fakeDataReady': '假資料：{pair} · 100%',
  'status.waitingFakePair': '開啟 · 等待完整的 {pair} 假軌',
  'status.seekingPaused': '開啟 · 拖動中暫停顯示',
  'status.notAcquired': '開啟 · 尚未取得雙軌',
  'status.videoClockReplaced': '開啟 · {site} video 時鐘已替換',
  'status.configureTranslation':
    '官方字幕照常顯示 · 請到設定頁配置翻譯服務',
  'status.authorizeTranslation':
    '官方字幕照常顯示 · 請到設定頁授權翻譯端點',
  'status.mtTranslating': '官方字幕 + MT · 翻譯中…',
  'status.partialTranslationFailed': '官方字幕照常顯示 · 部分翻譯失敗',
  'status.youtubeEnableCaptions':
    '開啟 · 請先手動開啟一次 YouTube 字幕，再重試 DuetSub',
  'status.acquisitionFailed': '開啟 · 無法可靠取得並恢復雙軌',
  'status.noOfficialCaptions': '當前節目沒有可驗證的官方字幕',
  'status.available': '可選：{labels}',
  'status.sameLanguage': '上下字幕不能選擇相同語言',
  'status.topMissing': '當前節目沒有官方{language}字幕',
  'status.bottomMissing': '當前節目沒有官方{language}字幕',
  'status.bothMissing': '當前節目沒有{pair}',
  'status.ambiguousLanguage': '當前節目的官方字幕語言無法可靠判定',
  'source.official': '官方{language}',
  'source.asr': 'ASR {language}',
  'source.platformMt': '平台 MT {language}',
  'language.english': '英文',
  'language.traditionalChinese': '繁中',
} as const;

export type UiMessageKey = keyof typeof ZH_HANT_MESSAGES;

const ZH_HANS_MESSAGES: Record<UiMessageKey, string> = {
  'options.title': 'DuetSub 设置',
  'options.heading': 'DuetSub 设置',
  'options.intro': '字幕只会发送到你在此设置并授权的端点。',
  'options.interfaceLanguage': '界面语言',
  'options.officialHeading': '官方字幕语言',
  'options.loadingPreference': '正在读取本地偏好…',
  'options.officialHelp':
    '实际可用语言只由播放中的当前节目决定，请在播放器内长按或右键 DuetSub 按钮选择。',
  'options.resetPair': '恢复英文在上、繁体中文在下',
  'options.provider': '供应商',
  'options.openAiCompatible': 'OpenAI 兼容',
  'options.localOpenAiCompatible': '本地 OpenAI 兼容',
  'options.baseUrl': 'Base URL',
  'options.apiKey': 'API key',
  'options.model': '模型',
  'options.fallbackTarget':
    '翻译 fallback 目标：繁体中文 / 英文（与手动官方语言对分离）',
  'options.save': '保存',
  'options.test': '测试连接',
  'options.notTested': '尚未测试',
  'options.resetSuccess': '官方语言偏好已恢复默认值',
  'options.permissionDenied': '未授权此翻译端点',
  'options.testing': '测试中…',
  'options.saved': '设置已保存；API key 保持遮蔽',
  'options.languageSaved': '界面语言已更新',
  'options.pair': '{topName}（{topCode}）在上，{bottomName}（{bottomCode}）在下{suffix}',
  'options.memoryDefault': '（内置默认）',
  'validation.modelRequired': '请填写模型名称',
  'validation.baseUrlInvalid': 'Base URL 无效',
  'validation.credentialsInUrl': 'Base URL 不得包含凭据',
  'validation.queryInUrl': 'Base URL 不得包含查询或片段',
  'validation.cloudRequiresHttps':
    '云端服务必须使用 HTTPS；HTTP 仅限本地 loopback',
  'validation.localRequiresLoopback':
    '本地服务必须使用 localhost 或 loopback 地址',
  'validation.cloudRequiresKey': '云端服务需要 API key',
  'connection.success': '连接成功',
  'connection.failedHttp': '连接失败（HTTP {status}）',
  'connection.failedNetwork': '连接失败（网络或 CORS）',
  'toggle.aria': '切换 DuetSub 双字幕',
  'toggle.top': '上方字幕',
  'toggle.bottom': '下方字幕',
  'toggle.swap': '交换上下',
  'toggle.retranslate': '重新翻译（ticket 04）',
  'toggle.openSettings': '打开设置',
  'toggle.noOfficialSubtitles': '尚未读取官方字幕',
  'toggle.preferenceUnavailable': '当前偏好在本节目不可用',
  'pair.label': '官方{top} + 官方{bottom}',
  'status.readyDefault': '官方英文 + 官方繁中 · 100%',
  'status.disabledFakeNotLoaded': '关闭 · 尚未加载假轨',
  'status.disabledOfficialNotLoaded': '关闭 · 尚未加载官方轨',
  'status.noRetranslate': '当前使用官方双轨，无需重新翻译',
  'status.retranslating': '正在跳过缓存重新翻译…',
  'status.waitingContent': '开启 · 等待可验证的 {site} 内容身份',
  'status.contentChanged': '开启 · {site} 内容已切换',
  'status.disabledLoadFake': '关闭 · 点击即可加载假轨',
  'status.disabledLoadOfficial': '关闭 · 点击即可加载官方轨',
  'status.enumerating': '开启 · 枚举 {site} 字幕轨…',
  'status.readingOfficial': '正在读取当前节目的官方字幕…',
  'status.waitingFakeMain': '开启 · 等待 MAIN 假轨',
  'status.switchingPair': '正在切换为 {pair}…',
  'status.savePairFailed': '无法在本地保存官方语言偏好',
  'status.disabledSelectedPair': '关闭 · 已选择 {pair}',
  'status.acquiringPair': '正在获取 {pair}…',
  'status.pairReady': '{pair} · 100%',
  'status.selectedPairFailed': '无法可靠获取并恢复所选官方字幕',
  'status.noEnglishChinese': '开启 · 没有可用的英文或中文来源',
  'status.acquiringOfficial': '开启 · 正在获取官方字幕…',
  'status.maxOpenccReady': '官方英文主轨 + OpenCC 繁中对齐 · 100%',
  'status.maxOfficialReady': '官方英文主轨 + 官方繁中对齐 · 100%',
  'status.openccReady': '官方简中 + OpenCC 繁中 · 100%',
  'status.englishChineseReady': '英文 + 繁中 · 100%',
  'status.officialMtReady': '官方字幕 + MT · 100%',
  'status.officialTranslating': '官方字幕已显示 · 翻译中…',
  'status.playbackReset': '开启 · {site} 播放状态已重置',
  'status.adPaused': '开启 · 广告期间暂停显示',
  'status.waitingClock': '开启 · 等待可靠的节目时钟',
  'status.fakeTracksReceived': '开启 · 已收到 {count} 条假轨',
  'status.fakeDataReady': '假数据：{pair} · 100%',
  'status.waitingFakePair': '开启 · 等待完整的 {pair} 假轨',
  'status.seekingPaused': '开启 · 拖动中暂停显示',
  'status.notAcquired': '开启 · 尚未获取双轨',
  'status.videoClockReplaced': '开启 · {site} video 时钟已替换',
  'status.configureTranslation':
    '官方字幕照常显示 · 请到设置页配置翻译服务',
  'status.authorizeTranslation':
    '官方字幕照常显示 · 请到设置页授权翻译端点',
  'status.mtTranslating': '官方字幕 + MT · 翻译中…',
  'status.partialTranslationFailed': '官方字幕照常显示 · 部分翻译失败',
  'status.youtubeEnableCaptions':
    '开启 · 请先手动开启一次 YouTube 字幕，再重试 DuetSub',
  'status.acquisitionFailed': '开启 · 无法可靠获取并恢复双轨',
  'status.noOfficialCaptions': '当前节目没有可验证的官方字幕',
  'status.available': '可选：{labels}',
  'status.sameLanguage': '上下字幕不能选择相同语言',
  'status.topMissing': '当前节目没有官方{language}字幕',
  'status.bottomMissing': '当前节目没有官方{language}字幕',
  'status.bothMissing': '当前节目没有{pair}',
  'status.ambiguousLanguage': '当前节目的官方字幕语言无法可靠判定',
  'source.official': '官方{language}',
  'source.asr': 'ASR {language}',
  'source.platformMt': '平台 MT {language}',
  'language.english': '英文',
  'language.traditionalChinese': '繁中',
};

const EN_MESSAGES: Record<UiMessageKey, string> = {
  'options.title': 'DuetSub Settings',
  'options.heading': 'DuetSub Settings',
  'options.intro':
    'Subtitles are sent only to the endpoint you configure and authorize here.',
  'options.interfaceLanguage': 'Interface language',
  'options.officialHeading': 'Official subtitle languages',
  'options.loadingPreference': 'Loading local preference…',
  'options.officialHelp':
    'Available languages depend on the current title. Long-press or right-click the DuetSub button in the player to choose.',
  'options.resetPair':
    'Restore English on top and Traditional Chinese on bottom',
  'options.provider': 'Provider',
  'options.openAiCompatible': 'OpenAI-compatible',
  'options.localOpenAiCompatible': 'Local OpenAI-compatible',
  'options.baseUrl': 'Base URL',
  'options.apiKey': 'API key',
  'options.model': 'Model',
  'options.fallbackTarget':
    'Translation fallback targets: Traditional Chinese / English (separate from the manually selected official pair)',
  'options.save': 'Save',
  'options.test': 'Test connection',
  'options.notTested': 'Not tested',
  'options.resetSuccess': 'Official language preference restored to default',
  'options.permissionDenied': 'This translation endpoint is not authorized',
  'options.testing': 'Testing…',
  'options.saved': 'Settings saved; the API key remains masked',
  'options.languageSaved': 'Interface language updated',
  'options.pair': '{topName} ({topCode}) on top, {bottomName} ({bottomCode}) on bottom{suffix}',
  'options.memoryDefault': ' (built-in default)',
  'validation.modelRequired': 'Enter a model name',
  'validation.baseUrlInvalid': 'Base URL is invalid',
  'validation.credentialsInUrl': 'Base URL must not contain credentials',
  'validation.queryInUrl': 'Base URL must not contain a query or fragment',
  'validation.cloudRequiresHttps':
    'Cloud services must use HTTPS; HTTP is limited to local loopback',
  'validation.localRequiresLoopback':
    'Local services must use localhost or a loopback address',
  'validation.cloudRequiresKey': 'Cloud services require an API key',
  'connection.success': 'Connection successful',
  'connection.failedHttp': 'Connection failed (HTTP {status})',
  'connection.failedNetwork': 'Connection failed (network or CORS)',
  'toggle.aria': 'Toggle DuetSub bilingual subtitles',
  'toggle.top': 'Top subtitle',
  'toggle.bottom': 'Bottom subtitle',
  'toggle.swap': 'Swap top and bottom',
  'toggle.retranslate': 'Retranslate (ticket 04)',
  'toggle.openSettings': 'Open settings',
  'toggle.noOfficialSubtitles': 'Official subtitles not loaded yet',
  'toggle.preferenceUnavailable':
    'The preferred pair is unavailable for this title',
  'pair.label': 'Official {top} + official {bottom}',
  'status.readyDefault':
    'Official English + official Traditional Chinese · 100%',
  'status.disabledFakeNotLoaded': 'Off · fake tracks not loaded',
  'status.disabledOfficialNotLoaded': 'Off · official tracks not loaded',
  'status.noRetranslate':
    'Using two official tracks; no translation is needed',
  'status.retranslating': 'Retranslating without cache…',
  'status.waitingContent': 'On · waiting for a verified {site} title',
  'status.contentChanged': 'On · {site} title changed',
  'status.disabledLoadFake': 'Off · click to load fake tracks',
  'status.disabledLoadOfficial': 'Off · click to load official tracks',
  'status.enumerating': 'On · finding {site} subtitle tracks…',
  'status.readingOfficial': 'Reading official subtitles for this title…',
  'status.waitingFakeMain': 'On · waiting for MAIN fake tracks',
  'status.switchingPair': 'Switching to {pair}…',
  'status.savePairFailed':
    'Could not save the official language preference locally',
  'status.disabledSelectedPair': 'Off · selected {pair}',
  'status.acquiringPair': 'Getting {pair}…',
  'status.pairReady': '{pair} · 100%',
  'status.selectedPairFailed':
    'Could not reliably acquire and restore the selected official subtitles',
  'status.noEnglishChinese':
    'On · no English or Chinese source is available',
  'status.acquiringOfficial': 'On · getting official subtitles…',
  'status.maxOpenccReady':
    'Official English primary + OpenCC Traditional Chinese alignment · 100%',
  'status.maxOfficialReady':
    'Official English primary + official Traditional Chinese alignment · 100%',
  'status.openccReady':
    'Official Simplified Chinese + OpenCC Traditional Chinese · 100%',
  'status.englishChineseReady': 'English + Traditional Chinese · 100%',
  'status.officialMtReady': 'Official subtitles + MT · 100%',
  'status.officialTranslating':
    'Official subtitles displayed · translating…',
  'status.playbackReset': 'On · {site} playback state reset',
  'status.adPaused': 'On · hidden during the ad',
  'status.waitingClock': 'On · waiting for a reliable program clock',
  'status.fakeTracksReceived': 'On · received {count} fake tracks',
  'status.fakeDataReady': 'Fake data: {pair} · 100%',
  'status.waitingFakePair': 'On · waiting for complete fake {pair} tracks',
  'status.seekingPaused': 'On · hidden while seeking',
  'status.notAcquired': 'On · two tracks not acquired yet',
  'status.videoClockReplaced': 'On · {site} video clock replaced',
  'status.configureTranslation':
    'Official subtitles remain visible · configure a translation service in settings',
  'status.authorizeTranslation':
    'Official subtitles remain visible · authorize the translation endpoint in settings',
  'status.mtTranslating': 'Official subtitles + MT · translating…',
  'status.partialTranslationFailed':
    'Official subtitles remain visible · some translations failed',
  'status.youtubeEnableCaptions':
    'On · enable YouTube captions once, then retry DuetSub',
  'status.acquisitionFailed':
    'On · could not reliably acquire and restore both tracks',
  'status.noOfficialCaptions':
    'No verifiable official subtitles for this title',
  'status.available': 'Available: {labels}',
  'status.sameLanguage':
    'Top and bottom subtitles cannot use the same language',
  'status.topMissing':
    'This title has no official {language} subtitle for the top line',
  'status.bottomMissing':
    'This title has no official {language} subtitle for the bottom line',
  'status.bothMissing': 'This title does not have {pair}',
  'status.ambiguousLanguage':
    'The official subtitle language for this title is ambiguous',
  'source.official': 'Official {language}',
  'source.asr': 'ASR {language}',
  'source.platformMt': 'Platform MT {language}',
  'language.english': 'English',
  'language.traditionalChinese': 'Traditional Chinese',
};

const MESSAGES: Record<UiLanguage, Record<UiMessageKey, string>> = {
  'zh-Hans': ZH_HANS_MESSAGES,
  'zh-Hant': ZH_HANT_MESSAGES,
  en: EN_MESSAGES,
};

const KNOWN_RUNTIME_MESSAGES: Readonly<Record<string, UiMessageKey>> = {
  '請填寫模型名稱': 'validation.modelRequired',
  'Base URL 無效': 'validation.baseUrlInvalid',
  'Base URL 不得包含憑據': 'validation.credentialsInUrl',
  'Base URL 不得包含查詢或片段': 'validation.queryInUrl',
  '雲端服務必須使用 HTTPS；HTTP 僅限本機 loopback':
    'validation.cloudRequiresHttps',
  '本地服務必須使用 localhost 或 loopback 位址':
    'validation.localRequiresLoopback',
  '雲端服務需要 API key': 'validation.cloudRequiresKey',
  '未授權此翻譯端點': 'options.permissionDenied',
  '連線成功': 'connection.success',
  '連線失敗（網路或 CORS）': 'connection.failedNetwork',
};

export function resolveUiLanguage(
  stored: unknown,
  browserLanguages: readonly string[] = [],
): UiLanguage {
  if (isUiLanguage(stored)) return stored;
  for (const language of browserLanguages) {
    const normalized = normalizeBrowserLanguage(language);
    if (normalized !== undefined) return normalized;
  }
  return 'en';
}

export async function loadUiLanguage(
  storage: UiLanguageStoragePort,
  browserLanguages: readonly string[] = [],
): Promise<UiLanguage> {
  const stored = await storage.get(UI_LANGUAGE_STORAGE_KEY);
  return resolveUiLanguage(
    stored[UI_LANGUAGE_STORAGE_KEY],
    browserLanguages,
  );
}

export async function saveUiLanguage(
  storage: UiLanguageStoragePort,
  language: UiLanguage,
): Promise<void> {
  await storage.set({ [UI_LANGUAGE_STORAGE_KEY]: language });
}

export function isUiLanguage(value: unknown): value is UiLanguage {
  return UI_LANGUAGES.some((language) => language === value);
}

export function translate(
  language: UiLanguage,
  key: UiMessageKey,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return MESSAGES[language][key].replace(
    /\{([a-zA-Z][a-zA-Z0-9]*)\}/gu,
    (placeholder, name: string) =>
      values[name] === undefined ? placeholder : String(values[name]),
  );
}

export function translateRuntimeMessage(
  language: UiLanguage,
  message: string,
): string {
  const known = KNOWN_RUNTIME_MESSAGES[message];
  if (known !== undefined) return translate(language, known);
  const http = /^連線失敗（HTTP (\d{3})）$/u.exec(message);
  return http === null
    ? message
    : translate(language, 'connection.failedHttp', { status: http[1] });
}

export function languageDisplayName(
  uiLanguage: UiLanguage,
  language: string,
): string {
  try {
    return new Intl.DisplayNames([uiLanguage], { type: 'language' }).of(
      language,
    ) ?? language;
  } catch {
    return language;
  }
}

function normalizeBrowserLanguage(language: string): UiLanguage | undefined {
  const normalized = language.toLowerCase();
  if (
    normalized === 'zh-hant' ||
    normalized.startsWith('zh-hant-') ||
    normalized === 'zh-tw' ||
    normalized.startsWith('zh-tw-') ||
    normalized === 'zh-hk' ||
    normalized.startsWith('zh-hk-') ||
    normalized === 'zh-mo' ||
    normalized.startsWith('zh-mo-')
  ) {
    return 'zh-Hant';
  }
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-Hans';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  return undefined;
}
