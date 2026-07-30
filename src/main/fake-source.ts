import type { Cue, SiteId, TrackInfo } from '../core/contracts';
import {
  FIXED_OFFICIAL_PAIR_TRACER_PREFERENCE,
  type LanguagePairPreference,
} from '../core/official-pair-selection';
import {
  cuesMessage,
  isDuetSubMessage,
  postDuetSubMessage,
  tracksMessage,
  type CuesMessage,
} from '../core/messages';

const TRACKS: readonly TrackInfo[] = [
  {
    id: 'official-tracer-ja',
    language: 'ja',
    source: 'official',
    label: 'Fake official Japanese',
    kind: 'subtitles',
  },
  {
    id: 'official-tracer-zh-Hans',
    language: 'zh-Hans',
    source: 'official',
    label: 'Fake official Simplified Chinese',
    kind: 'subtitles',
  },
];

export const FIXED_OFFICIAL_PAIR_PREFERENCE: LanguagePairPreference =
  FIXED_OFFICIAL_PAIR_TRACER_PREFERENCE;

type FakeCueMessage = Pick<
  CuesMessage,
  'role' | 'trackId' | 'cues' | 'translation'
>;

export interface FakeOfficialPair {
  readonly tracks: readonly TrackInfo[];
  readonly top: FakeCueMessage;
  readonly bottom: FakeCueMessage;
}

export function startFakeMainStub(siteId: SiteId): void {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window || !isDuetSubMessage(event.data)) return;
    if (
      event.data.direction !== 'isolated-to-main' ||
      event.data.type !== 'request-fake-data' ||
      event.data.siteId !== siteId
    ) {
      return;
    }

    const envelope = { siteId, requestId: event.data.requestId };
    const pair = createFakeOfficialPair(event.data.anchorTimeMs);

    postDuetSubMessage(tracksMessage(envelope, pair.tracks));
    postDuetSubMessage(cuesMessage(envelope, pair.top));
    postDuetSubMessage(cuesMessage(envelope, pair.bottom));
  });
}

export function createFakeOfficialPair(anchorTimeMs: number): FakeOfficialPair {
  const at = Math.max(0, Math.round(anchorTimeMs));
  return {
    tracks: TRACKS,
    top: {
      role: 'top',
      trackId: TRACKS[0].id,
      cues: [
        cue(at, at + 4_000, '一つの日本語字幕が二つの中国語字幕に重なります。', 'ja'),
        cue(at + 4_000, at + 6_000, '日本語だけの字幕です。', 'ja'),
        cue(at + 8_000, at + 12_000, '日本語は上段に表示されます。', 'ja'),
      ],
      translation: 'official',
    },
    bottom: {
      role: 'bottom',
      trackId: TRACKS[1].id,
      cues: [
        cue(at, at + 2_000, '一对多：第一条简中假字幕。', 'zh-Hans'),
        cue(at + 2_000, at + 4_000, '一对多：第二条简中假字幕。', 'zh-Hans'),
        cue(at + 6_000, at + 8_000, '单侧简中假字幕。', 'zh-Hans'),
        cue(
          at + 8_000,
          at + 12_000,
          '置顶时简中仍在下方。',
          'zh-Hans',
          'top',
        ),
      ],
      translation: 'official',
    },
  };
}

function cue(
  start: number,
  end: number,
  text: string,
  language: string,
  position?: Cue['position'],
): Cue {
  return position === undefined
    ? { start, end, text, language }
    : { start, end, text, language, position };
}
