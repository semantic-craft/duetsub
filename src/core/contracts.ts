import type { PlaybackGeneration } from './lifecycle';

export interface Cue {
  start: number;
  end: number;
  text: string;
  language: string;
  position?: 'top' | 'bottom';
}

export interface TrackInfo {
  id: string;
  language: string;
  source: 'official' | 'asr' | 'platform-mt';
  label: string;
}

export interface SiteAdapter {
  id: 'netflix' | 'primevideo' | 'max' | 'youtube';
  start(): void;
  onTracks(cb: (tracks: TrackInfo[]) => void): void;
  onCues(cb: (trackId: string, cues: Cue[]) => void): void;
  fetchTrack(track: TrackInfo): Promise<Cue[]>;
  bindGeneration?(generation: PlaybackGeneration): void;
  onReset(
    cb: (reason: 'navigation' | 'episode' | 'seek-flush') => void,
  ): void;
}

export type SiteId = SiteAdapter['id'];
