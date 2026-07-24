import type { Cue, SiteAdapter, SiteId, TrackInfo } from '../core/contracts';
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
import { selectOfficialDualTracks } from '../core/track-selection';
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
  readonly #adapter: SiteAdapter | undefined;
  readonly #storageKey: string;
  readonly #player: HTMLElement;
  readonly #toggleAnchor: HTMLElement;
  readonly #toggleBefore: HTMLElement | undefined;
  readonly #nativeCaptions: NativeCaptionVisibility;
  readonly #overlayView: OverlayView;
  readonly #toggleView: ToggleView;
  readonly #restoredPlayerPosition: string | undefined;

  #state: PlaybackLifecycleState = INITIAL_PLAYBACK_LIFECYCLE;
  #englishCues: readonly Cue[] = [];
  #chineseCues: readonly Cue[] = [];
  #englishMachineTranslated = false;
  #chineseMachineTranslated = false;
  #tracks: readonly TrackInfo[] = [];
  #receivedEnglish = false;
  #receivedChinese = false;
  #requestId = '';
  #requestSequence = 0;
  #interactionRevision = 0;
  #acquisitionRevision = 0;
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
    this.#adapter = adapter;
    this.#status = adapter === undefined
      ? '關閉 · 尚未載入假軌'
      : '關閉 · 尚未載入官方軌';
    this.#storageKey = `duetsub:enabled:${siteId}`;
    this.video = target.video;
    this.#player = target.player;
    this.#toggleAnchor = target.controls ?? target.player;
    this.#toggleBefore = target.toggleBefore;
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
      this.#toggleAnchor,
      target.controls === undefined,
      {
        onToggle: () => this.#toggle(),
        onRetranslate: () => {
          this.#status = '重新翻譯將在 ticket 04 提供';
          this.#render();
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
      this.#player !== target.player ||
      this.#toggleAnchor !== (target.controls ?? target.player) ||
      this.#toggleBefore !== target.toggleBefore
    ) {
      return false;
    }

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
        ? '開啟 · 等待可驗證的 Prime 內容身份'
        : '開啟 · Prime 內容已切換';
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

    if (this.#state.enabled) this.#loadTracks();
    else {
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
      this.#status = '開啟 · 等待可驗證的 Prime 內容身份';
      this.#render();
      return;
    }

    this.#clearTrackData();
    this.#state = reducePlaybackLifecycle(this.#state, {
      type: 'tracks-loading',
    });
    this.#bindAdapterGeneration();
    this.#status = '開啟 · 枚舉 Prime 官方字幕軌…';
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
    this.#tracks = [];
    this.#englishCues = [];
    this.#chineseCues = [];
    this.#englishMachineTranslated = false;
    this.#chineseMachineTranslated = false;
    this.#receivedEnglish = false;
    this.#receivedChinese = false;
    this.#synchronizerState = undefined;
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

    const selected = selectOfficialDualTracks(tracks);
    if (selected.english === undefined || selected.chinese === undefined) {
      this.#status = `開啟 · 缺少官方 ${selected.missing.join(' + ')} 軌`;
      this.#render();
      return;
    }

    const acquisitionRevision = ++this.#acquisitionRevision;
    this.#status = '開啟 · 正在取得官方英文 + 繁中…';
    this.#render();

    try {
      const [english, chinese] = await Promise.all([
        adapter.fetchTrack(selected.english),
        adapter.fetchTrack(selected.chinese),
      ]);
      const accepted = acceptPlaybackGeneration(
        this.#state,
        bindPlaybackGeneration(generatedTracks.generation, {
          english,
          chinese,
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
      if (accepted.english.length === 0 || accepted.chinese.length === 0) {
        throw new Error('Prime returned an empty official subtitle track');
      }

      this.#englishCues = accepted.english;
      this.#chineseCues = accepted.chinese;
      this.#englishMachineTranslated = false;
      this.#chineseMachineTranslated = false;
      this.#synchronizerState = undefined;
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-ready',
      });
      this.#status = '官方英文 + 官方繁中 · 100%';
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
      console.warn('[DuetSub] Official dual-track acquisition failed', error);
      this.#clearTrackData();
      this.#status = '開啟 · 無法可靠取得並恢復雙軌';
      this.#render();
    }
  }

  readonly #onAdapterReset = (
    reason: 'navigation' | 'episode' | 'seek-flush',
  ) => {
    if (this.#destroyed) return;
    this.#interactionRevision += 1;
    this.#acquisitionRevision += 1;
    this.#state = reason === 'seek-flush'
      ? reducePlaybackLifecycle(this.#state, { type: 'seeking' })
      : reducePlaybackLifecycle(this.#state, { type: 'reset-content' });
    if (reason !== 'seek-flush') this.#clearTrackData();
    this.#bindAdapterGeneration();
    this.#status = '開啟 · Prime 播放狀態已重設';
    this.#render();
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
        ? '官方英文 + 官方繁中 · 100%'
        : '開啟 · 尚未取得雙軌';
      this.#render();
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
    this.#state = reducePlaybackLifecycle(this.#state, {
      type: 'video-replaced',
    });
    this.#bindAdapterGeneration();
    this.#status = '開啟 · Prime video 時鐘已替換';
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

  #canLoadTracks(): boolean {
    return this.#siteId !== 'primevideo' ||
      this.#state.contentIdentity !== undefined;
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

function openOptionsPage(): void {
  if (typeof chrome.runtime.openOptionsPage === 'function') {
    void chrome.runtime.openOptionsPage();
    return;
  }
  window.open(chrome.runtime.getURL('options.html'), '_blank', 'noopener');
}
