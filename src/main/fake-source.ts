import type { Cue, SiteId, TrackInfo } from '../core/contracts';
import {
  FIXED_OFFICIAL_PAIR_TRACER_PREFERENCE,
  resolveOfficialPair,
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
    postDuetSubMessage(tracksMessage(envelope, TRACKS));
    if (event.data.catalogOnly) return;
    const pair = createFakeOfficialPair(
      event.data.anchorTimeMs,
      event.data.preference,
    );
    if (pair === undefined) return;
    postDuetSubMessage(cuesMessage(envelope, pair.top));
    postDuetSubMessage(cuesMessage(envelope, pair.bottom));
  });
}

export function createFakeOfficialPair(
  anchorTimeMs: number,
  preference: LanguagePairPreference = FIXED_OFFICIAL_PAIR_PREFERENCE,
): FakeOfficialPair | undefined {
  const at = Math.max(0, Math.round(anchorTimeMs));
  const pair = resolveOfficialPair({
    siteId: 'youtube',
    tracks: TRACKS,
    preference,
  });
  if (pair.kind !== 'ready') return undefined;
  return {
    tracks: TRACKS,
    top: {
      role: 'top',
      trackId: pair.top.id,
      cues: cuesForTrack(pair.top, at),
      translation: 'official',
    },
    bottom: {
      role: 'bottom',
      trackId: pair.bottom.id,
      cues: cuesForTrack(pair.bottom, at),
      translation: 'official',
    },
  };
}

function cuesForTrack(track: TrackInfo, at: number): Cue[] {
  if (track.language === 'ja') {
    return [
      cue(at, at + 4_000, '一つの日本語字幕が二つの中国語字幕に重なります。', 'ja'),
      cue(at + 4_000, at + 6_000, '日本語だけの字幕です。', 'ja'),
      cue(at + 8_000, at + 12_000, '日本語は選択した段に表示されます。', 'ja'),
    ];
  }
  return [
    cue(at, at + 2_000, '一对多：第一条简中假字幕。', 'zh-Hans'),
    cue(at + 2_000, at + 4_000, '一对多：第二条简中假字幕。', 'zh-Hans'),
    cue(at + 6_000, at + 8_000, '单侧简中假字幕。', 'zh-Hans'),
    cue(at + 8_000, at + 12_000, '简中显示在选择的段位。', 'zh-Hans'),
  ];
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
