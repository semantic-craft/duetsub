import type { Cue, SiteAdapter, SiteId, TrackInfo } from '../core/contracts';
import {
  alignMaxChineseCuesToEnglish,
  selectMaxEnglishPrimaryTrack,
} from '../adapters/max-cue-alignment';
import {
  acceptPlaybackGeneration,
  bindPlaybackGeneration,
  INITIAL_PLAYBACK_LIFECYCLE,
  isPlaybackOverlayActive,
  needsTrackAcquisition,
  reducePlaybackLifecycle,
  shouldHideNativeCaptions,
  type GenerationBound,
  type PlaybackLifecycleState,
} from '../core/lifecycle';
import {
  isDuetSubMessage,
  postDuetSubMessage,
  requestFakeData,
} from '../core/messages';
import { createOverlayModel } from '../core/overlay-model';
import {
  synchronizeCues,
  type SynchronizerState,
} from '../core/synchronizer';
import {
  decideSubtitleSources,
  selectBilingualTracks,
  type SubtitleSource,
  type SubtitleSourceDecision,
} from '../core/track-selection';
import { scheduleTranslationBatches } from '../mt/scheduling';
import { NativeCaptionVisibility } from './native-captions';
import { createOverlayView, type OverlayView } from './overlay-view';
import { findSiteUiTarget, type SiteUiTarget } from './site-ui';
import { createToggleView, type ToggleView } from './toggle-view';

const UPDATE_INTERVAL_MS = 250;
const CONTROLS_VISIBLE_MS = 2_000;

export function startDuetSubContent(
  siteId: SiteId,
  adapter?: SiteAdapter,
): void {
  let controller: PlaybackController | undefined;

  const bind = () => {
    const target = findSiteUiTarget(siteId);
    if (target === undefined) {
      if (controller !== undefined && !controller.video.isConnected) {
        controller.destroy();
        controller = undefined;
      }
      return;
    }
    if (controller?.reconcile(target)) return;

    controller?.destroy();
    controller = new PlaybackController(siteId, target, adapter);
  };

  bind();
  const observer = new MutationObserver(bind);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['aria-hidden', 'class'],
    characterData: true,
    childList: true,
    subtree: true,
  });
  window.addEventListener(
    'pagehide',
    () => {
      observer.disconnect();
      controller?.destroy();
      controller = undefined;
    },
    { once: true },
  );
}

class PlaybackController {
  video: HTMLVideoElement;

  readonly #siteId: SiteId;
  readonly #siteLabel: string;
  readonly #adapter: SiteAdapter | undefined;
  readonly #storageKey: string;
  readonly #player: HTMLElement;
  readonly #nativeCaptions: NativeCaptionVisibility;
  readonly #overlayView: OverlayView;
  readonly #toggleView: ToggleView;
  readonly #restoredPlayerPosition: string | undefined;

  #state: PlaybackLifecycleState = INITIAL_PLAYBACK_LIFECYCLE;
  #englishCues: readonly Cue[] = [];
  #chineseCues: readonly Cue[] = [];
  #englishMachineTranslated = false;
  #chineseMachineTranslated = false;
  #readyStatus = '官方英文 + 官方繁中 · 100%';
  #tracks: readonly TrackInfo[] = [];
  #receivedEnglish = false;
  #receivedChinese = false;
  #requestId = '';
  #requestSequence = 0;
  #interactionRevision = 0;
  #acquisitionRevision = 0;
  #translationSequence = 0;
  #translationRequestIds = new Set<string>();
  #translationHintShown = false;
  #translationPlan:
    | {
        readonly source: readonly Cue[];
        readonly trackId: string;
        readonly target: 'english' | 'chinese';
        readonly targetLanguage: 'en' | 'zh-Hant';
      }
    | undefined;
  #synchronizerState: SynchronizerState | undefined;
  #controlsVisible = false;
  #controlsTimer: number | undefined;
  #updateTimer: number;
  #status: string;
  #destroyed = false;

