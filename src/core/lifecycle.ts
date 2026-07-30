export interface PlaybackGeneration {
  readonly contentGeneration: number;
  readonly clockGeneration: number;
  readonly selectionGeneration?: number;
}

export type PlaybackSuspension =
  | 'none'
  | 'seek-flush'
  | 'ad-suspended'
  | 'clock-reset'
  | 'reset';

export interface PlaybackLifecycleState extends PlaybackGeneration {
  readonly selectionGeneration: number;
  readonly enabled: boolean;
  readonly tracksReady: boolean;
  readonly suspension: PlaybackSuspension;
  readonly contentIdentity?: string;
}

export interface GenerationBound<T> {
  readonly generation: PlaybackGeneration;
  readonly value: T;
}

export type PlaybackLifecycleAction =
  | { readonly type: 'hydrate'; readonly enabled: boolean }
  | { readonly type: 'toggle' }
  | { readonly type: 'tracks-loading' }
  | { readonly type: 'tracks-ready' }
  | { readonly type: 'selection-changed' }
  | { readonly type: 'seeking' }
  | { readonly type: 'seeked' }
  | { readonly type: 'ad-entered' }
  | {
      readonly type: 'ad-exited';
      readonly programClockContinuous: boolean;
    }
  | { readonly type: 'video-replaced' }
  | { readonly type: 'video-ready' }
  | { readonly type: 'content-observed'; readonly identity: string }
  | { readonly type: 'reset-content' };

export const INITIAL_PLAYBACK_LIFECYCLE: PlaybackLifecycleState = {
  enabled: false,
  tracksReady: false,
  suspension: 'none',
  contentGeneration: 0,
  clockGeneration: 0,
  selectionGeneration: 0,
};

export function reducePlaybackLifecycle(
  state: PlaybackLifecycleState,
  action: PlaybackLifecycleAction,
): PlaybackLifecycleState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, enabled: action.enabled };
    case 'toggle':
      return { ...state, enabled: !state.enabled };
    case 'tracks-loading':
      return { ...state, tracksReady: false, suspension: 'reset' };
    case 'tracks-ready':
      return { ...state, tracksReady: true, suspension: 'none' };
    case 'selection-changed':
      return {
        ...state,
        tracksReady: false,
        suspension: 'reset',
        selectionGeneration: state.selectionGeneration + 1,
      };
    case 'seeking':
      return {
        ...state,
        clockGeneration: state.clockGeneration + 1,
        suspension: 'seek-flush',
      };
    case 'seeked':
      return {
        ...state,
        clockGeneration: state.clockGeneration + 1,
        suspension: state.tracksReady ? 'none' : 'reset',
      };
    case 'ad-entered':
      return {
        ...state,
        clockGeneration: state.clockGeneration + 1,
        suspension: 'ad-suspended',
      };
    case 'ad-exited':
      if (
        state.suspension !== 'ad-suspended' ||
        !action.programClockContinuous
      ) {
        return state;
      }
      return {
        ...state,
        clockGeneration: state.clockGeneration + 1,
        suspension: state.tracksReady ? 'none' : 'reset',
      };
    case 'video-replaced':
      return {
        ...state,
        tracksReady: false,
        clockGeneration: state.clockGeneration + 1,
        suspension: 'clock-reset',
      };
    case 'video-ready':
      if (state.suspension !== 'clock-reset') return state;
      return {
        ...state,
        clockGeneration: state.clockGeneration + 1,
        suspension: state.tracksReady ? 'none' : 'reset',
      };
    case 'content-observed':
      if (action.identity === state.contentIdentity) return state;
      return {
        ...state,
        contentIdentity: action.identity,
        tracksReady: false,
        suspension: 'reset',
        contentGeneration: state.contentGeneration + 1,
        clockGeneration: state.clockGeneration + 1,
      };
    case 'reset-content':
      return {
        ...state,
        contentIdentity: undefined,
        tracksReady: false,
        suspension: 'reset',
        contentGeneration: state.contentGeneration + 1,
        clockGeneration: state.clockGeneration + 1,
      };
  }
}

export function bindPlaybackGeneration<T>(
  state: PlaybackGeneration,
  value: T,
): GenerationBound<T> {
  return {
    generation: {
      contentGeneration: state.contentGeneration,
      clockGeneration: state.clockGeneration,
      selectionGeneration: state.selectionGeneration ?? 0,
    },
    value,
  };
}

export function acceptPlaybackGeneration<T>(
  state: PlaybackGeneration,
  response: GenerationBound<T>,
): T | undefined {
  return samePlaybackGeneration(state, response.generation)
    ? response.value
    : undefined;
}

export function samePlaybackGeneration(
  left: PlaybackGeneration,
  right: PlaybackGeneration,
): boolean {
  return left.contentGeneration === right.contentGeneration &&
    left.clockGeneration === right.clockGeneration &&
    (left.selectionGeneration ?? 0) === (right.selectionGeneration ?? 0);
}

export function isPlaybackOverlayActive(
  state: PlaybackLifecycleState,
): boolean {
  return state.enabled && state.tracksReady && state.suspension === 'none';
}

export function shouldHideNativeCaptions(
  state: PlaybackLifecycleState,
): boolean {
  return isPlaybackOverlayActive(state);
}

export function needsTrackAcquisition(
  state: PlaybackLifecycleState,
): boolean {
  return state.enabled && !state.tracksReady;
}
