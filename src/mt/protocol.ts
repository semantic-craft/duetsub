import type { Cue } from '../core/contracts';
import type { PlaybackGeneration } from '../core/lifecycle';
import type { TranslationConfig } from './config';
import type { SubtitlePromptProfile } from './prompt';

export interface TranslateRequest {
  readonly channel: 'duetsub-mt';
  readonly version: 1;
  readonly type: 'translate';
  readonly requestId: string;
  readonly generation: PlaybackGeneration;
  readonly contentId: string;
  readonly trackId: string;
  readonly promptProfile: SubtitlePromptProfile;
  readonly targetLanguage: 'en' | 'zh-Hant';
  readonly cues: readonly Cue[];
  readonly skipCache?: boolean;
}

export interface CancelTranslationRequest {
  readonly channel: 'duetsub-mt';
  readonly version: 1;
  readonly type: 'cancel';
  readonly requestId: string;
}

export interface TestConnectionRequest {
  readonly channel: 'duetsub-mt';
  readonly version: 1;
  readonly type: 'test-connection';
  readonly config: TranslationConfig;
}

export interface OpenCcRequest {
  readonly channel: 'duetsub-mt';
  readonly version: 1;
  readonly type: 'opencc';
  readonly cues: readonly Cue[];
}

export type MtRequest =
  | TranslateRequest
  | CancelTranslationRequest
  | TestConnectionRequest
  | OpenCcRequest;

export function isMtRequest(value: unknown): value is MtRequest {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Partial<MtRequest>;
  return message.channel === 'duetsub-mt' && message.version === 1 &&
    (message.type === 'translate' || message.type === 'cancel' ||
      message.type === 'test-connection' || message.type === 'opencc');
}