  constructor(
    siteId: SiteId,
    target: SiteUiTarget,
    adapter?: SiteAdapter,
  ) {
    this.#siteId = siteId;
    this.#siteLabel = siteLabel(siteId);
    this.#adapter = adapter;
    this.#status = adapter === undefined
      ? '關閉 · 尚未載入假軌'
      : '關閉 · 尚未載入官方軌';
    this.#storageKey = `duetsub:enabled:${siteId}`;
    this.video = target.video;
    this.#player = target.player;
    if (target.contentIdentity !== undefined) {
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'content-observed',
        identity: target.contentIdentity,
      });
    }
    this.#restoredPlayerPosition = ensurePositioned(this.#player);
    this.#nativeCaptions = new NativeCaptionVisibility(
      target.nativeCaptionSelector,
    );
    this.#overlayView = createOverlayView(this.#player);
    this.#toggleView = createToggleView(
      target.controls ?? target.player,
      target.controls === undefined,
      siteId,
      {
        onToggle: () => this.#toggle(),
        onRetranslate: () => {
          if (this.#translationPlan === undefined) {
            this.#status = '目前使用官方雙軌，無需重新翻譯';
            this.#render();
            return;
          }
          this.#cancelTranslations();
          const revision = ++this.#acquisitionRevision;
          this.#status = '正在跳過快取重新翻譯…';
          this.#render();
          void this.#translatePlan(
            {
              contentGeneration: this.#state.contentGeneration,
              clockGeneration: this.#state.clockGeneration,
            },
            revision,
            true,
          );
        },
        onOpenSettings: openOptionsPage,
      },
      target.toggleBefore,
    );

    if (adapter !== undefined) {
      if (adapter.id !== siteId) {
        throw new Error(`Adapter ${adapter.id} cannot bind site ${siteId}`);
      }
      adapter.onTracks(this.#onAdapterTracks);
      adapter.onReset(this.#onAdapterReset);
      adapter.onAdState?.(this.#onAdapterAdState);
      this.#bindAdapterGeneration();
    }

    window.addEventListener('message', this.#onMessage);
    this.video.addEventListener('seeking', this.#onSeeking);
    this.video.addEventListener('seeked', this.#onSeeked);
    this.#player.addEventListener('pointermove', this.#onControlsActivity);
    this.#player.addEventListener('focusin', this.#onControlsActivity);
    this.#updateTimer = window.setInterval(
      () => this.#render(),
      UPDATE_INTERVAL_MS,
    );
    this.#render();
    void this.#hydrate();
  }

  reconcile(target: SiteUiTarget): boolean {
    if (
      this.#destroyed ||
      this.#player !== target.player
    ) {
      return false;
    }

    this.#toggleView.reanchor(
      target.controls ?? target.player,
      target.controls === undefined,
      target.toggleBefore,
    );

    let contentChanged = false;
    if (target.contentIdentity !== this.#state.contentIdentity) {
      this.#state = target.contentIdentity === undefined
        ? reducePlaybackLifecycle(this.#state, { type: 'reset-content' })
        : reducePlaybackLifecycle(this.#state, {
            type: 'content-observed',
            identity: target.contentIdentity,
          });
      this.#clearTrackData();
      this.#bindAdapterGeneration();
      this.#status = target.contentIdentity === undefined
        ? `開啟 · 等待可驗證的 ${this.#siteLabel} 內容身份`
        : `開啟 · ${this.#siteLabel} 內容已切換`;
      contentChanged = true;
    }

    if (this.video !== target.video) {
      this.#rebindVideo(target.video);
      return true;
    }

    if (contentChanged) {
      this.#render();
      if (this.#state.enabled && this.#canLoadTracks()) this.#loadTracks();
    }
    return true;
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#interactionRevision += 1;
    this.#acquisitionRevision += 1;
    this.#cancelTranslations();
    window.clearInterval(this.#updateTimer);
    if (this.#controlsTimer !== undefined) {
      window.clearTimeout(this.#controlsTimer);
    }
    window.removeEventListener('message', this.#onMessage);
    this.video.removeEventListener('seeking', this.#onSeeking);
    this.video.removeEventListener('seeked', this.#onSeeked);
    this.video.removeEventListener('loadeddata', this.#onVideoReady);
    this.#player.removeEventListener('pointermove', this.#onControlsActivity);
    this.#player.removeEventListener('focusin', this.#onControlsActivity);
    this.#state = reducePlaybackLifecycle(this.#state, {
      type: 'reset-content',
    });
    this.#bindAdapterGeneration();
    this.#nativeCaptions.restore();
    this.#overlayView.destroy();
    this.#toggleView.destroy();
    if (this.#restoredPlayerPosition !== undefined) {
      this.#player.style.position = this.#restoredPlayerPosition;
    }
  }

  async #hydrate(): Promise<void> {
    const revision = this.#interactionRevision;
    const stored = await chrome.storage.local.get(this.#storageKey);
    if (this.#destroyed || revision !== this.#interactionRevision) return;

    this.#state = reducePlaybackLifecycle(this.#state, {
      type: 'hydrate',
      enabled: stored[this.#storageKey] === true,
    });
    if (this.#state.enabled) this.#loadTracks();
    else this.#render();
  }

  #toggle(): void {
    this.#interactionRevision += 1;
    this.#state = reducePlaybackLifecycle(this.#state, { type: 'toggle' });
    void chrome.storage.local.set({
      [this.#storageKey]: this.#state.enabled,
    });

    if (this.#state.enabled) {
      if (needsTrackAcquisition(this.#state)) {
        this.#loadTracks();
      } else {
        this.#status = this.#readyStatus;
        this.#render();
      }
    } else {
      this.#status = this.#adapter === undefined
        ? '關閉 · 點擊即可載入假軌'
        : '關閉 · 點擊即可載入官方軌';
      this.#render();
    }
  }

  #loadTracks(): void {
    if (this.#adapter === undefined) {
      this.#requestFakeData();
      return;
    }

    if (!this.#canLoadTracks()) {
      this.#status = `開啟 · 等待可驗證的 ${this.#siteLabel} 內容身份`;
      this.#render();
      return;
    }

    this.#clearTrackData();
    this.#state = reducePlaybackLifecycle(this.#state, {
      type: 'tracks-loading',
    });
    this.#bindAdapterGeneration();
    this.#status = `開啟 · 枚舉 ${this.#siteLabel} 字幕軌…`;
    this.#render();
    this.#adapter.start();
  }

  #requestFakeData(): void {
    this.#requestSequence += 1;
    this.#requestId = `${Date.now()}-${this.#requestSequence}`;
    this.#tracks = [];
    this.#englishCues = [];
    this.#chineseCues = [];
    this.#receivedEnglish = false;
    this.#receivedChinese = false;
    this.#synchronizerState = undefined;
    this.#state = reducePlaybackLifecycle(this.#state, {
      type: 'tracks-loading',
    });
    this.#status = '開啟 · 等待 MAIN 假軌';
    this.#render();
    postDuetSubMessage(
      requestFakeData(
        this.#siteId,
        this.#requestId,
        this.video.currentTime * 1_000,
      ),
    );
  }

  #clearTrackData(): void {
    this.#cancelTranslations();
    this.#tracks = [];
    this.#englishCues = [];
    this.#chineseCues = [];
    this.#englishMachineTranslated = false;
    this.#chineseMachineTranslated = false;
    this.#readyStatus = '官方英文 + 官方繁中 · 100%';
    this.#receivedEnglish = false;
    this.#receivedChinese = false;
    this.#synchronizerState = undefined;
    this.#translationPlan = undefined;
  }

  readonly #onAdapterTracks = (tracks: TrackInfo[]) => {
    if (this.#destroyed || !this.#state.enabled) return;
    this.#tracks = tracks;
    void this.#acquireOfficialTracks(
      bindPlaybackGeneration(this.#state, tracks),
      this.#interactionRevision,
    );
  };

  async #acquireOfficialTracks(
    generatedTracks: GenerationBound<readonly TrackInfo[]>,
    interactionRevision: number,
  ): Promise<void> {
    const adapter = this.#adapter;
    if (adapter === undefined) return;
    const tracks = acceptPlaybackGeneration(this.#state, generatedTracks);
    if (tracks === undefined) return;

    const decision = this.#siteId === 'youtube'
      ? decideYouTubeSources(tracks)
      : this.#siteId === 'max'
      ? decideMaxSources(tracks)
      : decideSubtitleSources(tracks);
    if (decision.english === undefined || decision.chinese === undefined) {
      this.#status = '開啟 · 沒有可用的英文或中文來源';
      this.#render();
      return;
    }

    const acquisitionRevision = ++this.#acquisitionRevision;
    this.#status = '開啟 · 正在取得官方字幕…';
    this.#render();

    try {
      const requiredTracks = uniqueSourceTracks(decision.english, decision.chinese);
      const fetched = await Promise.all(
        requiredTracks.map(async (track) =>
          [track.id, await adapter.fetchTrack(track)] as const
        ),
      );
      const cuesByTrack = new Map(fetched);
      const [resolvedEnglish, resolvedChinese] = await Promise.all([
        cuesForSource(decision.english, cuesByTrack),
        cuesForSource(decision.chinese, cuesByTrack),
      ]);
      const accepted = acceptPlaybackGeneration(
        this.#state,
        bindPlaybackGeneration(generatedTracks.generation, {
          english: resolvedEnglish,
          chinese: resolvedChinese,
        }),
      );
      if (
        accepted === undefined ||
        this.#destroyed ||
        !this.#state.enabled ||
        interactionRevision !== this.#interactionRevision ||
        acquisitionRevision !== this.#acquisitionRevision
      ) {
        return;
      }
      if (
        accepted.english.source.length === 0 ||
        accepted.chinese.source.length === 0
      ) {
        throw new Error(
          `${this.#siteLabel} returned an empty subtitle track`,
        );
      }

      const englishCues = accepted.english.kind === 'mt'
        ? []
        : accepted.english.cues;
      const chineseCues = accepted.chinese.kind === 'mt'
        ? []
        : accepted.chinese.cues;
      const maxEnglishPrimaryAligned =
        this.#siteId === 'max' &&
        accepted.english.kind === 'official' &&
        accepted.chinese.kind !== 'mt';
      const displayedChineseCues = maxEnglishPrimaryAligned
        ? alignMaxChineseCuesToEnglish(englishCues, chineseCues)
        : chineseCues;
      if (maxEnglishPrimaryAligned && displayedChineseCues.length === 0) {
        throw new Error('Max English-primary cue alignment unavailable');
      }

      this.#englishCues = englishCues;
      this.#chineseCues = displayedChineseCues;
      this.#englishMachineTranslated = accepted.english.kind === 'mt' ||
        (accepted.english.kind === 'official' &&
          accepted.english.trackSource === 'platform-mt');
      this.#chineseMachineTranslated = accepted.chinese.kind === 'mt' ||
        (accepted.chinese.kind === 'official' &&
          accepted.chinese.trackSource === 'platform-mt');
      this.#synchronizerState = undefined;
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-ready',
      });
      const mt = accepted.english.kind === 'mt'
        ? { side: 'english' as const, value: accepted.english }
        : accepted.chinese.kind === 'mt'
        ? { side: 'chinese' as const, value: accepted.chinese }
        : undefined;
      if (mt === undefined) {
        this.#readyStatus = maxEnglishPrimaryAligned
          ? accepted.chinese.kind === 'opencc'
            ? '官方英文主軌 + OpenCC 繁中對齊 · 100%'
            : '官方英文主軌 + 官方繁中對齊 · 100%'
          : accepted.chinese.kind === 'opencc'
          ? '官方簡中 + OpenCC 繁中 · 100%'
          : accepted.english.kind === 'official' &&
              accepted.chinese.kind === 'official'
            ? selectedTrackStatus(
                accepted.english.trackSource,
                accepted.chinese.trackSource,
              )
            : '英文 + 繁中 · 100%';
        this.#status = this.#readyStatus;
      } else {
        this.#translationPlan = {
          source: mt.value.source,
          trackId: mt.value.trackId,
          target: mt.side,
          targetLanguage: mt.value.targetLanguage,
        };
        this.#readyStatus = '官方字幕 + MT · 100%';
        this.#status = '官方字幕已顯示 · 翻譯中…';
        void this.#translatePlan(
          generatedTracks.generation,
          acquisitionRevision,
        );
      }
      this.#render();
    } catch (error) {
      if (
        acceptPlaybackGeneration(
          this.#state,
          bindPlaybackGeneration(generatedTracks.generation, true),
        ) !== true ||
        this.#destroyed ||
        interactionRevision !== this.#interactionRevision ||
        acquisitionRevision !== this.#acquisitionRevision
      ) {
        return;
      }
      console.warn('[DuetSub] Dual-track acquisition failed', error);
      this.#clearTrackData();
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-loading',
      });
      this.#bindAdapterGeneration();
      this.#status = acquisitionErrorStatus(error);
      this.#render();
    }
  }

  readonly #onAdapterReset = (
    reason: 'navigation' | 'episode' | 'seek-flush',
  ) => {
    if (this.#destroyed) return;
    this.#interactionRevision += 1;
    this.#acquisitionRevision += 1;
    this.#cancelTranslations();
    this.#state = reason === 'seek-flush'
      ? reducePlaybackLifecycle(this.#state, { type: 'seeking' })
      : reducePlaybackLifecycle(this.#state, { type: 'reset-content' });
    if (reason !== 'seek-flush') this.#clearTrackData();
    this.#bindAdapterGeneration();
    this.#status = `開啟 · ${this.#siteLabel} 播放狀態已重設`;
    this.#render();
  };

  readonly #onAdapterAdState = (
    active: boolean,
    programClockContinuous: boolean,
  ) => {
    if (this.#destroyed) return;
    this.#acquisitionRevision += 1;
    this.#synchronizerState = undefined;
    this.#state = active
      ? reducePlaybackLifecycle(this.#state, { type: 'ad-entered' })
      : reducePlaybackLifecycle(this.#state, {
          type: 'ad-exited',
          programClockContinuous,
        });
    this.#bindAdapterGeneration();
    this.#status = active
      ? '開啟 · 廣告期間暫停顯示'
      : this.#state.suspension === 'none'
        ? this.#readyStatus
        : '開啟 · 等待可靠的節目時鐘';
    this.#render();
    if (
      !active &&
      needsTrackAcquisition(this.#state) &&
      this.#canLoadTracks()
    ) {
      this.#loadTracks();
    }
  };

  readonly #onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window || !isDuetSubMessage(event.data)) return;
    const message = event.data;
    if (
      message.direction !== 'main-to-isolated' ||
      (message.type !== 'tracks' && message.type !== 'cues') ||
      message.siteId !== this.#siteId ||
      message.requestId !== this.#requestId
    ) {
      return;
    }

    if (message.type === 'tracks') {
      this.#tracks = message.tracks;
      this.#status = `開啟 · 已收到 ${message.tracks.length} 條假軌`;
    } else if (message.role === 'english') {
      this.#englishCues = message.cues;
      this.#englishMachineTranslated = message.translation === 'mt-fallback';
      this.#receivedEnglish = true;
    } else {
      this.#chineseCues = message.cues;
      this.#chineseMachineTranslated = message.translation === 'mt-fallback';
      this.#receivedChinese = true;
    }

    if (
      this.#tracks.length === 2 &&
      this.#receivedEnglish &&
      this.#receivedChinese
    ) {
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-ready',
      });
      this.#status = '假資料：官方英文 + MT 繁中 · 100%';
    }
    this.#render();
  };

  readonly #onSeeking = () => {
    if (!this.#state.enabled) return;
    this.#synchronizerState = undefined;
    this.#acquisitionRevision += 1;
    this.#cancelTranslations();
    this.#state = reducePlaybackLifecycle(this.#state, { type: 'seeking' });
    this.#bindAdapterGeneration();
    this.#status = '開啟 · 拖動中暫停顯示';
    this.#render();
  };

  readonly #onSeeked = () => {
    if (!this.#state.enabled) return;
    if (this.#adapter === undefined) {
      this.#requestFakeData();
    } else {
      this.#synchronizerState = undefined;
      this.#state = reducePlaybackLifecycle(this.#state, { type: 'seeked' });
      this.#bindAdapterGeneration();
      this.#status = this.#englishCues.length > 0 && this.#chineseCues.length > 0
        ? this.#readyStatus
        : '開啟 · 尚未取得雙軌';
      this.#render();
      if (this.#translationPlan !== undefined) {
        void this.#translatePlan(
          {
            contentGeneration: this.#state.contentGeneration,
            clockGeneration: this.#state.clockGeneration,
          },
          this.#acquisitionRevision,
        );
      }
      if (needsTrackAcquisition(this.#state)) this.#loadTracks();
    }
  };

  #rebindVideo(video: HTMLVideoElement): void {
    this.#nativeCaptions.restore();
    this.video.removeEventListener('seeking', this.#onSeeking);
    this.video.removeEventListener('seeked', this.#onSeeked);
    this.video.removeEventListener('loadeddata', this.#onVideoReady);

    this.video = video;
    this.video.addEventListener('seeking', this.#onSeeking);
    this.video.addEventListener('seeked', this.#onSeeked);
    this.#synchronizerState = undefined;
    this.#acquisitionRevision += 1;
    this.#cancelTranslations();
    this.#state = reducePlaybackLifecycle(this.#state, {
      type: 'video-replaced',
    });
    this.#bindAdapterGeneration();
    this.#status = `開啟 · ${this.#siteLabel} video 時鐘已替換`;
    this.#render();

    if (video.readyState >= 2) this.#onVideoReady();
    else video.addEventListener('loadeddata', this.#onVideoReady, { once: true });
  }

  readonly #onVideoReady = () => {
    if (this.#destroyed || this.#state.suspension !== 'clock-reset') return;
    this.#state = reducePlaybackLifecycle(this.#state, { type: 'video-ready' });
    this.#bindAdapterGeneration();
    this.#render();
    if (needsTrackAcquisition(this.#state) && this.#canLoadTracks()) {
      this.#loadTracks();
    }
  };

  #bindAdapterGeneration(): void {
    this.#adapter?.bindGeneration?.({
      contentGeneration: this.#state.contentGeneration,
      clockGeneration: this.#state.clockGeneration,
    });
  }

  async #translatePlan(
    generation: {
      readonly contentGeneration: number;
      readonly clockGeneration: number;
    },
    acquisitionRevision: number,
    skipCache = false,
  ): Promise<void> {
    const plan = this.#translationPlan;
    if (plan === undefined) return;
    const batches = scheduleTranslationBatches(
      plan.source,
      this.video.currentTime * 1_000,
    );
    let hadFailure = false;
    for (const batch of batches) {
      if (
        this.#destroyed ||
        acquisitionRevision !== this.#acquisitionRevision
      ) return;
      const requestId = `mt-${Date.now()}-${++this.#translationSequence}`;
      this.#translationRequestIds.add(requestId);
      const response = await chrome.runtime.sendMessage({
        channel: 'duetsub-mt',
        version: 1,
        type: 'translate',
        requestId,
        generation,
        contentId: this.#state.contentIdentity ?? `${this.#siteId}:unknown`,
        trackId: plan.trackId,
        targetLanguage: plan.targetLanguage,
        cues: batch,
        skipCache,
      }) as {
        readonly status:
          | 'ok'
          | 'failed'
          | 'missing-key'
          | 'missing-permission'
          | 'aborted';
        readonly cues: readonly Cue[];
        readonly generation: typeof generation;
      };
      this.#translationRequestIds.delete(requestId);
      if (
        acceptPlaybackGeneration(
          this.#state,
          bindPlaybackGeneration(response.generation, true),
        ) !== true ||
        acquisitionRevision !== this.#acquisitionRevision
      ) return;
      if (response.status === 'missing-key') {
        if (!this.#translationHintShown) {
          this.#translationHintShown = true;
          this.#status = '官方字幕照常顯示 · 請到設定頁配置翻譯服務';
          this.#render();
        }
        return;
      }
      if (response.status === 'missing-permission') {
        if (!this.#translationHintShown) {
          this.#translationHintShown = true;
          this.#status = '官方字幕照常顯示 · 請到設定頁授權翻譯端點';
          this.#render();
        }
        return;
      }
      if (response.status === 'aborted') return;
      hadFailure ||= response.status === 'failed';
      this.#mergeTranslatedCues(plan.target, response.cues);
      this.#status = response.status === 'ok'
        ? '官方字幕 + MT · 翻譯中…'
        : '官方字幕照常顯示 · 部分翻譯失敗';
      this.#render();
    }
    this.#status = hadFailure
      ? '官方字幕照常顯示 · 部分翻譯失敗'
      : this.#readyStatus;
    this.#render();
  }

  #mergeTranslatedCues(
    target: 'english' | 'chinese',
    cues: readonly Cue[],
  ): void {
    const current = target === 'english'
      ? this.#englishCues
      : this.#chineseCues;
    const merged = new Map(
      current.map((cue) => [`${cue.start}:${cue.end}:${cue.text}`, cue]),
    );
    for (const cue of cues) {
      for (const [key, existing] of merged) {
        if (existing.start === cue.start && existing.end === cue.end) {
          merged.delete(key);
        }
      }
      merged.set(`${cue.start}:${cue.end}:${cue.text}`, cue);
    }
    const result = [...merged.values()].sort((a, b) =>
      a.start - b.start || a.end - b.end
    );
    if (target === 'english') this.#englishCues = result;
    else this.#chineseCues = result;
    this.#synchronizerState = undefined;
  }

  #cancelTranslations(): void {
    for (const requestId of this.#translationRequestIds) {
      void chrome.runtime.sendMessage({
        channel: 'duetsub-mt',
        version: 1,
        type: 'cancel',
        requestId,
      });
    }
    this.#translationRequestIds.clear();
  }

  #canLoadTracks(): boolean {
    return (
      (this.#siteId !== 'primevideo' &&
        this.#siteId !== 'max' &&
        this.#siteId !== 'netflix') ||
      this.#state.contentIdentity !== undefined
    );
  }

  readonly #onControlsActivity = () => {
    this.#controlsVisible = true;
    if (this.#controlsTimer !== undefined) {
      window.clearTimeout(this.#controlsTimer);
    }
    this.#controlsTimer = window.setTimeout(() => {
      this.#controlsVisible = false;
      this.#render();
    }, CONTROLS_VISIBLE_MS);
    this.#render();
  };

  #render(): void {
    const active = isPlaybackOverlayActive(this.#state);
    const synchronized = active
      ? synchronizeCues(
          this.#englishCues,
          this.#chineseCues,
          this.video.currentTime * 1_000,
          this.#synchronizerState,
        )
      : undefined;
    this.#synchronizerState = synchronized?.state;

    this.#overlayView.render(
      createOverlayModel({
        active,
        enActive: synchronized?.enActive ?? [],
        zhActive: synchronized?.zhActive ?? [],
        englishMachineTranslated: this.#englishMachineTranslated,
        chineseMachineTranslated: this.#chineseMachineTranslated,
        controlsVisible: this.#controlsVisible,
      }),
    );
    this.#nativeCaptions.setHidden(shouldHideNativeCaptions(this.#state));
    this.#toggleView.render(this.#state.enabled, this.#status);
  }
}

