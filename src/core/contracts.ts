import type { PlaybackGeneration } from './lifecycle';

export interface Cue {
  start: number;
  end: number;
  text: string;
  language: string;
  position?: 'top' | 'bottom';
}

export type OfficialTrackKind = 'subtitles' | 'closed-captions';

export interface TrackInfo {
  id: string;
  language: string;
  source: 'official' | 'asr' | 'platform-mt';
  label: string;
  kind: OfficialTrackKind;
  forcedOnly?: boolean;
}

export interface SiteAdapter {
  id: 'netflix' | 'primevideo' | 'max' | 'youtube';
  start(): void;
  onTracks(cb: (tracks: TrackInfo[]) => void): void;
  onCues(cb: (trackId: string, cues: Cue[]) => void): void;
  fetchTrack(track: TrackInfo): Promise<Cue[]>;
  bindGeneration?(generation: PlaybackGeneration): void;
  onAdState?(
    cb: (active: boolean, programClockContinuous: boolean) => void,
  ): void;
  onReset(
    cb: (reason: 'navigation' | 'episode' | 'seek-flush') => void,
  ): void;
}

export type SiteId = SiteAdapter['id'];
