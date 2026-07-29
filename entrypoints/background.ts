import { IndexedDbTranslationCache } from '../src/mt/cache';
import { createPrimeVideoWebRequestObserver } from '../src/background/primevideo-subtitles';
import {
  TRANSLATION_CONFIG_STORAGE_KEY,
  type TranslationConfig,
} from '../src/mt/config';
import { testTranslationConnection } from '../src/mt/connection';
import { convertCuesToTraditional } from '../src/mt/opencc';
import { hasEndpointPermission } from '../src/mt/permissions';
import { isMtRequest } from '../src/mt/protocol';
import { translateCueBatch } from '../src/mt/translator';

export default defineBackground(() => {
  const cache = new IndexedDbTranslationCache();
  const requests = new Map<string, AbortController>();
  const observePrimeVideoResponse = createPrimeVideoWebRequestObserver({
    fetch: (url) => fetch(url),
    sendMessage: (tabId, message) => chrome.tabs.sendMessage(tabId, message),
  });
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      void observePrimeVideoResponse(details);
    },
    { urls: ['https://*.amazon.pv-cdn.net/*'] },
  );

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName !== 'local' ||
      changes[TRANSLATION_CONFIG_STORAGE_KEY] === undefined
    ) return;
    for (const controller of requests.values()) controller.abort();
    requests.clear();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isMtRequest(message)) return;
    if (message.type === 'cancel') {
      requests.get(message.requestId)?.abort();
      requests.delete(message.requestId);
      sendResponse({ ok: true });
      return;
    }
    if (
      message.type !== 'translate' &&
      message.type !== 'test-connection' &&
      message.type !== 'opencc'
    ) {
      return;
    }
    const request = message;

    void (async () => {
      if (request.type === 'test-connection') {
        if (!(await hasEndpointPermission(chrome.permissions, request.config))) {
          sendResponse({ ok: false, message: '未授權此翻譯端點' });
          return;
        }
        sendResponse(await testTranslationConnection(request.config));
        return;
      }
      if (request.type === 'opencc') {
        sendResponse({ cues: convertCuesToTraditional(request.cues) });
        return;
      }
      const stored = await chrome.storage.local.get(
        TRANSLATION_CONFIG_STORAGE_KEY,
      );
      const config = stored[TRANSLATION_CONFIG_STORAGE_KEY] as
        | TranslationConfig
        | undefined;
      if (config === undefined) {
        sendResponse({
          status: 'missing-key',
          cues: [],
          generation: request.generation,
        });
        return;
      }
      if (!(await hasEndpointPermission(chrome.permissions, config))) {
        sendResponse({
          status: 'missing-permission',
          cues: [],
          generation: request.generation,
        });
        return;
      }
      const controller = new AbortController();
      requests.set(request.requestId, controller);
      const result = await translateCueBatch(
        {
          contentId: request.contentId,
          trackId: request.trackId,
          targetLanguage: request.targetLanguage,
          cues: request.cues,
          config,
          skipCache: request.skipCache,
        },
        { cache, signal: controller.signal },
      );
      requests.delete(request.requestId);
      sendResponse({
        ...result,
        cues: result.status === 'ok' && request.targetLanguage === 'zh-Hant'
          ? convertCuesToTraditional(result.cues)
          : result.cues,
        generation: request.generation,
      });
    })().catch(() => {
      sendResponse({
        status: 'failed',
        cues: [],
        generation: request.type === 'translate'
          ? request.generation
          : undefined,
      });
    });
    return true;
  });
});
