import type { Cue, SiteAdapter, SiteId, TrackInfo } from '../core/contracts';
import {
  resolveMaxOfficialPairCues,
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
  type PlaybackGeneration,
  type PlaybackLifecycleState,
} from '../core/lifecycle';
import {
  isDuetSubMessage,
  postDuetSubMessage,
  requestFakeData,
} from '../core/messages';
import { createOverlayModel } from '../core/overlay-model';
import {
  loadLanguagePairPreference,
  saveLanguagePairPreference,
} from '../core/official-pair-preference';
import {
  createOfficialTrackCatalog,
  DEFAULT_LANGUAGE_PAIR_PREFERENCE,
  resolveOfficialPair,
  resolveOfficialPairCues,
  type LanguagePairPreference,
  type OfficialPairUnavailableReason,
} from '../core/official-pair-selection';
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
  #topCues: readonly Cue[] = [];
  #bottomCues: readonly Cue[] = [];
  #topLanguage = DEFAULT_LANGUAGE_PAIR_PREFERENCE.top;
  #bottomLanguage = DEFAULT_LANGUAGE_PAIR_PREFERENCE.bottom;
  #languagePairPreference = DEFAULT_LANGUAGE_PAIR_PREFERENCE;
  #hasSavedLanguagePairPreference = false;
  #topMachineTranslated = false;
  #bottomMachineTranslated = false;
  #readyStatus = '官方英文 + 官方繁中 · 100%';
  #tracks: readonly TrackInfo[] = [];
  #receivedTopTrackId: string | undefined;
  #receivedBottomTrackId: string | undefined;
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
        readonly target: 'top' | 'bottom';
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
      siteId === 'netflix' ? target.player : undefined,
    );
    this.#overlayView = createOverlayView(this.#player);
    this.#toggleView = createToggleView(
      target.controls ?? target.player,
      target.controls === undefined,
      siteId,
      {
        onToggle: () => this.#toggle(),
        onOpenLanguagePair: () => this.#openLanguagePairChooser(),
        onSelectLanguagePair: (preference) => {
          void this.#selectLanguagePair(preference);
        },
        onReloadOfficialTracks: () => this.#reloadOfficialTracks(),
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
              selectionGeneration: this.#state.selectionGeneration,
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
    const [stored, languagePair] = await Promise.all([
      chrome.storage.local.get(this.#storageKey),
      loadLanguagePairPreference(chrome.storage.local),
    ]);
    if (this.#destroyed || revision !== this.#interactionRevision) return;

    this.#languagePairPreference = languagePair.preference;
    this.#hasSavedLanguagePairPreference = languagePair.stored;
    this.#topLanguage = languagePair.preference.top;
    this.#bottomLanguage = languagePair.preference.bottom;
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

  #requestFakeData(catalogOnly = false): void {
    this.#requestSequence += 1;
    this.#requestId = `${Date.now()}-${this.#requestSequence}`;
    if (!catalogOnly) {
      this.#tracks = [];
      this.#clearSelectedPair();
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-loading',
      });
    }
    this.#status = catalogOnly
      ? '正在讀取當前節目的官方字幕…'
      : '開啟 · 等待 MAIN 假軌';
    this.#render();
    postDuetSubMessage(
      requestFakeData(
        this.#siteId,
        this.#requestId,
        this.video.currentTime * 1_000,
        {
          catalogOnly,
          preference: this.#languagePairPreference,
        },
      ),
    );
  }

  #clearTrackData(): void {
    this.#tracks = [];
    this.#clearSelectedPair();
  }

  #clearSelectedPair(): void {
    this.#cancelTranslations();
    this.#topCues = [];
    this.#bottomCues = [];
    this.#topLanguage = this.#languagePairPreference.top;
    this.#bottomLanguage = this.#languagePairPreference.bottom;
    this.#topMachineTranslated = false;
    this.#bottomMachineTranslated = false;
    this.#readyStatus = '官方英文 + 官方繁中 · 100%';
    this.#receivedTopTrackId = undefined;
    this.#receivedBottomTrackId = undefined;
    this.#synchronizerState = undefined;
    this.#translationPlan = undefined;
  }

  #openLanguagePairChooser(): void {
    if (this.#tracks.length > 0) {
      this.#render();
      return;
    }
    this.#status = '正在讀取當前節目的官方字幕…';
    this.#render();
    if (this.#adapter === undefined) {
      this.#requestFakeData(true);
      return;
    }
    if (this.#canLoadTracks()) this.#adapter.start();
  }

  #reloadOfficialTracks(): void {
    this.#interactionRevision += 1;
    this.#acquisitionRevision += 1;
    this.#state = reducePlaybackLifecycle(this.#state, {
      type: 'reload-tracks',
    });
    this.#clearTrackData();
    this.#bindAdapterGeneration();

    if (!this.#state.enabled) {
      this.#status = '關閉 · 已清除本輪官方字幕';
      this.#render();
      return;
    }
    if (this.#adapter === undefined) {
      this.#requestFakeData();
      return;
    }
    if (!this.#canLoadTracks()) {
      this.#status = `開啟 · 等待可驗證的 ${this.#siteLabel} 內容身份`;
      this.#render();
      return;
    }

    this.#status = `正在重新載入 ${pairLabel(this.#languagePairPreference)}…`;
    this.#render();
    this.#adapter.start();
  }

  async #selectLanguagePair(
    preference: LanguagePairPreference,
  ): Promise<void> {
    const resolved = resolveOfficialPair({
      siteId: this.#siteId,
      tracks: this.#tracks,
      preference,
    });
    if (resolved.kind !== 'ready') {
      this.#status = unavailablePairStatus(resolved.reason, preference);
      this.#render();
      return;
    }

    const interactionRevision = ++this.#interactionRevision;
    this.#acquisitionRevision += 1;
    this.#languagePairPreference = preference;
    this.#hasSavedLanguagePairPreference = true;
    this.#state = reducePlaybackLifecycle(this.#state, {
      type: 'selection-changed',
    });
    this.#clearSelectedPair();
    this.#bindAdapterGeneration();
    this.#status = `正在切換為 ${pairLabel(preference)}…`;
    this.#render();

    let saved = false;
    try {
      saved = await saveLanguagePairPreference(
        chrome.storage.local,
        preference,
      );
    } catch {
      // Keep the new generation fail closed if local persistence fails.
    }
    if (
      this.#destroyed ||
      interactionRevision !== this.#interactionRevision
    ) {
      return;
    }
    if (!saved) {
      this.#status = '無法在本機儲存官方語言偏好';
      this.#render();
      return;
    }
    if (!this.#state.enabled) {
      this.#status = `關閉 · 已選擇 ${pairLabel(preference)}`;
      this.#render();
      return;
    }
    if (this.#adapter === undefined) {
      this.#requestFakeData();
      return;
    }
    this.#adapter.start();
  }

  readonly #onAdapterTracks = (tracks: TrackInfo[]) => {
    if (this.#destroyed) return;
    this.#tracks = tracks;
    if (!this.#state.enabled) {
      this.#status = catalogStatus(tracks);
      this.#render();
      return;
    }
    if (this.#hasSavedLanguagePairPreference || this.#siteId === 'max') {
      void this.#acquireSelectedOfficialTracks(
        bindPlaybackGeneration(this.#state, tracks),
        this.#interactionRevision,
      );
      return;
    }
    void this.#acquireOfficialTracks(
      bindPlaybackGeneration(this.#state, tracks),
      this.#interactionRevision,
    );
  };

  async #acquireSelectedOfficialTracks(
    generatedTracks: GenerationBound<readonly TrackInfo[]>,
    interactionRevision: number,
  ): Promise<void> {
    const adapter = this.#adapter;
    if (adapter === undefined) return;
    const tracks = acceptPlaybackGeneration(this.#state, generatedTracks);
    if (tracks === undefined) return;

    const pair = resolveOfficialPair({
      siteId: this.#siteId,
      tracks,
      preference: this.#languagePairPreference,
    });
    if (pair.kind !== 'ready') {
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-loading',
      });
      this.#status = unavailablePairStatus(
        pair.reason,
        this.#languagePairPreference,
      );
      this.#render();
      return;
    }

    const acquisitionRevision = ++this.#acquisitionRevision;
    this.#status = `正在取得 ${pairLabel(this.#languagePairPreference)}…`;
    this.#render();

    try {
      const fetched = await Promise.all(
        [pair.top, pair.bottom].map(async (track) =>
          [track.id, await adapter.fetchTrack(track)] as const
        ),
      );
      const accepted = acceptPlaybackGeneration(
        this.#state,
        bindPlaybackGeneration(generatedTracks.generation, new Map(fetched)),
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
      const cues = resolveOfficialPairCues({
        siteId: this.#siteId,
        tracks,
        preference: this.#languagePairPreference,
        cuesByTrack: accepted,
      });
      if (cues.kind !== 'ready') {
        throw new Error(`Selected official pair unavailable: ${cues.reason}`);
      }
      const maxCues = this.#siteId === 'max'
        ? resolveMaxOfficialPairCues({
            top: cues.top,
            bottom: cues.bottom,
            topCues: cues.topCues,
            bottomCues: cues.bottomCues,
          })
        : undefined;
      if (maxCues?.kind === 'unavailable') {
        throw new Error('Max official pair alignment coverage unavailable');
      }

      this.#topCues = maxCues?.topCues ?? cues.topCues;
      this.#bottomCues = maxCues?.bottomCues ?? cues.bottomCues;
      this.#topLanguage = cues.top.language;
      this.#bottomLanguage = cues.bottom.language;
      this.#topMachineTranslated = false;
      this.#bottomMachineTranslated = false;
      this.#synchronizerState = undefined;
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-ready',
      });
      this.#readyStatus = maxCues?.policy ===
          'english-cc-traditional-chinese'
        ? `${pairLabel(this.#languagePairPreference)} 對齊 · 100%`
        : `${pairLabel(this.#languagePairPreference)} · 100%`;
      this.#status = this.#readyStatus;
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
      console.warn('[DuetSub] Official pair acquisition failed', error);
      this.#clearSelectedPair();
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-loading',
      });
      this.#bindAdapterGeneration();
      this.#status = '無法可靠取得並恢復所選官方字幕';
      this.#render();
    }
  }

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
      this.#topCues = englishCues;
      this.#bottomCues = chineseCues;
      this.#topMachineTranslated = accepted.english.kind === 'mt' ||
        (accepted.english.kind === 'official' &&
          accepted.english.trackSource === 'platform-mt');
      this.#bottomMachineTranslated = accepted.chinese.kind === 'mt' ||
        (accepted.chinese.kind === 'official' &&
          accepted.chinese.trackSource === 'platform-mt');
      this.#synchronizerState = undefined;
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-ready',
      });
      const mt = accepted.english.kind === 'mt'
        ? { side: 'top' as const, value: accepted.english }
        : accepted.chinese.kind === 'mt'
        ? { side: 'bottom' as const, value: accepted.chinese }
        : undefined;
      if (mt === undefined) {
        this.#readyStatus = accepted.chinese.kind === 'opencc'
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
      if (!this.#state.enabled) {
        this.#status = catalogStatus(message.tracks);
        this.#render();
        return;
      }
      this.#status = `開啟 · 已收到 ${message.tracks.length} 條假軌`;
    } else if (message.role === 'top') {
      this.#topCues = message.cues;
      this.#topMachineTranslated = message.translation === 'mt-fallback';
      this.#receivedTopTrackId = message.trackId;
    } else {
      this.#bottomCues = message.cues;
      this.#bottomMachineTranslated = message.translation === 'mt-fallback';
      this.#receivedBottomTrackId = message.trackId;
    }

    const cuesByTrack = new Map<string, readonly Cue[]>();
    if (this.#receivedTopTrackId !== undefined) {
      cuesByTrack.set(this.#receivedTopTrackId, this.#topCues);
    }
    if (this.#receivedBottomTrackId !== undefined) {
      cuesByTrack.set(this.#receivedBottomTrackId, this.#bottomCues);
    }
    const pair = resolveOfficialPairCues({
      siteId: this.#siteId,
      tracks: this.#tracks,
      preference: this.#languagePairPreference,
      cuesByTrack,
    });
    if (pair.kind === 'ready') {
      this.#topCues = pair.topCues;
      this.#bottomCues = pair.bottomCues;
      this.#topLanguage = pair.top.language;
      this.#bottomLanguage = pair.bottom.language;
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-ready',
      });
      this.#readyStatus = `假資料：${pairLabel(this.#languagePairPreference)} · 100%`;
      this.#status = this.#readyStatus;
    } else {
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-loading',
      });
      this.#status = pair.reason === 'top-empty' ||
          pair.reason === 'bottom-empty' ||
          pair.reason === 'both-empty'
        ? `開啟 · 等待完整的 ${pairLabel(this.#languagePairPreference)} 假軌`
        : unavailablePairStatus(pair.reason, this.#languagePairPreference);
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
      this.#status = this.#topCues.length > 0 && this.#bottomCues.length > 0
        ? this.#readyStatus
        : '開啟 · 尚未取得雙軌';
      this.#render();
      if (this.#translationPlan !== undefined) {
        void this.#translatePlan(
          {
            contentGeneration: this.#state.contentGeneration,
            clockGeneration: this.#state.clockGeneration,
            selectionGeneration: this.#state.selectionGeneration,
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
      selectionGeneration: this.#state.selectionGeneration,
    });
  }

  async #translatePlan(
    generation: PlaybackGeneration,
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
    target: 'top' | 'bottom',
    cues: readonly Cue[],
  ): void {
    const current = target === 'top'
      ? this.#topCues
      : this.#bottomCues;
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
    if (target === 'top') this.#topCues = result;
    else this.#bottomCues = result;
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
          this.#topCues,
          this.#bottomCues,
          this.video.currentTime * 1_000,
          this.#synchronizerState,
        )
      : undefined;
    this.#synchronizerState = synchronized?.state;

    this.#overlayView.render(
      createOverlayModel({
        active,
        topActive: synchronized?.topActive ?? [],
        bottomActive: synchronized?.bottomActive ?? [],
        topLanguage: this.#topLanguage,
        bottomLanguage: this.#bottomLanguage,
        topMachineTranslated: this.#topMachineTranslated,
        bottomMachineTranslated: this.#bottomMachineTranslated,
        controlsVisible: this.#controlsVisible,
      }),
    );
    this.#nativeCaptions.setHidden(shouldHideNativeCaptions(this.#state));
    this.#toggleView.render(
      this.#state.enabled,
      this.#status,
      createOfficialTrackCatalog(this.#tracks),
      this.#languagePairPreference,
    );
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

function catalogStatus(tracks: readonly TrackInfo[]): string {
  const catalog = createOfficialTrackCatalog(tracks);
  return catalog.length === 0
    ? '當前節目沒有可驗證的官方字幕'
    : `可選：${catalog.map(({ label }) => label).join('、')}`;
}

function pairLabel(preference: LanguagePairPreference): string {
  return `官方${languageDisplayName(preference.top)} + 官方${
    languageDisplayName(preference.bottom)
  }`;
}

function unavailablePairStatus(
  reason: OfficialPairUnavailableReason,
  preference: LanguagePairPreference,
): string {
  switch (reason) {
    case 'same-language':
      return '上下字幕不能選擇相同語言';
    case 'top-missing':
      return `當前節目沒有官方${languageDisplayName(preference.top)}字幕`;
    case 'bottom-missing':
      return `當前節目沒有官方${languageDisplayName(preference.bottom)}字幕`;
    case 'both-missing':
      return `當前節目沒有${pairLabel(preference)}`;
    case 'ambiguous-language':
      return '當前節目的官方字幕語言無法可靠判定';
  }
}

function languageDisplayName(language: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(language) ??
      language;
  } catch {
    return language;
  }
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
