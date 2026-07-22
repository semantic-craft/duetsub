export type ToggleSuspension = 'none' | 'seeking' | 'reset';

export interface ToggleState {
  readonly enabled: boolean;
  readonly tracksReady: boolean;
  readonly suspension: ToggleSuspension;
}

export type ToggleAction =
  | { readonly type: 'hydrate'; readonly enabled: boolean }
  | { readonly type: 'toggle' }
  | { readonly type: 'tracks-ready' }
  | { readonly type: 'suspend'; readonly reason: Exclude<ToggleSuspension, 'none'> }
  | { readonly type: 'resume' }
  | { readonly type: 'reset' };

export const INITIAL_TOGGLE_STATE: ToggleState = {
  enabled: false,
  tracksReady: false,
  suspension: 'none',
};

export function reduceToggle(
  state: ToggleState,
  action: ToggleAction,
): ToggleState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, enabled: action.enabled };
    case 'toggle':
      return { ...state, enabled: !state.enabled };
    case 'tracks-ready':
      return { ...state, tracksReady: true, suspension: 'none' };
    case 'suspend':
      return { ...state, suspension: action.reason };
    case 'resume':
      return { ...state, suspension: 'none' };
    case 'reset':
      return { ...state, tracksReady: false, suspension: 'reset' };
  }
}

export function isOverlayActive(state: ToggleState): boolean {
  return state.enabled && state.tracksReady && state.suspension === 'none';
}