function ensurePositioned(player: HTMLElement): string | undefined {
  if (getComputedStyle(player).position !== 'static') return undefined;
  const previous = player.style.position;
  player.style.position = 'relative';
  return previous;
}

type ResolvedSubtitleSource =
  | {
      readonly kind: 'official';
      readonly cues: readonly Cue[];
      readonly source: readonly Cue[];
      readonly trackSource: TrackInfo['source'];
    }
  | {
      readonly kind: 'opencc';
      readonly cues: readonly Cue[];
      readonly source: readonly Cue[];
    }
  | {
      readonly kind: 'mt';
      readonly cues: readonly [];
      readonly source: readonly Cue[];
      readonly trackId: string;
      readonly targetLanguage: 'en' | 'zh-Hant';
    };

function uniqueSourceTracks(
  ...sources: readonly SubtitleSource[]
): TrackInfo[] {
  const tracks = sources.map((source) =>
    source.kind === 'official' ? source.track : source.source
  );
  return [...new Map(tracks.map((track) => [track.id, track])).values()];
}

async function cuesForSource(
  source: SubtitleSource,
  cuesByTrack: ReadonlyMap<string, readonly Cue[]>,
): Promise<ResolvedSubtitleSource> {
  const track = source.kind === 'official' ? source.track : source.source;
  const cues = cuesByTrack.get(track.id) ?? [];
  if (source.kind === 'official') {
    return {
      kind: 'official',
      cues,
      source: cues,
      trackSource: track.source,
    };
  }
  if (source.kind === 'opencc') {
    const response = await chrome.runtime.sendMessage({
      channel: 'duetsub-mt',
      version: 1,
      type: 'opencc',
      cues,
    }) as { readonly cues: readonly Cue[] };
    return {
      kind: 'opencc',
      cues: response.cues,
      source: cues,
    };
  }
  return {
    kind: 'mt',
    cues: [],
    source: cues,
    trackId: track.id,
    targetLanguage: source.targetLanguage,
  };
}

