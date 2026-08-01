import type {
  Cue,
  SiteAdapter,
  SiteId,
  TrackInfo,
  TranslationTargetLanguage,
} from '../core/contracts';
import {
  bottomRetranslationTargetLanguage,
  createBottomRetranslationPlan,
  type BottomRetranslationPlan,
} from '../core/bottom-retranslation';
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
import { mergeTranslatedCues } from '../core/translated-cue-merge';
import {
  decideSubtitleSources,
  decideYoutubeSubtitleSources,
  type SubtitleSource,
} from '../core/track-selection';
import {
  languageDisplayName,
  loadUiLanguage,
  resolveUiLanguage,
  translate,
  UI_LANGUAGE_STORAGE_KEY,
  type UiLanguage,
  type UiMessageKey,
} from '../i18n';
import { scheduleTranslationBatches } from '../mt/scheduling';
import { NativeCaptionVisibility } from './native-captions';
import { createOverlayView, type OverlayView } from './overlay-view';
import { resolvePlaybackTimeMs } from './playback-clock';
import { findSiteUiTarget, type SiteUiTarget } from './site-ui';
import { createToggleView, type ToggleView } from './toggle-view';

const UPDATE_INTERVAL_MS = 250;
const CONTROLS_VISIBLE_MS = 2_000;
type LocalizedText = (language: UiLanguage) => string;
interface OfficialPairSnapshot {
  readonly contentIdentity: string | undefined;
  readonly topCues: readonly Cue[];
  readonly bottomCues: readonly Cue[];
  readonly topLanguage: string;
  readonly bottomLanguage: string;
  readonly bottomRetranslationPlan: BottomRetranslationPlan;
  readonly readyStatus: LocalizedText;
}

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
  #readyStatus = uiMessage('status.readyDefault');
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
        readonly targetLanguage: TranslationTargetLanguage;
      }
    | undefined;
  #bottomRetranslationPlan: BottomRetranslationPlan | undefined;
  #officialPairSnapshot: OfficialPairSnapshot | undefined;
  #synchronizerState: SynchronizerState | undefined;
  #controlsVisible = false;
  #controlsTimer: number | undefined;
  #updateTimer: number;
  #uiLanguage = resolveUiLanguage(undefined, browserLanguages());
  #status: LocalizedText;
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
      ? uiMessage('status.disabledFakeNotLoaded')
      : uiMessage('status.disabledOfficialNotLoaded');
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
      target.nativeCaptionRoot ??
        (siteId === 'netflix' ? target.player : undefined),
      target.nativeCueVideos,
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
        onAiRetranslateBottom: () => this.#retranslateBottomWithAi(),
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
    chrome.storage.onChanged.addListener(this.#onStorageChanged);
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

    this.#nativeCaptions.setCueVideos(target.nativeCueVideos ?? []);

    this.#overlayView.reanchor(target.player);
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
        ? uiMessage('status.waitingContent', { site: this.#siteLabel })
        : uiMessage('status.contentChanged', { site: this.#siteLabel });
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
    chrome.storage.onChanged.removeListener(this.#onStorageChanged);
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
    const [stored, languagePair, uiLanguage] = await Promise.all([
      chrome.storage.local.get(this.#storageKey),
      loadLanguagePairPreference(chrome.storage.local),
      loadUiLanguage(chrome.storage.local, browserLanguages()),
    ]);
    if (this.#destroyed || revision !== this.#interactionRevision) return;

    this.#languagePairPreference = languagePair.preference;
    this.#hasSavedLanguagePairPreference = languagePair.stored;
    this.#topLanguage = languagePair.preference.top;
    this.#bottomLanguage = languagePair.preference.bottom;
    this.#uiLanguage = uiLanguage;
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
        ? uiMessage('status.disabledLoadFake')
        : uiMessage('status.disabledLoadOfficial');
      this.#render();
    }
  }

  #loadTracks(): void {
    if (this.#adapter === undefined) {
      this.#requestFakeData();
      return;
    }

    if (!this.#canLoadTracks()) {
      this.#status = uiMessage('status.waitingContent', {
        site: this.#siteLabel,
      });
      this.#render();
      return;
    }

    this.#clearTrackData();
    this.#state = reducePlaybackLifecycle(this.#state, {
      type: 'tracks-loading',
    });
    this.#bindAdapterGeneration();
    this.#status = uiMessage('status.enumerating', {
      site: this.#siteLabel,
    });
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
      ? uiMessage('status.readingOfficial')
      : uiMessage('status.waitingFakeMain');
    this.#render();
    postDuetSubMessage(
      requestFakeData(
        this.#siteId,
        this.#requestId,
        this.#playbackTimeMs(),
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
    this.#readyStatus = uiMessage('status.readyDefault');
    this.#receivedTopTrackId = undefined;
    this.#receivedBottomTrackId = undefined;
    this.#synchronizerState = undefined;
    this.#translationPlan = undefined;
    this.#bottomRetranslationPlan = undefined;
    this.#officialPairSnapshot = undefined;
  }

  #retranslateBottomWithAi(): void {
    const plan = this.#bottomRetranslationPlan;
    if (plan === undefined) {
      this.#status = uiMessage('status.noRetranslate');
      this.#render();
      return;
    }
    this.#cancelTranslations();
    this.#translationPlan = plan;
    const revision = ++this.#acquisitionRevision;
    this.#status = uiMessage('status.retranslating');
    this.#render();
    void this.#translatePlan(
      {
        contentGeneration: this.#state.contentGeneration,
        clockGeneration: this.#state.clockGeneration,
        selectionGeneration: this.#state.selectionGeneration,
      },
      revision,
      true,
      true,
    );
  }

  #openLanguagePairChooser(): void {
    if (this.#tracks.length > 0) {
      this.#render();
      return;
    }
    this.#status = uiMessage('status.readingOfficial');
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
    if (
      this.#bottomMachineTranslated &&
      this.#restoreOfficialPairSnapshot()
    ) {
      return;
    }
    this.#state = reducePlaybackLifecycle(this.#state, {
      type: 'reload-tracks',
    });
    this.#clearTrackData();
    this.#bindAdapterGeneration();

    if (!this.#state.enabled) {
      this.#status = uiMessage('status.disabledReloadCleared');
      this.#render();
      return;
    }
    if (this.#adapter === undefined) {
      this.#requestFakeData();
      return;
    }
    if (!this.#canLoadTracks()) {
      this.#status = uiMessage('status.waitingContent', {
        site: this.#siteLabel,
      });
      this.#render();
      return;
    }

    this.#status = pairMessage(
      'status.reloadingPair',
      this.#languagePairPreference,
    );
    this.#render();
    this.#adapter.start();
  }

  #rememberOfficialPair(): void {
    const plan = this.#bottomRetranslationPlan;
    if (
      plan === undefined ||
      this.#topCues.length === 0 ||
      this.#bottomCues.length === 0 ||
      this.#topMachineTranslated ||
      this.#bottomMachineTranslated
    ) {
      this.#officialPairSnapshot = undefined;
      return;
    }
    this.#officialPairSnapshot = {
      contentIdentity: this.#state.contentIdentity,
      topCues: this.#topCues,
      bottomCues: this.#bottomCues,
      topLanguage: this.#topLanguage,
      bottomLanguage: this.#bottomLanguage,
      bottomRetranslationPlan: plan,
      readyStatus: this.#readyStatus,
    };
  }

  #restoreOfficialPairSnapshot(): boolean {
    const snapshot = this.#officialPairSnapshot;
    if (
      snapshot === undefined ||
      snapshot.contentIdentity !== this.#state.contentIdentity
    ) {
      return false;
    }
    this.#cancelTranslations();
    this.#topCues = snapshot.topCues;
    this.#bottomCues = snapshot.bottomCues;
    this.#topLanguage = snapshot.topLanguage;
    this.#bottomLanguage = snapshot.bottomLanguage;
    this.#topMachineTranslated = false;
    this.#bottomMachineTranslated = false;
    this.#translationPlan = undefined;
    this.#bottomRetranslationPlan = snapshot.bottomRetranslationPlan;
    this.#synchronizerState = undefined;
    this.#readyStatus = snapshot.readyStatus;
    this.#status = snapshot.readyStatus;
    this.#render();
    return true;
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
    this.#status = pairMessage('status.switchingPair', preference);
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
      this.#status = uiMessage('status.savePairFailed');
      this.#render();
      return;
    }
    if (!this.#state.enabled) {
      this.#status = pairMessage('status.disabledSelectedPair', preference);
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
    const youtubeFallback =
      this.#siteId === 'youtube' &&
      this.#hasSavedLanguagePairPreference &&
      isDefaultLanguagePair(this.#languagePairPreference) &&
      resolveOfficialPair({
        siteId: this.#siteId,
        tracks,
        preference: this.#languagePairPreference,
      }).kind !== 'ready';
    if (
      !youtubeFallback &&
      (this.#hasSavedLanguagePairPreference || this.#siteId === 'max')
    ) {
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
      if (
        pair.reason === 'bottom-missing' &&
        pair.top !== undefined &&
        bottomRetranslationTargetLanguage(
            this.#languagePairPreference.bottom,
          ) !== undefined
      ) {
        await this.#acquireTopForBottomRetranslation(
          generatedTracks,
          pair.top,
          interactionRevision,
        );
        return;
      }
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
    this.#status = pairMessage(
      'status.acquiringPair',
      this.#languagePairPreference,
    );
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
      this.#bottomRetranslationPlan = createBottomRetranslationPlan({
        topTrack: cues.top,
        bottomLanguage: cues.bottom.language,
        topCues: this.#topCues,
      });
      this.#synchronizerState = undefined;
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-ready',
      });
      const resolvedPreference: LanguagePairPreference = {
        version: 1,
        top: cues.top.language,
        bottom: cues.bottom.language,
      };
      this.#readyStatus = maxCues?.policy ===
          'english-cc-traditional-chinese'
        ? pairMessage('status.pairAligned', resolvedPreference)
        : pairMessage('status.pairReady', resolvedPreference);
      this.#status = this.#readyStatus;
      this.#rememberOfficialPair();
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
      this.#status = uiMessage('status.selectedPairFailed');
      this.#render();
    }
  }

  async #acquireTopForBottomRetranslation(
    generatedTracks: GenerationBound<readonly TrackInfo[]>,
    topTrack: TrackInfo,
    interactionRevision: number,
  ): Promise<void> {
    const adapter = this.#adapter;
    if (adapter === undefined) return;
    const acquisitionRevision = ++this.#acquisitionRevision;
    this.#status = uiMessage('status.acquiringTopForAi');
    this.#render();

    try {
      const fetched = await adapter.fetchTrack(topTrack);
      const topCues = acceptPlaybackGeneration(
        this.#state,
        bindPlaybackGeneration(generatedTracks.generation, fetched),
      );
      if (
        topCues === undefined ||
        this.#destroyed ||
        !this.#state.enabled ||
        interactionRevision !== this.#interactionRevision ||
        acquisitionRevision !== this.#acquisitionRevision
      ) {
        return;
      }
      const plan = createBottomRetranslationPlan({
        topTrack,
        bottomLanguage: this.#languagePairPreference.bottom,
        topCues,
      });
      if (plan === undefined) {
        throw new Error('Unsupported AI bottom retranslation target');
      }

      this.#topCues = topCues;
      this.#bottomCues = [];
      this.#topLanguage = topTrack.language;
      this.#bottomLanguage = this.#languagePairPreference.bottom;
      this.#topMachineTranslated = false;
      this.#bottomMachineTranslated = false;
      this.#bottomRetranslationPlan = plan;
      this.#synchronizerState = undefined;
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-ready',
      });
      this.#readyStatus = uiMessage('status.topReadyForAi');
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
      console.warn(
        '[DuetSub] AI bottom source acquisition failed',
        error,
      );
      this.#clearSelectedPair();
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-loading',
      });
      this.#bindAdapterGeneration();
      this.#status = uiMessage('status.selectedPairFailed');
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
      ? decideYoutubeSubtitleSources(tracks)
      : decideSubtitleSources(tracks);
    if (decision.english === undefined || decision.chinese === undefined) {
      this.#status = uiMessage('status.noEnglishChinese');
      this.#render();
      return;
    }

    const acquisitionRevision = ++this.#acquisitionRevision;
    this.#status = uiMessage('status.acquiringOfficial');
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
      this.#bottomRetranslationPlan =
        decision.english.kind === 'official'
          ? createBottomRetranslationPlan({
              topTrack: decision.english.track,
              bottomLanguage: 'zh-Hant',
              topCues: englishCues,
            })
          : undefined;
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
          ? uiMessage('status.openccReady')
          : accepted.english.kind === 'official' &&
              accepted.chinese.kind === 'official'
            ? selectedTrackStatus(
                accepted.english.trackSource,
                accepted.chinese.trackSource,
              )
            : uiMessage('status.englishChineseReady');
        this.#status = this.#readyStatus;
        this.#rememberOfficialPair();
      } else {
        this.#translationPlan = {
          source: mt.value.source,
          trackId: mt.value.trackId,
          target: mt.side,
          targetLanguage: mt.value.targetLanguage,
        };
        this.#readyStatus = uiMessage('status.officialMtReady');
        this.#status = uiMessage('status.officialTranslating');
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
    this.#status = uiMessage('status.playbackReset', {
      site: this.#siteLabel,
    });
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
      ? uiMessage('status.adPaused')
      : this.#state.suspension === 'none'
        ? this.#readyStatus
        : uiMessage('status.waitingClock');
    this.#render();
    if (
      !active &&
      needsTrackAcquisition(this.#state) &&
      this.#canLoadTracks()
    ) {
      this.#loadTracks();
    }
  };

  readonly #onStorageChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (
      areaName !== 'local' ||
      changes[UI_LANGUAGE_STORAGE_KEY] === undefined
    ) {
      return;
    }
    this.#uiLanguage = resolveUiLanguage(
      changes[UI_LANGUAGE_STORAGE_KEY].newValue,
      browserLanguages(),
    );
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
      if (!this.#state.enabled) {
        this.#status = catalogStatus(message.tracks);
        this.#render();
        return;
      }
      this.#status = uiMessage('status.fakeTracksReceived', {
        count: message.tracks.length,
      });
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
      this.#readyStatus = pairMessage(
        'status.fakeDataReady',
        this.#languagePairPreference,
      );
      this.#status = this.#readyStatus;
    } else {
      this.#state = reducePlaybackLifecycle(this.#state, {
        type: 'tracks-loading',
      });
      this.#status = pair.reason === 'top-empty' ||
          pair.reason === 'bottom-empty' ||
          pair.reason === 'both-empty'
        ? pairMessage(
            'status.waitingFakePair',
            this.#languagePairPreference,
          )
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
    this.#status = uiMessage('status.seekingPaused');
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
        : uiMessage('status.notAcquired');
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
    this.#status = uiMessage('status.videoClockReplaced', {
      site: this.#siteLabel,
    });
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
    replaceBottom = false,
  ): Promise<void> {
    const plan = this.#translationPlan;
    if (plan === undefined) return;
    const batches = scheduleTranslationBatches(
      plan.source,
      this.#playbackTimeMs(),
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
        promptProfile: this.#siteId === 'youtube' ? 'youtube' : 'film-tv',
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
          this.#status = uiMessage('status.configureTranslation');
          this.#render();
        }
        return;
      }
      if (response.status === 'missing-permission') {
        if (!this.#translationHintShown) {
          this.#translationHintShown = true;
          this.#status = uiMessage('status.authorizeTranslation');
          this.#render();
        }
        return;
      }
      if (response.status === 'aborted') return;
      if (replaceBottom) {
        this.#bottomCues = [];
        this.#bottomLanguage = plan.targetLanguage;
        this.#bottomMachineTranslated = true;
        this.#readyStatus = uiMessage('status.officialMtReady');
        this.#synchronizerState = undefined;
        replaceBottom = false;
      }
      hadFailure ||= response.status === 'failed';
      this.#mergeTranslatedCues(plan.target, response.cues);
      this.#status = response.status === 'ok'
        ? uiMessage('status.mtTranslating')
        : uiMessage('status.partialTranslationFailed');
      this.#render();
    }
    this.#status = hadFailure
      ? uiMessage('status.partialTranslationFailed')
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
    const result = mergeTranslatedCues(current, cues);
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
        this.#siteId !== 'netflix' &&
        this.#siteId !== 'disneyplus') ||
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
    const playbackTimeMs = this.#playbackTimeMs();
    const synchronized = active
      ? synchronizeCues(
          this.#topCues,
          this.#bottomCues,
          playbackTimeMs,
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
      this.#status(this.#uiLanguage),
      this.#uiLanguage,
      createOfficialTrackCatalog(this.#tracks),
      {
        version: 1,
        top: this.#topLanguage,
        bottom: this.#bottomLanguage,
      },
    );
  }

  #playbackTimeMs(): number {
    return resolvePlaybackTimeMs(this.#adapter, this.video);
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
      readonly targetLanguage: TranslationTargetLanguage;
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

function isDefaultLanguagePair(
  preference: LanguagePairPreference,
): boolean {
  return preference.top === DEFAULT_LANGUAGE_PAIR_PREFERENCE.top &&
    preference.bottom === DEFAULT_LANGUAGE_PAIR_PREFERENCE.bottom;
}

function selectedTrackStatus(
  english: TrackInfo['source'],
  chinese: TrackInfo['source'],
): LocalizedText {
  return (language) =>
    `${
      sourceLabel(language, english, 'language.english')
    } + ${
      sourceLabel(language, chinese, 'language.traditionalChinese')
    } · 100%`;
}

function sourceLabel(
  uiLanguage: UiLanguage,
  source: TrackInfo['source'],
  languageKey: 'language.english' | 'language.traditionalChinese',
): string {
  const language = translate(uiLanguage, languageKey);
  switch (source) {
    case 'official':
      return translate(uiLanguage, 'source.official', { language });
    case 'asr':
      return translate(uiLanguage, 'source.asr', { language });
    case 'platform-mt':
      return translate(uiLanguage, 'source.platformMt', { language });
  }
}

function acquisitionErrorStatus(error: unknown): LocalizedText {
  if (
    error instanceof Error &&
    error.message.includes('手動開啟一次 YouTube 字幕')
  ) {
    return uiMessage('status.youtubeEnableCaptions');
  }
  return uiMessage('status.acquisitionFailed');
}

function catalogStatus(tracks: readonly TrackInfo[]): LocalizedText {
  const catalog = createOfficialTrackCatalog(tracks);
  return catalog.length === 0
    ? uiMessage('status.noOfficialCaptions')
    : (language) =>
      translate(language, 'status.available', {
        labels: catalog.map(({ label }) => label).join(
          language === 'en' ? ', ' : '、',
        ),
      });
}

function pairLabel(
  uiLanguage: UiLanguage,
  preference: LanguagePairPreference,
): string {
  return translate(uiLanguage, 'pair.label', {
    top: languageDisplayName(uiLanguage, preference.top),
    bottom: languageDisplayName(uiLanguage, preference.bottom),
  });
}

function unavailablePairStatus(
  reason: OfficialPairUnavailableReason,
  preference: LanguagePairPreference,
): LocalizedText {
  switch (reason) {
    case 'same-language':
      return uiMessage('status.sameLanguage');
    case 'top-missing':
      return (language) =>
        translate(language, 'status.topMissing', {
          language: languageDisplayName(language, preference.top),
        });
    case 'bottom-missing':
      return (language) =>
        translate(language, 'status.bottomMissing', {
          language: languageDisplayName(language, preference.bottom),
        });
    case 'both-missing':
      return (language) =>
        translate(language, 'status.bothMissing', {
          pair: pairLabel(language, preference),
        });
    case 'ambiguous-language':
      return uiMessage('status.ambiguousLanguage');
  }
}

function uiMessage(
  key: UiMessageKey,
  values: Readonly<Record<string, string | number>> = {},
): LocalizedText {
  return (language) => translate(language, key, values);
}

function pairMessage(
  key: UiMessageKey,
  preference: LanguagePairPreference,
): LocalizedText {
  return (language) =>
    translate(language, key, {
      pair: pairLabel(language, preference),
    });
}

function browserLanguages(): readonly string[] {
  return [...navigator.languages, navigator.language];
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
    case 'disneyplus':
      return 'Disney+';
  }
}