function openOptionsPage(): void {
  if (typeof chrome.runtime.openOptionsPage === 'function') {
    void chrome.runtime.openOptionsPage();
    return;
  }
  window.open(chrome.runtime.getURL('options.html'), '_blank', 'noopener');
}

function decideYouTubeSources(
  tracks: readonly TrackInfo[],
): SubtitleSourceDecision {
  const selected = selectBilingualTracks(tracks);
  if (selected.english !== undefined && selected.chinese !== undefined) {
    return {
      english: { kind: 'official', track: selected.english },
      chinese: { kind: 'official', track: selected.chinese },
    };
  }
  return decideSubtitleSources(tracks);
}

function decideMaxSources(
  tracks: readonly TrackInfo[],
): SubtitleSourceDecision {
  const decision = decideSubtitleSources(tracks);
  const english = selectMaxEnglishPrimaryTrack(tracks);
  if (english === undefined) return decision;

  return {
    english: { kind: 'official', track: english },
    chinese: decision.chinese?.kind === 'mt'
      ? { ...decision.chinese, source: english }
      : decision.chinese,
  };
}

function selectedTrackStatus(
  english: TrackInfo['source'],
  chinese: TrackInfo['source'],
): string {
  return `${sourceLabel(english, '英文')} + ${sourceLabel(chinese, '繁中')} · 100%`;
}

function sourceLabel(
  source: TrackInfo['source'],
  language: '英文' | '繁中',
): string {
  switch (source) {
    case 'official':
      return `官方${language}`;
    case 'asr':
      return `ASR ${language}`;
    case 'platform-mt':
      return `平台 MT ${language}`;
  }
}

function acquisitionErrorStatus(error: unknown): string {
  if (
    error instanceof Error &&
    error.message.includes('手動開啟一次 YouTube 字幕')
  ) {
    return `開啟 · ${error.message}`;
  }
  return '開啟 · 無法可靠取得並恢復雙軌';
}

function siteLabel(siteId: SiteId): string {
  switch (siteId) {
    case 'netflix':
      return 'Netflix';
    case 'primevideo':
      return 'Prime';
    case 'max':
      return 'Max';
    case 'youtube':
      return 'YouTube';
  }
}
